package rex

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const resumeState = "resume"

type processRow struct {
	parent, group, foreground int
	name                      string
}

func processTable(ctx context.Context) (map[int]processRow, error) {
	output, err := commandOutput(ctx, "ps", "-axo", "pid=,ppid=,pgid=,tpgid=,ucomm=")
	if err != nil {
		return nil, err
	}
	rows := map[int]processRow{}
	for line := range strings.SplitSeq(output, "\n") {
		f := strings.Fields(line)
		if len(f) < 5 {
			continue
		}
		pid, _ := strconv.Atoi(f[0])
		parent, _ := strconv.Atoi(f[1])
		group, _ := strconv.Atoi(f[2])
		foreground, _ := strconv.Atoi(f[3])
		rows[pid] = processRow{parent, group, foreground, strings.Join(f[4:], " ")}
	}
	return rows, nil
}

func onlyChild(rows map[int]processRow, parent int) (int, processRow) {
	pid := 0
	var row processRow
	for candidate, r := range rows {
		if r.parent != parent {
			continue
		}
		if pid != 0 {
			return 0, processRow{}
		}
		pid = candidate
		row = r
	}
	return pid, row
}

func shellCwd(ctx context.Context, pid int) string {
	cwd, err := commandOutput(ctx, "/usr/sbin/lsof", "-a", "-p", strconv.Itoa(pid), "-d", "cwd", "-Fn")
	if err != nil {
		return ""
	}
	paths := []string{}
	for line := range strings.SplitSeq(cwd, "\n") {
		if strings.HasPrefix(line, "n") {
			paths = append(paths, line[1:])
		}
	}
	if len(paths) != 1 {
		return ""
	}
	return paths[0]
}

func loginShell(ctx context.Context, info processInfo) process {
	if info.Child.Name != "login" {
		return process{}
	}
	rows, err := processTable(ctx)
	if err != nil {
		return process{}
	}
	pid := info.Child.PID
	for range 32 {
		child, row := onlyChild(rows, pid)
		if child == 0 {
			return process{}
		}
		pid = child
		if shell(row.name) {
			return verifiedShell(ctx, rows, pid, row)
		}
		if row.name != "login" && row.name != "atuin" {
			return process{}
		}
	}
	return process{}
}

func verifiedShell(ctx context.Context, rows map[int]processRow, pid int, row processRow) process {
	if row.group != row.foreground {
		return process{}
	}
	for _, r := range rows {
		if r.parent == pid {
			return process{}
		}
	}
	cwd := shellCwd(ctx, pid)
	if cwd == "" {
		return process{}
	}
	return process{PID: pid, Name: row.name, Cwd: cwd}
}

func shell(name string) bool {
	return name == "sh" || name == "bash" || name == "zsh" || name == "fish"
}

func sameDirectory(actual, expected string) bool {
	a, err := filepath.EvalSymlinks(actual)
	if err != nil {
		return false
	}
	b, err := filepath.EvalSymlinks(expected)
	return err == nil && a == b
}

func emptyPrompt(text string) bool {
	last := ""
	for line := range strings.SplitSeq(text, "\n") {
		if strings.TrimSpace(line) != "" {
			last = strings.TrimSpace(line)
		}
	}
	switch last {
	case "❯", "$", "%", "#", ">", "➜":
		return true
	}
	return regexp.MustCompile(`^(?:ba|z|fi)?sh-[0-9.]+[$#%]$`).MatchString(last)
}

func readyShell(ctx context.Context, c Client, sid, bid, cwd string) (int, error) {
	var info processInfo
	if err := c.terminal(ctx, sid, bid, "process", &info); err != nil {
		return 0, err
	}
	p := info.Foreground
	if p.Name == "login" {
		p = loginShell(ctx, info)
	}
	if !shell(p.Name) || p.PID <= 0 {
		return 0, fmt.Errorf("target is not an idle shell")
	}
	if !sameDirectory(p.Cwd, cwd) {
		return 0, fmt.Errorf("target directory differs from saved directory")
	}
	var modes struct {
		Screen string `json:"screen"`
	}
	if err := c.terminal(ctx, sid, bid, "modes", &modes); err != nil {
		return 0, err
	}
	if modes.Screen == "alternate" {
		return 0, fmt.Errorf("target has a fullscreen application")
	}
	var screen struct {
		Content string `json:"content"`
	}
	if err := c.terminal(ctx, sid, bid, "format", &screen); err != nil {
		return 0, err
	}
	if !emptyPrompt(screen.Content) {
		return 0, fmt.Errorf("cannot confirm an empty shell prompt; clear any draft")
	}
	return p.PID, nil
}

