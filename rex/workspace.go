package rex

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
)

func control(label string) bool   { return label == "Rex workspace control" || label == "Rex picker" }
func conversation(a Agent) *Agent { return &Agent{Kind: a.Kind, Session: a.Session, File: a.File} }
func sameSessions(before, after []view) bool {
	ids := map[string]bool{}
	for _, s := range before {
		ids[s.ID] = true
	}
	if len(ids) != len(after) {
		return false
	}
	for _, s := range after {
		if !ids[s.ID] {
			return false
		}
	}
	return true
}

func (c Client) snapshot(ctx context.Context, s Store, capture bool) (snapshot, error) {
	status, err := c.status(ctx)
	if err != nil {
		return snapshot{}, err
	}
	if status.Host == "" {
		return snapshot{}, fmt.Errorf("persistent Rex host identity required")
	}
	t, err := s.tracking()
	if err != nil {
		return snapshot{}, err
	}
	records := t.Hosts[status.Host]
	sum := sha256.Sum256([]byte(status.Host))
	id := "tracked-" + hex.EncodeToString(sum[:8])
	if capture {
		id = strings.ReplaceAll(uuid.NewString(), "-", "")
	}
	result := snapshot{Version: 1, ID: id, Host: status.Host, Instance: status.Instance, SavedAt: time.Now().UTC().Format(time.RFC3339Nano), Tracked: !capture, Sessions: []savedSession{}, Warnings: []string{}}
	sessions, err := c.sessions(ctx)
	if err != nil {
		return result, err
	}
	live, err := liveAgents(ctx, c, s, status)
	if err != nil {
		return result, err
	}
	byBlock := map[string]Agent{}
	for _, loc := range live {
		byBlock[loc.Block] = loc.Agent
	}
	seen := 0
	for _, session := range sessions {
		saved, warnings, count, err := c.snapshotSession(ctx, session.ID, capture, records, byBlock)
		if err != nil {
			return result, err
		}
		seen += count
		result.Warnings = append(result.Warnings, warnings...)
		if len(saved.Windows) > 0 {
			result.Sessions = append(result.Sessions, saved)
		}
	}
	result.warnSkipped(len(records) - seen)
	if len(result.Sessions) == 0 {
		return result, fmt.Errorf("no restorable agents or sessions found")
	}
	after, err := c.sessions(ctx)
	if err != nil {
		return result, err
	}
	if !sameSessions(sessions, after) {
		return result, fmt.Errorf("sessions changed during snapshot; retry")
	}
	return result, nil
}

func (c Client) snapshotSession(ctx context.Context, sid string, capture bool, records map[string]trackedRecord, agents map[string]Agent) (savedSession, []string, int, error) {
	v, err := c.view(ctx, sid)
	if err != nil {
		return savedSession{}, nil, 0, err
	}
	saved := savedSession{ID: v.ID, Label: v.Label, Active: v.Active, Windows: []savedWindow{}}
	warnings := []string{}
	count := 0
	for _, w := range v.Windows {
		if control(w.Label) {
			continue
		}
		sw, warning, err := c.snapshotWindow(ctx, sid, w, capture, records, agents)
		if err != nil {
			return saved, nil, 0, err
		}
		if warning != "" {
			warnings = append(warnings, warning)
		}
		if len(sw.Panes) > 0 {
			saved.Windows = append(saved.Windows, sw)
			count += len(sw.Panes)
		}
	}
	after, err := c.view(ctx, sid)
	if err != nil {
		return saved, nil, 0, err
	}
	if after.Revision != v.Revision {
		return saved, nil, 0, fmt.Errorf("workspace changed during snapshot; retry")
	}
	return saved, warnings, count, nil
}

func (c Client) snapshotWindow(ctx context.Context, sid string, w window, capture bool, records map[string]trackedRecord, agents map[string]Agent) (savedWindow, string, error) {
	sw := savedWindow{ID: w.ID, Label: w.Label, Focused: w.Focused, Zoomed: w.Zoomed, Panes: map[string]pane{}}
	tiled := []layer{}
	for _, l := range w.Layers {
		if l.Kind == "tiled" {
			tiled = append(tiled, l)
		}
	}
	if len(tiled) != 1 {
		return sw, "non-tiled window skipped: " + w.ID, nil
	}
	l := tiled[0]
	sw.Layout = l.Layout
	for _, b := range l.Blocks {
		if capture {
			p, err := c.capturePane(ctx, sid, b, agents)
			if err != nil {
				return sw, "", err
			}
			sw.Panes[b.ID] = p
			continue
		}
		if r, ok := records[b.ID]; ok {
			sw.Panes[b.ID] = pane{Cwd: r.Cwd, Agent: conversation(r.Agent)}
		}
	}
	warning := ""
	if capture && len(w.Layers) > 1 {
		warning = "floating layer omitted: " + w.ID
	}
	return sw, warning, nil
}

