package rex

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/gofrs/flock"
)

// Store preserves the existing owner-private workspace JSON formats.
type Store struct{ Root string }

// NewStore resolves workspace storage at the runtime boundary.
func NewStore() Store {
	root := os.Getenv("REX_WORKSPACE_STATE_DIR")
	if root == "" {
		state := os.Getenv("XDG_STATE_HOME")
		if state == "" {
			home, _ := os.UserHomeDir()
			state = filepath.Join(home, ".local/state")
		}
		root = filepath.Join(state, "rex/workspace")
	}
	return Store{Root: root}
}

func (s Store) read(name string, value any) error {
	data, err := os.ReadFile(filepath.Join(s.Root, name)) // #nosec G304 -- Root is local runtime configuration; names are fixed or validated snapshot IDs.
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read %s: %w", name, err)
	}
	if err = json.Unmarshal(data, value); err != nil {
		return fmt.Errorf("decode %s: %w", name, err)
	}
	return nil
}

func (s Store) write(name string, value any) error {
	path := filepath.Join(s.Root, name)
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return fmt.Errorf("create state directory: %w", err)
	}
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return fmt.Errorf("encode state: %w", err)
	}
	file, err := os.CreateTemp(filepath.Dir(path), ".write-")
	if err != nil {
		return fmt.Errorf("create state file: %w", err)
	}
	defer os.Remove(file.Name()) //nolint:errcheck // Best effort cleanup of an already renamed temporary file.
	if _, err = file.Write(append(data, '\n')); err != nil {
		_ = file.Close()
		return fmt.Errorf("write state: %w", err)
	}
	if err = file.Sync(); err != nil {
		_ = file.Close()
		return fmt.Errorf("sync state: %w", err)
	}
	if err = file.Close(); err != nil {
		return fmt.Errorf("close state: %w", err)
	}
	if err = os.Rename(file.Name(), path); err != nil {
		return fmt.Errorf("replace state: %w", err)
	}
	return nil
}

func (s Store) locked(ctx context.Context, fn func() error) error {
	if err := ctx.Err(); err != nil {
		return fmt.Errorf("workspace operation cancelled: %w", err)
	}
	if err := os.MkdirAll(s.Root, 0o700); err != nil {
		return fmt.Errorf("create workspace state: %w", err)
	}
	lock := flock.New(filepath.Join(s.Root, ".lock"))
	ok, err := lock.TryLockContext(ctx, 50_000_000)
	if err != nil {
		return fmt.Errorf("lock workspace: %w", err)
	}
	if !ok {
		return fmt.Errorf("workspace lock unavailable")
	}
	defer lock.Close() //nolint:errcheck // Releasing the lock is best effort during unwinding.
	if err := ctx.Err(); err != nil {
		return fmt.Errorf("workspace operation cancelled: %w", err)
	}
	return fn()
}

// Agent identifies a persisted conversation, with optional live process
// identity.
type Agent struct {
	Kind       string `json:"kind"`
	Session    string `json:"session_id"`
	File       string `json:"file,omitempty"`
	PID        int    `json:"pid,omitempty"`
	Started    string `json:"started,omitempty"`
	RexSession string `json:"rex_session,omitempty"`
	Cwd        string `json:"cwd,omitempty"`
}
type trackedRecord struct {
	Cwd        string `json:"cwd"`
	RexSession string `json:"rex_session"`
	Updated    string `json:"updated_at"`
	Agent      Agent  `json:"agent"`
}
type tracking struct {
	Version int                                 `json:"version"`
	Hosts   map[string]map[string]trackedRecord `json:"hosts"`
}

func (s Store) tracking() (tracking, error) {
	t := tracking{Version: 1, Hosts: map[string]map[string]trackedRecord{}}
	err := s.read("tracked.json", &t)
	if err != nil {
		return t, err
	}
	if t.Version != 1 || t.Hosts == nil {
		return t, fmt.Errorf("unsupported tracking format")
	}
	return t, nil
}

type pane struct {
	Cwd   string `json:"cwd"`
	Label string `json:"label,omitempty"`
	Agent *Agent `json:"agent"`
}
type savedWindow struct {
	ID      string          `json:"id"`
	Label   string          `json:"label"`
	Layout  json.RawMessage `json:"layout,omitempty"`
	Panes   map[string]pane `json:"panes"`
	Focused string          `json:"focused,omitempty"`
	Zoomed  string          `json:"zoomed,omitempty"`
}
type savedSession struct {
	ID      string        `json:"id"`
	Label   string        `json:"label"`
	Active  string        `json:"active,omitempty"`
	Windows []savedWindow `json:"windows"`
}
type snapshot struct {
	Version  int            `json:"version"`
	ID       string         `json:"id"`
	Host     string         `json:"host_id"`
	Instance string         `json:"source_instance,omitempty"`
	SavedAt  string         `json:"saved_at,omitempty"`
	Tracked  bool           `json:"tracked,omitempty"`
	Sessions []savedSession `json:"sessions"`
	Warnings []string       `json:"warnings"`
}
type attempt struct {
	Session      string `json:"session_id"`
	Block        string `json:"block_id"`
	Conversation string `json:"conversation"`
	State        string `json:"state"`
}

func writeJSON(out io.Writer, value any) error {
	if err := json.NewEncoder(out).Encode(value); err != nil {
		return fmt.Errorf("write JSON: %w", err)
	}
	return nil
}