// ResumeEntry describes one existing pane. No replacement is ever created.
type ResumeEntry struct {
	State, Label, Session, Block string
	Agent                        Agent
	Pane                         pane
	Command                      []string
	ShellPID                     int
}

func hasTiledPane(v view, wid, bid string) bool {
	for _, w := range v.Windows {
		if w.ID != wid {
			continue
		}
		for _, l := range w.Layers {
			if l.Kind != "tiled" {
				continue
			}
			for _, b := range l.Blocks {
				if b.ID == bid {
					return true
				}
			}
		}
	}
	return false
}

func planPane(ctx context.Context, c Client, current view, w savedWindow, bid string, p pane, running map[string]location, label string) (ResumeEntry, error) {
	a := *p.Agent
	if loc, ok := running[identity(a)]; ok {
		return ResumeEntry{State: "running", Label: label, Session: loc.Session, Block: loc.Block, Agent: a}, nil
	}
	if !hasTiledPane(current, w.ID, bid) {
		return ResumeEntry{}, fmt.Errorf("%s: saved tiled pane is missing; nothing will be recreated", label)
	}
	entry := ResumeEntry{State: "unavailable", Label: label, Session: current.ID, Block: bid, Agent: a, Pane: p}
	command, err := resumeCommand(p)
	if err != nil {
		return entry, err
	}
	entry.Command = command
	entry.State = "unsafe"
	entry.ShellPID, err = readyShell(ctx, c, current.ID, bid, p.Cwd)
	if err != nil {
		return entry, err
	}
	entry.State = resumeState
	return entry, nil
}

func planSession(ctx context.Context, c Client, saved savedSession, running map[string]location, live map[string]bool) ([]ResumeEntry, []string, error) {
	var current view
	var err error
	if live[saved.ID] {
		current, err = c.view(ctx, saved.ID)
		if err != nil {
			return nil, nil, err
		}
	}
	entries := []ResumeEntry{}
	warnings := []string{}
	for _, w := range saved.Windows {
		for bid, p := range w.Panes {
			if p.Agent == nil {
				continue
			}
			label := saved.Label + " / " + w.Label
			e, err := planPane(ctx, c, current, w, bid, p, running, label)
			if e.State == "" {
				return nil, nil, err
			}
			if err != nil {
				warnings = append(warnings, label+": "+err.Error())
			}
			entries = append(entries, e)
		}
	}
	return entries, warnings, nil
}

func uniqueConversations(entries []ResumeEntry) error {
	seen := map[string]bool{}
	for _, e := range entries {
		key := identity(e.Agent)
		if seen[key] {
			return fmt.Errorf("same conversation appears in multiple panes; inspect before resuming")
		}
		seen[key] = true
	}
	return nil
}

func plan(ctx context.Context, c Client, s Store, snap snapshot) (serverStatus, []ResumeEntry, []string, error) {
	status, err := c.status(ctx)
	if err != nil {
		return status, nil, nil, err
	}
	if snap.Host == "" || snap.Host != status.Host {
		return status, nil, nil, fmt.Errorf("snapshot belongs to a different Rex host")
	}
	running, err := liveAgents(ctx, c, s, status)
	if err != nil {
		return status, nil, nil, err
	}
	sessions, err := c.sessions(ctx)
	if err != nil {
		return status, nil, nil, err
	}
	live := map[string]bool{}
	for _, v := range sessions {
		live[v.ID] = true
	}
	entries := []ResumeEntry{}
	warnings := append([]string{}, snap.Warnings...)
	for _, saved := range snap.Sessions {
		found, notes, err := planSession(ctx, c, saved, running, live)
		if err != nil {
			return status, nil, nil, err
		}
		entries = append(entries, found...)
		warnings = append(warnings, notes...)
	}
	return status, entries, warnings, uniqueConversations(entries)
}

