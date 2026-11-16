package rex

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestResumeRejectsMismatchedPiFile rejects unrelated conversations.
func TestResumeRejectsMismatchedPiFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "conversation.jsonl")
	if err := os.WriteFile(path, []byte("{\"type\":\"session\",\"id\":\"different\"}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	_, err := piResumeCommand("/pi", path, "expected")
	if err == nil || !strings.Contains(err.Error(), "does not match") {
		t.Fatalf("mismatched conversation accepted: %v", err)
	}
}

// TestTrackingFollowsTheConversation prevents duplicate resume owners.
func TestTrackingFollowsTheConversation(t *testing.T) {
	store := Store{Root: t.TempDir()}
	status := serverStatus{Host: "host"}
	agent := Agent{Kind: "pi", Session: "conversation", File: "/session.jsonl", Cwd: "/project", RexSession: "session"}
	for _, bid := range []string{"first", "second"} {
		if _, err := store.remember(status, bid, agent); err != nil {
			t.Fatal(err)
		}
	}
	tracked, err := store.tracking()
	if err != nil {
		t.Fatal(err)
	}
	records := tracked.Hosts["host"]
	if len(records) != 1 || records["second"].Agent.Session != "conversation" {
		t.Fatalf("conversation has wrong owners: %#v", records)
	}
	agent.File = ""
	if _, err = store.remember(status, "second", agent); err != nil {
		t.Fatal(err)
	}
	tracked, err = store.tracking()
	if err != nil {
		t.Fatal(err)
	}
	if len(tracked.Hosts["host"]) != 0 {
		t.Fatal("unsaved Pi retained an older conversation")
	}
}

// TestUncertainLaunchCannotReplay preserves replay protection.
func TestUncertainLaunchCannotReplay(t *testing.T) {
	snap := snapshot{Tracked: true}
	entry := ResumeEntry{State: resumeState, Block: "pane", Agent: Agent{Kind: "pi", Session: "conversation"}}
	// This key is the persisted version-1 format, independent of the encoder.
	journal := map[string]attempt{"pane/pi/conversation": {State: "attempted"}}
	if err := checkAttempts(snap, []ResumeEntry{entry}, journal); err == nil {
		t.Fatal("uncertain launch was allowed to replay")
	}
	journal["pane/pi/conversation"] = attempt{State: "confirmed"}
	if err := checkAttempts(snap, []ResumeEntry{entry}, journal); err != nil {
		t.Fatal(err)
	}
	snap.Tracked = false
	journal = map[string]attempt{entry.Block: {State: "confirmed"}}
	if err := checkAttempts(snap, []ResumeEntry{entry}, journal); err == nil {
		t.Fatal("explicit snapshot was allowed to replay")
	}
}

// TestObservedRegistrationConfirmsAttempt unblocks a proven prior launch.
func TestObservedRegistrationConfirmsAttempt(t *testing.T) {
	snap := snapshot{Tracked: true}
	entry := ResumeEntry{State: "running", Session: "session", Block: "pane", Agent: Agent{Kind: "pi", Session: "conversation"}}
	const key = "pane/pi/conversation"
	journal := map[string]attempt{key: {Session: "session", Block: "pane", Conversation: "conversation", State: "attempted"}}
	updateConfirmations(snap, []ResumeEntry{entry}, nil, journal)
	if journal[key].State != "confirmed" {
		t.Fatal("live registration did not confirm prior attempt")
	}
	journal[key] = attempt{Session: "session", Block: "pane", Conversation: "different", State: "attempted"}
	updateConfirmations(snap, []ResumeEntry{entry}, nil, journal)
	if journal[key].State != "attempted" {
		t.Fatal("unrelated conversation confirmed prior attempt")
	}
}

// TestCancelledLockDoesNotRunMutation keeps cancelled operations read-only.
func TestCancelledLockDoesNotRunMutation(t *testing.T) {
	store := Store{Root: t.TempDir()}
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	called := false
	err := store.locked(ctx, func() error { called = true; return nil })
	if err == nil || called {
		t.Fatalf("cancelled lock entered mutation: called=%v err=%v", called, err)
	}
}
