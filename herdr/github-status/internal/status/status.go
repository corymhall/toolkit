// Package status collects display-only Git/GitHub metadata. It never changes agents.
package status

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// Runner executes argv in cwd. It returns only stdout; errors retain command diagnostics.
type Runner func(context.Context, string, string, ...string) ([]byte, error)
type PR struct {
	Number         int    `json:"number"`
	Title          string `json:"title"`
	URL            string `json:"url"`
	State          string `json:"state"`
	IsDraft        bool   `json:"isDraft"`
	ReviewDecision string `json:"reviewDecision"`
	Checks         string `json:"checks"`
}

// Entry separates the latest attempt from successful Git and PR snapshots.
// Failures retain last-good values only while repository and branch identity match.
type Entry struct {
	Folder    string    `json:"folder"`
	CommonDir string    `json:"commonDir,omitempty"`
	Worktree  string    `json:"worktree,omitempty"`
	Repo      string    `json:"repo,omitempty"`
	Branch    string    `json:"branch,omitempty"`
	Dirty     *bool     `json:"dirty,omitempty"`
	PR        *PR       `json:"pr,omitempty"`
	CheckedAt time.Time `json:"checkedAt"`
	GitAt     time.Time `json:"gitAt,omitzero"`
	PRAt      time.Time `json:"prAt,omitzero"`
	GitError  string    `json:"gitError,omitempty"`
	PRError   string    `json:"prError,omitempty"`
}
type Cache struct {
	Version   int              `json:"version"`
	UpdatedAt time.Time        `json:"updatedAt"`
	Entries   map[string]Entry `json:"entries"`
}
type Collector struct {
	Run Runner
	Now func() time.Time
}

// Key matches the mod's pathKey(null, folder). Remote collection is not supported.
func Key(folder string) string {
	var b bytes.Buffer
	encoder := json.NewEncoder(&b)
	encoder.SetEscapeHTML(false) // Match the mod's JSON.stringify identity.
	_ = encoder.Encode([]any{nil, folder})
	return strings.TrimSuffix(b.String(), "\n")
}

type boundedOutput struct {
	data     []byte
	limit    int
	exceeded bool
}

func (b *boundedOutput) Write(p []byte) (int, error) {
	n := len(p)
	remaining := b.limit - len(b.data)
	if len(p) > remaining {
		b.exceeded = true
		p = p[:remaining]
	}
	b.data = append(b.data, p...)
	return n, nil
}

func Exec(ctx context.Context, cwd, program string, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, program, args...)
	cmd.Dir = cwd
	cmd.WaitDelay = time.Second // A descendant holding stdout must not defeat cancellation.
	// Avoid interactive authentication and make classified diagnostics stable.
	cmd.Env = append(os.Environ(), "GH_PROMPT_DISABLED=1", "GIT_TERMINAL_PROMPT=0", "LC_ALL=C")
	out, stderr := &boundedOutput{limit: 8 << 20}, &boundedOutput{limit: 64 << 10}
	cmd.Stdout, cmd.Stderr = out, stderr
	if err := cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, fmt.Errorf("%s: %w: %s", program, err, strings.TrimSpace(string(stderr.data)))
	}
	if out.exceeded || stderr.exceeded {
		return nil, fmt.Errorf("%s output exceeded collection limit", program)
	}
	return out.data, nil
}

// Discover only terminals referenced by the app, never other clients' terminals.
// Remote metadata is explicitly unavailable until a remote collector is installed.
func (c Collector) Discover(ctx context.Context) ([]string, error) {
	app, err := c.Run(ctx, "", "herdr-app", "ls")
	if err != nil {
		return nil, err
	}
	var layout struct {
		Spaces []struct {
			Machine *string `json:"machine"`
			Tabs    []struct {
				Terminals []struct {
					Terminal string `json:"terminal"`
				} `json:"terminals"`
			} `json:"tabs"`
		} `json:"spaces"`
	}
	if err = json.Unmarshal(app, &layout); err != nil {
		return nil, fmt.Errorf("decode app layout: %w", err)
	}
	managed := map[string]bool{}
	for _, s := range layout.Spaces {
		if s.Machine != nil {
			continue
		}
		for _, tab := range s.Tabs {
			for _, t := range tab.Terminals {
				managed[t.Terminal] = true
			}
		}
	}
	if len(managed) > 128 {
		return nil, errors.New("more than 128 app terminals; refusing unbounded refresh")
	}
	addresses := make([]string, 0, len(managed))
	for address := range managed {
		addresses = append(addresses, address)
	}
	sort.Strings(addresses)
	unique := map[string]bool{}
	for _, address := range addresses {
		// hc ls reports the launch cwd. get exposes the foreground process's
		// actual cwd, which is also what Herdr uses for pane/repository identity.
		out, err := c.Run(ctx, "", "hc", "get", address, "--json")
		if err != nil {
			return nil, fmt.Errorf("inspect terminal %s: %w", address, err)
		}
		var terminal struct {
			CWD        string `json:"cwd"`
			Foreground *struct {
				CWD string `json:"cwd"`
			} `json:"foreground"`
		}
		if err := json.Unmarshal(out, &terminal); err != nil {
			return nil, fmt.Errorf("decode terminal %s: %w", address, err)
		}
		folder := terminal.CWD
		if terminal.Foreground != nil && terminal.Foreground.CWD != "" {
			folder = terminal.Foreground.CWD
		}
		if filepath.IsAbs(folder) {
			unique[filepath.Clean(folder)] = true
		}
	}
	paths := make([]string, 0, len(unique))
	for p := range unique {
		paths = append(paths, p)
	}
	sort.Strings(paths)
	if len(paths) > 128 {
		return nil, errors.New("more than 128 folders; refusing unbounded refresh")
	}
	return paths, nil
}