func (c Client) capturePane(ctx context.Context, sid string, b block, agents map[string]Agent) (pane, error) {
	if b.Creator != "com.superlogical.terminal" {
		return pane{}, fmt.Errorf("snapshot supports terminal blocks only")
	}
	var proc processInfo
	if err := c.terminal(ctx, sid, b.ID, "process", &proc); err != nil {
		return pane{}, err
	}
	p := pane{Label: b.Label}
	for _, process := range proc.all() {
		if process.Cwd != "" {
			p.Cwd = process.Cwd
			break
		}
	}
	if registered, ok := agents[b.ID]; ok {
		p.Agent = conversation(registered)
		if p.Cwd == "" {
			p.Cwd = registered.Cwd
		}
	}
	if p.Cwd == "" {
		var err error
		p.Cwd, err = c.reportedDirectory(ctx, sid, b.ID)
		if err != nil {
			return p, err
		}
	}
	if !filepath.IsAbs(p.Cwd) {
		return p, fmt.Errorf("no absolute working directory for %s; snapshot not saved", b.ID)
	}
	return p, nil
}

func (c Client) reportedDirectory(ctx context.Context, sid, bid string) (string, error) {
	var reply struct {
		Cwd string `json:"pwd"`
	}
	if err := c.terminal(ctx, sid, bid, "pwd", &reply); err != nil {
		return "", err
	}
	if !strings.HasPrefix(reply.Cwd, "file://") {
		return reply.Cwd, nil
	}
	uri, err := url.Parse(reply.Cwd)
	if err != nil {
		return "", fmt.Errorf("parse working directory: %w", err)
	}
	return uri.Path, nil
}

func (s *snapshot) warnSkipped(missing int) {
	if s.Tracked && missing > 0 {
		s.Warnings = append(s.Warnings, fmt.Sprintf("%d tracked panes are closed or not tiled; skipped", missing))
	}
}

// Save writes an immutable metadata backup. Rex restores the layout itself.
func Save(ctx context.Context, c Client, s Store) (string, error) {
	snap, err := c.snapshot(ctx, s, true)
	if err != nil {
		return "", err
	}
	err = s.locked(ctx, func() error {
		if err := s.write("snapshots/"+snap.ID+".json", snap); err != nil {
			return err
		}
		return s.write("latest.json", map[string]string{"id": snap.ID})
	})
	return snap.ID, err
}

func loadSnapshot(ctx context.Context, c Client, s Store, id string) (snapshot, error) {
	if id == "" {
		return c.snapshot(ctx, s, false)
	}
	if len(id) != 32 {
		return snapshot{}, fmt.Errorf("snapshot ID must contain 32 hex digits")
	}
	if _, err := hex.DecodeString(id); err != nil {
		return snapshot{}, fmt.Errorf("invalid snapshot ID: %w", err)
	}
	var snap snapshot
	if err := s.read("snapshots/"+id+".json", &snap); err != nil {
		return snap, err
	}
	if snap.Version != 1 || snap.ID != id {
		return snap, fmt.Errorf("missing snapshot or unsupported format")
	}
	return snap, nil
}

func resumeCommand(p pane) ([]string, error) {
	if info, err := os.Stat(p.Cwd); err != nil || !info.IsDir() {
		return nil, fmt.Errorf("working directory is missing: %s", p.Cwd)
	}
	if p.Agent == nil {
		return nil, fmt.Errorf("no saved conversation")
	}
	a := p.Agent
	if a.Kind != "pi" && a.Kind != "codex" {
		return nil, fmt.Errorf("unknown agent kind %q", a.Kind)
	}
	binary, err := exec.LookPath(a.Kind)
	if err != nil {
		return nil, fmt.Errorf("agent executable unavailable: %w", err)
	}
	if a.Kind == "pi" {
		return piResumeCommand(binary, a.File, a.Session)
	}
	if _, err := uuid.Parse(a.Session); err != nil {
		return nil, fmt.Errorf("invalid conversation: %w", err)
	}
	return []string{binary, "resume", a.Session}, nil
}

func piResumeCommand(binary, path, session string) ([]string, error) {
	if !filepath.IsAbs(path) {
		return nil, fmt.Errorf("pi session file path is not absolute")
	}
	file, err := os.Open(path) // #nosec G304 -- Absolute session file from verified saved conversation metadata.
	if err != nil {
		return nil, fmt.Errorf("open Pi session: %w", err)
	}
	defer file.Close() //nolint:errcheck // Read-only session file.
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 4096), 1024*1024)
	if !scanner.Scan() {
		return nil, fmt.Errorf("pi session header unavailable")
	}
	var header struct {
		Type string `json:"type"`
		ID   string `json:"id"`
	}
	if err = json.Unmarshal(scanner.Bytes(), &header); err != nil {
		return nil, fmt.Errorf("read Pi session: %w", err)
	}
	if header.Type != "session" || header.ID != session {
		return nil, fmt.Errorf("pi session file does not match saved conversation")
	}
	return []string{"/usr/bin/env", "PI_PROGRAM_STATUS=1", binary, "--session", path, "--tui-mode", "fullscreen"}, nil
}
