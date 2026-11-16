package rex

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/google/uuid"
)

func processStart(ctx context.Context, pid int) string {
	if pid <= 0 {
		return ""
	}
	out, _ := commandOutput(ctx, "ps", "-p", strconv.Itoa(pid), "-o", "lstart=")
	return out
}

func verifiedAgent(ctx context.Context, info processInfo, kind string, pid int) process {
	for _, p := range info.all() {
		if p.PID > 0 && p.Name == kind && (pid == 0 || p.PID == pid) {
			return p
		}
	}
	if info.Child.Name != "login" {
		return process{}
	}
	if pid == 0 {
		pid = os.Getppid()
	}
	return ancestryAgent(ctx, info, kind, pid)
}

func ancestryAgent(ctx context.Context, info processInfo, kind string, pid int) process {
	var found process
	for range 32 {
		if pid == info.Child.PID {
			return found
		}
		row, err := commandOutput(ctx, "ps", "-p", strconv.Itoa(pid), "-o", "ppid=,pgid=,tpgid=,ucomm=")
		fields := strings.Fields(row)
		if err != nil || len(fields) < 4 {
			return process{}
		}
		matches := filepath.Base(strings.Join(fields[3:], " ")) == kind && (fields[1] == fields[2] || fields[2] == "0")
		if matches && found.PID != 0 {
			return process{}
		}
		if matches {
			found = process{PID: pid, Name: kind}
		}
		pid, _ = strconv.Atoi(fields[0])
		if pid <= 1 {
			return process{}
		}
	}
	return process{}
}

func identity(a Agent) string { return a.Kind + "\x00" + a.Session }
func (s Store) remember(status serverStatus, bid string, a Agent) (bool, error) {
	if status.Host == "" {
		return false, nil
	}
	t, err := s.tracking()
	if err != nil {
		return false, err
	}
	if t.Hosts[status.Host] == nil {
		t.Hosts[status.Host] = map[string]trackedRecord{}
	}
	records := t.Hosts[status.Host]
	delete(records, bid)
	recorded := filepath.IsAbs(a.Cwd) && (a.Kind != "pi" || a.File != "")
	if recorded {
		for previous, r := range records {
			if identity(r.Agent) == identity(a) {
				delete(records, previous)
			}
		}
		records[bid] = trackedRecord{Cwd: a.Cwd, RexSession: a.RexSession, Updated: time.Now().UTC().Format(time.RFC3339Nano), Agent: Agent{Kind: a.Kind, Session: a.Session, File: a.File}}
	}
	return recorded, s.write("tracked.json", t)
}

// Register records verified Pi/Codex hooks without persisting prompts or
// credentials.
func Register(ctx context.Context, c Client, s Store, kind, sid, bid string, remove bool, input io.Reader) error {
	if sid == "" || bid == "" {
		return nil
	}
	var payload Agent
	if err := json.NewDecoder(io.LimitReader(input, 1<<20)).Decode(&payload); err != nil {
		return fmt.Errorf("decode registration: %w", err)
	}
	status, err := c.status(ctx)
	if err != nil {
		return err
	}
	return s.locked(ctx, func() error { return registerLocked(ctx, c, s, status, kind, sid, bid, remove, payload) })
}

func registerLocked(ctx context.Context, c Client, s Store, status serverStatus, kind, sid, bid string, remove bool, payload Agent) error {
	agents := map[string]Agent{}
	if err := s.read("agents.json", &agents); err != nil {
		return err
	}
	key := status.Instance + "/" + bid
	if remove {
		if old, ok := agents[key]; ok && old.PID == payload.PID {
			delete(agents, key)
			return s.write("agents.json", agents)
		}
		return nil
	}
	payload, err := validateRegistration(ctx, c, kind, sid, bid, payload)
	if err != nil {
		return err
	}
	agents[key] = payload
	if err = s.write("agents.json", agents); err != nil {
		return err
	}
	_, err = s.remember(status, bid, payload)
	return err
}

func validateRegistration(ctx context.Context, c Client, kind, sid, bid string, payload Agent) (Agent, error) {
	var info processInfo
	if err := c.terminal(ctx, sid, bid, "process", &info); err != nil {
		return payload, err
	}
	verified := verifiedAgent(ctx, info, kind, payload.PID)
	if verified.PID == 0 {
		return payload, fmt.Errorf("agent identity is not verified in the target pane")
	}
	started := processStart(ctx, verified.PID)
	if started == "" {
		return payload, fmt.Errorf("cannot establish process identity")
	}
	if payload.Session == "" || strings.IndexFunc(payload.Session, unicode.IsControl) >= 0 {
		return payload, fmt.Errorf("invalid conversation ID")
	}
	if kind == "codex" {
		if _, err := uuid.Parse(payload.Session); err != nil {
			return payload, fmt.Errorf("invalid Codex conversation: %w", err)
		}
		payload.File = ""
	}
	if payload.File != "" && !filepath.IsAbs(payload.File) {
		return payload, fmt.Errorf("pi session path must be absolute")
	}
	if payload.Cwd == "" {
		payload.Cwd = verified.Cwd
	}
	payload.Kind = kind
	payload.PID = verified.PID
	payload.Started = started
	payload.RexSession = sid
	return payload, nil
}

type location struct {
	Session, Block string
	Agent          Agent
}

func liveAgents(ctx context.Context, c Client, s Store, status serverStatus) (map[string]location, error) {
	agents := map[string]Agent{}
	if err := s.read("agents.json", &agents); err != nil {
		return nil, err
	}
	live := map[string]location{}
	for key, a := range agents {
		if !strings.HasPrefix(key, status.Instance+"/") || a.Started == "" || processStart(ctx, a.PID) != a.Started {
			continue
		}
		bid := strings.TrimPrefix(key, status.Instance+"/")
		var info processInfo
		if c.terminal(ctx, a.RexSession, bid, "process", &info) != nil {
			continue
		}
		if verifiedAgent(ctx, info, a.Kind, a.PID).PID != 0 {
			live[identity(a)] = location{a.RexSession, bid, a}
		}
	}
	return live, nil
}

// Forget removes the current host's durable reference for one pane.
func Forget(ctx context.Context, c Client, s Store, bid string) error {
	if bid == "" {
		return fmt.Errorf("supply a pane ID")
	}
	status, err := c.status(ctx)
	if err != nil {
		return err
	}
	if status.Host == "" {
		return fmt.Errorf("persistent Rex host identity required")
	}
	return s.locked(ctx, func() error {
		t, err := s.tracking()
		if err != nil {
			return err
		}
		delete(t.Hosts[status.Host], bid)
		return s.write("tracked.json", t)
	})
}

// Track backfills durable references only from current verified process
// registrations.
func Track(ctx context.Context, c Client, s Store) (int, error) {
	status, err := c.status(ctx)
	if err != nil {
		return 0, err
	}
	count := 0
	err = s.locked(ctx, func() error {
		// Read under the registration lock so backfill cannot replace a newer
		// conversation with metadata collected before acquiring the lock.
		agents, err := liveAgents(ctx, c, s, status)
		if err != nil {
			return err
		}
		for _, loc := range agents {
			if processStart(ctx, loc.Agent.PID) != loc.Agent.Started {
				continue
			}
			ok, err := s.remember(status, loc.Block, loc.Agent)
			if err != nil {
				return err
			}
			if ok {
				count++
			}
		}
		return nil
	})
	return count, err
}