func attemptKey(snap snapshot, e ResumeEntry) string {
	if snap.Tracked {
		return e.Block + "/" + e.Agent.Kind + "/" + e.Agent.Session
	}
	return e.Block
}

func quoteArgs(argv []string) string {
	out := make([]string, len(argv))
	for i, arg := range argv {
		out[i] = "'" + strings.ReplaceAll(arg, "'", "'\"'\"'") + "'"
	}
	return strings.Join(out, " ")
}

func printPlan(output io.Writer, entries []ResumeEntry, warnings []string) error {
	for _, e := range entries {
		if _, err := fmt.Fprintf(output, "%s: %s [%s]\n", e.Label, e.Agent.Kind, e.State); err != nil {
			return fmt.Errorf("write plan: %w", err)
		}
	}
	for _, w := range warnings {
		if _, err := fmt.Fprintln(output, "Warning:", w); err != nil {
			return fmt.Errorf("write warning: %w", err)
		}
	}
	return nil
}

func confirmRestore(input io.Reader, output io.Writer) (bool, error) {
	if _, err := fmt.Fprint(output, "Type restore to resume saved agents in existing panes: "); err != nil {
		return false, fmt.Errorf("write confirmation: %w", err)
	}
	scanner := bufio.NewScanner(input)
	if !scanner.Scan() {
		return false, fmt.Errorf("restore confirmation cancelled")
	}
	return strings.TrimSpace(scanner.Text()) == "restore", nil
}

func checkAttempts(snap snapshot, entries []ResumeEntry, journal map[string]attempt) error {
	for _, e := range entries {
		previous, ok := journal[attemptKey(snap, e)]
		if e.State == resumeState && ok && (!snap.Tracked || previous.State != "confirmed") {
			return fmt.Errorf("%s: previous launch already attempted or uncertain; inspect before retrying", e.Label)
		}
	}
	return nil
}

func launchOne(ctx context.Context, c Client, s Store, snap snapshot, e ResumeEntry, name string, journal map[string]attempt, log io.Writer) error {
	pid, err := readyShell(ctx, c, e.Session, e.Block, e.Pane.Cwd)
	if err != nil || pid != e.ShellPID {
		return fmt.Errorf("%s: target changed before delivery; resume stopped", e.Label)
	}
	journal[attemptKey(snap, e)] = attempt{Session: e.Session, Block: e.Block, Conversation: e.Agent.Session, State: "attempted"}
	if err = s.write(name, journal); err != nil {
		return err
	}
	data := "\x1b[200~ " + quoteArgs(e.Command) + "\x1b[201~\r"
	var reply struct {
		Bytes int `json:"bytes_written"`
	}
	err = c.Call(ctx, "com.superlogical.terminal.write", map[string]any{"session_id": e.Session, "block_id": e.Block, "args": map[string]string{"data": data}}, &reply)
	if err != nil {
		return fmt.Errorf("launch outcome uncertain; inspect pane before retrying: %w", err)
	}
	if reply.Bytes != len(data) {
		return fmt.Errorf("partial launch write; inspect pane before retrying")
	}
	return writeJSON(log, map[string]string{"event": "agent_write", "block_id": e.Block, "kind": e.Agent.Kind})
}

func launchEntries(ctx context.Context, c Client, s Store, snap snapshot, entries []ResumeEntry, name string, log io.Writer) error {
	return s.locked(ctx, func() error {
		journal := map[string]attempt{}
		if err := s.read(name, &journal); err != nil {
			return err
		}
		if err := checkAttempts(snap, entries, journal); err != nil {
			return err
		}
		for _, e := range entries {
			if e.State != resumeState {
				continue
			}
			if err := launchOne(ctx, c, s, snap, e, name, journal, log); err != nil {
				return err
			}
		}
		return nil
	})
}