func (c Collector) Probe(ctx context.Context, folder string, old Entry) Entry {
	now := c.Now()
	e := old
	e.Folder = folder
	e.CheckedAt = now
	e.GitError = ""
	e.PRError = ""
	common, err := c.Run(ctx, folder, "git", "rev-parse", "--path-format=absolute", "--git-common-dir")
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "not a git repository") {
			return Entry{Folder: folder, CheckedAt: now, GitAt: now, PRAt: now}
		}
		e.GitError = err.Error()
		return e
	}
	e.CommonDir = strings.TrimSpace(string(common))
	name := filepath.Base(e.CommonDir)
	if name == ".git" {
		name = filepath.Base(filepath.Dir(e.CommonDir))
	}
	e.Repo = strings.TrimSuffix(name, ".git")
	top, err := c.Run(ctx, folder, "git", "rev-parse", "--show-toplevel")
	if err != nil {
		e.GitError = err.Error()
		return e
	}
	e.Worktree = strings.TrimSpace(string(top))
	if old.CommonDir != e.CommonDir || old.Worktree != e.Worktree {
		e.PR = nil
		e.PRAt = time.Time{}
	}
	out, err := c.Run(ctx, folder, "git", "status", "--porcelain=v2", "--branch")
	if err != nil {
		e.GitError = err.Error()
	} else {
		dirty := false
		branch := ""
		for line := range strings.SplitSeq(string(out), "\n") {
			if value, ok := strings.CutPrefix(line, "# branch.head "); ok {
				branch = value
			} else if line != "" && !strings.HasPrefix(line, "# ") {
				dirty = true
			}
		}
		// An old PR must not be shown against a newly checked-out branch.
		if e.Branch != branch {
			e.PR = nil
			e.PRAt = time.Time{}
		}
		e.Branch = branch
		e.Dirty = &dirty
		e.GitAt = now
	}
	if e.GitError != "" {
		e.PRError = "PR not refreshed because Git status failed"
		return e
	}
	out, err = c.Run(ctx, folder, "gh", "pr", "view", "--json", "number,title,url,state,isDraft,reviewDecision,statusCheckRollup")
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "no pull requests found") {
			e.PR = nil
			e.PRAt = now
		} else {
			e.PRError = err.Error()
		}
		return e
	}
	var payload struct {
		PR
		Rollup []Check `json:"statusCheckRollup"`
	}
	if err = json.Unmarshal(out, &payload); err != nil {
		e.PRError = fmt.Sprintf("decode PR: %v", err)
		return e
	}
	if payload.Number <= 0 || (payload.State != "OPEN" && payload.State != "CLOSED" && payload.State != "MERGED") {
		e.PRError = "PR response is missing its number or lifecycle state"
		return e
	}
	payload.PR.Checks = Summarize(payload.Rollup)
	e.PR = &payload.PR
	e.PRAt = now
	return e
}

type Check struct {
	Status     string `json:"status"`
	State      string `json:"state"`
	Conclusion string `json:"conclusion"`
}

// Ported from the old metadata bridge's failure/running vocabulary. Unknown
// contexts never become green merely because another context succeeded.
func Summarize(checks []Check) string {
	if len(checks) == 0 {
		return "none"
	}
	pending, unknown := false, false
	for _, c := range checks {
		s := c.Conclusion
		if s == "" {
			s = c.State
		}
		if s == "" {
			s = c.Status
		}
		switch strings.ToUpper(s) {
		case "FAILURE", "FAILED", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE", "STALE":
			return "failed"
		case "PENDING", "IN_PROGRESS", "QUEUED", "EXPECTED", "WAITING", "REQUESTED":
			pending = true
		case "SUCCESS", "SUCCESSFUL", "SKIPPED", "NEUTRAL":
		default:
			unknown = true
		}
	}
	if pending {
		return "running"
	}
	if unknown {
		return "unknown"
	}
	return "passing"
}
func (c Collector) Refresh(ctx context.Context, old Cache) (Cache, error) {
	paths, err := c.Discover(ctx)
	if err != nil {
		return old, err
	}
	result := Cache{Version: 1, UpdatedAt: c.Now(), Entries: map[string]Entry{}}
	// Deduplicate worktree probes even when multiple terminals are in subfolders.
	probed := map[string]Entry{}
	for _, folder := range paths {
		if err := ctx.Err(); err != nil {
			return old, err
		}
		key := Key(folder)
		prior := old.Entries[key]
		// Resolve the current root rather than trusting an old cached path. A
		// folder can have moved or become a nested repository since last refresh.
		root, rootErr := c.Run(ctx, folder, "git", "rev-parse", "--show-toplevel")
		if rootErr == nil {
			if cached, ok := probed[strings.TrimSpace(string(root))]; ok {
				cached.Folder = folder
				result.Entries[key] = cached
				continue
			}
		}
		entry := c.Probe(ctx, folder, prior)
		result.Entries[key] = entry
		if entry.Worktree != "" {
			probed[entry.Worktree] = entry
		}
	}
	return result, nil
}
func Load(path string) (Cache, error) {
	b, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return Cache{Version: 1, Entries: map[string]Entry{}}, nil
	}
	if err != nil {
		return Cache{}, err
	}
	var c Cache
	err = json.Unmarshal(b, &c)
	if err == nil && c.Version != 1 {
		err = errors.New("unsupported cache version")
	}
	return c, err
}
func Save(path string, c Cache) error {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	b, err := json.Marshal(c)
	if err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(path), ".status-*")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	if _, err = f.Write(b); err != nil {
		f.Close()
		return err
	}
	if err = f.Sync(); err != nil {
		f.Close()
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	return os.Rename(f.Name(), path)
}
