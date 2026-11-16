package rex

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"syscall"
	"time"
	"unicode"

	"charm.land/huh/v2"
)

// Endpoint is a private Pi follow-up socket published by the rex-session
// extension.
type Endpoint struct {
	Session string `json:"session_id"`
	Socket  string `json:"socket"`
	Server  string `json:"server"`
	Cwd     string `json:"cwd"`
	PID     int    `json:"pid"`
}

// InputDirectory resolves Pi endpoint metadata at the runtime boundary.
func InputDirectory() string {
	if p := os.Getenv("REX_AGENT_INPUT_DIR"); p != "" {
		return p
	}
	state := os.Getenv("XDG_STATE_HOME")
	if state == "" {
		home, _ := os.UserHomeDir()
		state = filepath.Join(home, ".local/state")
	}
	return filepath.Join(state, "rex/agent-input")
}

func owned(info os.FileInfo) bool {
	stat, ok := info.Sys().(*syscall.Stat_t)
	return ok && int64(stat.Uid) == int64(os.Getuid())
}

// Endpoints discovers live same-user Pi sockets on the selected Rex server.
func Endpoints(directory, server string) ([]Endpoint, error) {
	paths, err := filepath.Glob(filepath.Join(directory, "*.json"))
	if err != nil {
		return nil, fmt.Errorf("list endpoints: %w", err)
	}
	found := []Endpoint{}
	for _, path := range paths {
		info, err := os.Lstat(path)
		if err != nil || !info.Mode().IsRegular() || !owned(info) {
			continue
		}
		data, err := os.ReadFile(path) // #nosec G304 -- Metadata is discovered in the caller-selected local state directory.
		if err != nil {
			continue
		}
		var e Endpoint
		if json.Unmarshal(data, &e) != nil || e.Server != server || e.PID <= 0 || e.Session == "" {
			continue
		}
		socket, err := os.Lstat(e.Socket)
		if err != nil || socket.Mode()&os.ModeSocket == 0 || !owned(socket) {
			continue
		}
		if syscall.Kill(e.PID, 0) != nil {
			continue
		}
		found = append(found, e)
	}
	slices.SortFunc(found, func(a, b Endpoint) int { return strings.Compare(a.Cwd+"/"+a.Session, b.Cwd+"/"+b.Session) })
	return found, nil
}

func validateMessage(text string) error {
	if strings.TrimSpace(text) == "" || len(text) > 64*1024 || strings.IndexFunc(text, func(r rune) bool { return unicode.IsControl(r) && r != '\n' && r != '\t' }) >= 0 {
		return fmt.Errorf("message must contain text without control characters and be at most 64 KiB")
	}
	return nil
}

// Send delivers exactly once. Any missing acknowledgement is an
// uncertain outcome.
func Send(ctx context.Context, e Endpoint, text string) error {
	if err := validateMessage(text); err != nil {
		return err
	}
	info, err := os.Lstat(e.Socket)
	if err != nil {
		return fmt.Errorf("inspect message socket: %w", err)
	}
	if !owned(info) || info.Mode()&os.ModeSocket == 0 {
		return fmt.Errorf("message endpoint is not an owned Unix socket")
	}
	connection, err := (&net.Dialer{Timeout: 5 * time.Second}).DialContext(ctx, "unix", e.Socket)
	if err != nil {
		return fmt.Errorf("connect to Pi: %w", err)
	}
	defer connection.Close() //nolint:errcheck // The acknowledgement determines delivery, not socket close.
	deadline := time.Now().Add(5 * time.Second)
	if limit, ok := ctx.Deadline(); ok && limit.Before(deadline) {
		deadline = limit
	}
	if err = connection.SetDeadline(deadline); err != nil {
		return fmt.Errorf("set socket deadline: %w", err)
	}
	data, err := json.Marshal(map[string]string{"session_id": e.Session, "text": text})
	if err != nil {
		return fmt.Errorf("encode message: %w", err)
	}
	uncertain := func(err error) error {
		return fmt.Errorf("delivery may have succeeded; inspect the target before retrying: %w", err)
	}
	if _, err = connection.Write(append(data, '\n')); err != nil {
		return uncertain(err)
	}
	scanner := bufio.NewScanner(io.LimitReader(connection, 8193))
	scanner.Buffer(make([]byte, 1024), 8192)
	if !scanner.Scan() {
		err = scanner.Err()
		if err == nil {
			err = io.ErrUnexpectedEOF
		}
		return uncertain(err)
	}
	var response struct {
		OK    bool   `json:"ok"`
		Error string `json:"error"`
	}
	if err = json.Unmarshal(scanner.Bytes(), &response); err != nil {
		return uncertain(err)
	}
	if !response.OK {
		return fmt.Errorf("pi rejected the message: %s", response.Error)
	}
	return nil
}

// Compose uses Huh's selection and multiline text fields instead of a
// custom editor.
func Compose(ctx context.Context, agents []Endpoint, input io.Reader, output io.Writer) error {
	if len(agents) == 0 {
		return fmt.Errorf("no live Pi agents found on this Rex server; reload the target Pi session")
	}
	options := make([]huh.Option[int], 0, len(agents))
	for i, a := range agents {
		options = append(options, huh.NewOption(fmt.Sprintf("%s [%s]", a.Cwd, a.Session), i))
	}
	var selected int
	var text string
	var confirmed bool
	form := huh.NewForm(huh.NewGroup(huh.NewSelect[int]().Title("Send a follow-up to Pi").Options(options...).Value(&selected), huh.NewText().Title("Message").CharLimit(64*1024).Value(&text), huh.NewConfirm().Title("Send message?").Value(&confirmed))).WithInput(input).WithOutput(output)
	if err := form.RunWithContext(ctx); err != nil {
		if errors.Is(err, huh.ErrUserAborted) {
			return nil
		}
		return fmt.Errorf("compose message: %w", err)
	}
	if !confirmed || strings.TrimSpace(text) == "" {
		return nil
	}
	return Send(ctx, agents[selected], text)
}