func confirmObserved(snap snapshot, e ResumeEntry, journal map[string]attempt) {
	if e.State != "running" {
		return
	}
	key := attemptKey(snap, e)
	previous, ok := journal[key]
	if ok && previous.Session == e.Session && previous.Block == e.Block && previous.Conversation == e.Agent.Session {
		previous.State = "confirmed"
		journal[key] = previous
	}
}

func updateConfirmations(snap snapshot, entries []ResumeEntry, live map[string]location, journal map[string]attempt) int {
	pending := 0
	for _, e := range entries {
		confirmObserved(snap, e, journal)
		if e.State != resumeState {
			continue
		}
		loc, ok := live[identity(e.Agent)]
		if !ok || loc.Session != e.Session || loc.Block != e.Block {
			pending++
			continue
		}
		a := journal[attemptKey(snap, e)]
		a.State = "confirmed"
		journal[attemptKey(snap, e)] = a
	}
	return pending
}

func waitConfirmations(ctx context.Context, c Client, s Store, snap snapshot, status serverStatus, entries []ResumeEntry, name string) error {
	deadline := time.Now().Add(15 * time.Second)
	for {
		live, err := liveAgents(ctx, c, s, status)
		if err != nil {
			return err
		}
		pending := 0
		err = s.locked(ctx, func() error {
			journal := map[string]attempt{}
			if err := s.read(name, &journal); err != nil {
				return err
			}
			pending = updateConfirmations(snap, entries, live, journal)
			return s.write(name, journal)
		})
		if err != nil {
			return err
		}
		if pending == 0 {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("%d launches unconfirmed; inspect panes, no automatic retry", pending)
		}
		select {
		case <-ctx.Done():
			return fmt.Errorf("resume confirmation interrupted; inspect panes: %w", ctx.Err())
		case <-time.After(300 * time.Millisecond):
		}
	}
}

func runResume(ctx context.Context, c Client, s Store, snap snapshot, status serverStatus, entries []ResumeEntry, output io.Writer) error {
	if err := os.MkdirAll(filepath.Join(s.Root, "diagnostics"), 0o700); err != nil {
		return fmt.Errorf("create diagnostics: %w", err)
	}
	log, err := os.CreateTemp(filepath.Join(s.Root, "diagnostics"), "resume-*.jsonl")
	if err != nil {
		return fmt.Errorf("create resume diagnostic: %w", err)
	}
	defer log.Close() //nolint:errcheck // Diagnostics are secondary to the durable launch journal.
	if _, err = fmt.Fprintln(output, "Resume diagnostics:", log.Name()); err != nil {
		return fmt.Errorf("write diagnostic path: %w", err)
	}
	name := "resumes/" + snap.ID + "-" + status.Instance + ".json"
	if err = launchEntries(ctx, c, s, snap, entries, name, log); err != nil {
		return err
	}
	if err = waitConfirmations(ctx, c, s, snap, status, entries, name); err != nil {
		return err
	}
	if _, err = fmt.Fprintln(output, "Resume finished; all attempted launches confirmed."); err != nil {
		return fmt.Errorf("write result: %w", err)
	}
	return nil
}

// Workspace previews or resumes agents with confirmation and replay protection.
func Workspace(ctx context.Context, c Client, s Store, id string, restore, yes bool, input io.Reader, output io.Writer) error {
	snap, err := loadSnapshot(ctx, c, s, id)
	if err != nil {
		return err
	}
	status, entries, warnings, err := plan(ctx, c, s, snap)
	if err != nil {
		return err
	}
	if err = printPlan(output, entries, warnings); err != nil {
		return err
	}
	if !restore {
		return nil
	}
	if !yes {
		confirmed, err := confirmRestore(input, output)
		if err != nil {
			return err
		}
		if !confirmed {
			return nil
		}
		// Confirmation can take minutes. Recheck all conversations, including
		// agents started in other panes, before using the approved snapshot.
		status, entries, warnings, err = plan(ctx, c, s, snap)
		if err != nil {
			return err
		}
		if err = printPlan(output, entries, warnings); err != nil {
			return err
		}
	}
	return runResume(ctx, c, s, snap, status, entries, output)
}
