package status

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestGitWorktreeIdentityAndDirtyState(t *testing.T) {
	root := t.TempDir()
	repo := filepath.Join(root, "example-provider")
	worktree := filepath.Join(root, "feature")
	git := func(dir string, args ...string) {
		t.Helper()
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		cmd.Env = append(os.Environ(), "GIT_CONFIG_GLOBAL=/dev/null", "GIT_CONFIG_SYSTEM=/dev/null")
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git: %v %s", err, out)
		}
	}
	git(root, "init", repo)
	git(repo, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "init")
	git(repo, "worktree", "add", "-b", "feature", worktree)
	c := Collector{Now: time.Now, Run: func(ctx context.Context, dir, program string, args ...string) ([]byte, error) {
		if program == "gh" {
			return nil, errors.New("no pull requests found for branch")
		}
		return Exec(ctx, dir, program, args...)
	}}
	first := c.Probe(context.Background(), worktree, Entry{})
	if first.Repo != "example-provider" || first.Branch != "feature" || first.Dirty == nil || *first.Dirty || first.GitError != "" || first.PRError != "" {
		t.Fatalf("bad worktree probe: %+v", first)
	}
	if err := os.WriteFile(filepath.Join(worktree, "untracked"), []byte("test"), 0600); err != nil {
		t.Fatal(err)
	}
	second := c.Probe(context.Background(), worktree, first)
	if second.Dirty == nil || !*second.Dirty {
		t.Fatal("untracked file not detected")
	}
}
func TestFailureKeepsLastGoodButBranchChangeClearsOldPR(t *testing.T) {
	now := time.Now()
	old := Entry{CommonDir: "/work/example/.git", Worktree: "/work/example", Branch: "feature", PR: &PR{Number: 42}, PRAt: now.Add(-time.Hour)}
	branch := "feature"
	c := Collector{Now: func() time.Time { return now }, Run: func(_ context.Context, _ string, program string, args ...string) ([]byte, error) {
		if program == "gh" {
			return nil, errors.New("authentication failed")
		}
		switch strings.Join(args, " ") {
		case "rev-parse --path-format=absolute --git-common-dir":
			return []byte("/work/example/.git"), nil
		case "rev-parse --show-toplevel":
			return []byte("/work/example"), nil
		default:
			return []byte("# branch.head " + branch + "\n"), nil
		}
	}}
	same := c.Probe(context.Background(), "/work/example", old)
	if same.PR == nil || same.PR.Number != 42 || same.PRError == "" || !same.PRAt.Equal(old.PRAt) {
		t.Fatalf("last good result lost: %+v", same)
	}
	branch = "different"
	changed := c.Probe(context.Background(), "/work/example", old)
	if changed.PR != nil || changed.PRError == "" {
		t.Fatalf("old PR attached to new branch: %+v", changed)
	}
	branch = "feature"
	old.CommonDir = "/work/former-repository/.git"
	replaced := c.Probe(context.Background(), "/work/example", old)
	if replaced.PR != nil {
		t.Fatalf("old PR attached to a different repository: %+v", replaced)
	}
}
func TestCheckUnknownAndPendingCannotBecomePassing(t *testing.T) {
	cases := []struct {
		checks []Check
		want   string
	}{
		{nil, "none"},
		{[]Check{{Conclusion: "SUCCESS"}, {Status: "COMPLETED"}}, "unknown"},
		{[]Check{{Conclusion: "SUCCESS"}, {Status: "IN_PROGRESS"}}, "running"},
		{[]Check{{State: "PENDING"}, {Conclusion: "FAILURE"}}, "failed"},
		{[]Check{{Conclusion: "SKIPPED"}, {State: "SUCCESS"}}, "passing"},
	}
	for _, tt := range cases {
		if got := Summarize(tt.checks); got != tt.want {
			t.Errorf("%+v: %s != %s", tt.checks, got, tt.want)
		}
	}
}
func TestDiscoverScopesToAppAndDeduplicatesFolders(t *testing.T) {
	var inspected []string
	c := Collector{Run: func(_ context.Context, _ string, program string, args ...string) ([]byte, error) {
		if program == "herdr-app" {
			return []byte(`{"spaces":[{"machine":null,"tabs":[{"terminals":[{"terminal":"t1"},{"terminal":"t2"}]}]},{"machine":"remote","tabs":[{"terminals":[{"terminal":"t3"}]}]}]}`), nil
		}
		if len(args) != 3 || args[0] != "get" {
			return nil, errors.New("expected bounded terminal inspection")
		}
		inspected = append(inspected, args[1])
		if args[1] == "t1" {
			return []byte(`{"cwd":"/home/user","foreground":{"cwd":"/work/example"}}`), nil
		}
		return []byte(`{"cwd":"/work/example","foreground":null}`), nil
	}}
	paths, err := c.Discover(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(paths) != 1 || paths[0] != "/work/example" {
		t.Fatalf("unscoped discovery: %v", paths)
	}
	if strings.Join(inspected, ",") != "t1,t2" {
		t.Fatalf("inspected terminals outside the app: %v", inspected)
	}
}
func TestFailedDiscoveryDoesNotReplaceCache(t *testing.T) {
	old := Cache{Version: 1, Entries: map[string]Entry{"old": {Repo: "example"}}}
	c := Collector{Run: func(context.Context, string, string, ...string) ([]byte, error) {
		return nil, errors.New("core offline")
	}}
	got, err := c.Refresh(context.Background(), old)
	if err == nil || got.Entries["old"].Repo != "example" {
		t.Fatal("failed discovery discarded snapshot")
	}
}
func TestColdRefreshSharesWorktreePRProbe(t *testing.T) {
	calls := 0
	c := Collector{Now: time.Now, Run: func(_ context.Context, _ string, program string, args ...string) ([]byte, error) {
		switch program {
		case "herdr-app":
			return []byte(`{"spaces":[{"machine":null,"tabs":[{"terminals":[{"terminal":"t1"},{"terminal":"t2"}]}]}]}`), nil
		case "hc":
			if args[1] == "t1" {
				return []byte(`{"cwd":"/work/example"}`), nil
			}
			return []byte(`{"cwd":"/work/example/sub"}`), nil
		case "gh":
			calls++
			return []byte(`{"number":42,"state":"OPEN","statusCheckRollup":[{"conclusion":"SUCCESS"}]}`), nil
		case "git":
			if strings.Contains(strings.Join(args, " "), "--git-common-dir") {
				return []byte("/work/example/.git"), nil
			}
			if args[0] == "status" {
				return []byte("# branch.head feature\n"), nil
			}
			return []byte("/work/example"), nil
		}
		return nil, errors.New("unexpected command")
	}}
	cache, err := c.Refresh(context.Background(), Cache{})
	if err != nil {
		t.Fatal(err)
	}
	if calls != 1 || len(cache.Entries) != 2 || cache.Entries[Key("/work/example/sub")].PR.Number != 42 {
		t.Fatalf("not deduplicated: calls=%d cache=%+v", calls, cache)
	}
}

func TestSnapshotRoundTripPermissionsAndVersion(t *testing.T) {
	path := filepath.Join(t.TempDir(), "cache", "status.json")
	want := Cache{Version: 1, Entries: map[string]Entry{Key("/work/example"): {Repo: "example"}}}
	if err := Save(path, want); err != nil {
		t.Fatal(err)
	}
	got, err := Load(path)
	if err != nil || len(got.Entries) != 1 {
		t.Fatalf("round trip: %v", err)
	}
	info, err := os.Stat(path)
	if err != nil || info.Mode().Perm() != 0600 {
		t.Fatal("cache must be private")
	}
	b, _ := json.Marshal(Cache{Version: 99})
	if err := os.WriteFile(path, b, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err = Load(path); err == nil {
		t.Fatal("unknown cache schema accepted")
	}
}
