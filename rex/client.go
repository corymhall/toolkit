// Package rex implements local Rex agent messaging and conversation recovery.
package rex

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// Client addresses one explicit local Rex server.
type Client struct {
	Server string
	Binary string
}

// NewClient resolves the local connection without enabling server autostart.
func NewClient(server string) (Client, error) {
	if server == "" {
		server = os.Getenv("REX_SERVER")
	}
	if !strings.HasPrefix(server, "unix://") && !filepath.IsAbs(server) {
		return Client{}, fmt.Errorf("an explicit local Unix Rex server is required")
	}
	binary := "rex"
	if directory := os.Getenv("REX_BIN_DIR"); directory != "" {
		if !filepath.IsAbs(directory) {
			return Client{}, fmt.Errorf("REX_BIN_DIR must be absolute")
		}
		binary = filepath.Join(directory, "rex")
	}
	return Client{Server: server, Binary: binary}, nil
}

// Call invokes a bounded Rex API request. Mutating requests are never retried.
func (c Client) Call(ctx context.Context, method string, args, result any) error {
	data, err := json.Marshal(args)
	if err != nil {
		return fmt.Errorf("encode Rex request: %w", err)
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	command := exec.CommandContext(ctx, c.Binary, "--autostart=false", "--server", c.Server, "api", "call", method, string(data)) // #nosec G204 -- Explicit local CLI, structured argv, no shell.
	var stderr strings.Builder
	command.Stderr = &stderr
	output, err := command.Output()
	if err != nil {
		return fmt.Errorf("rex %s: %w: %s", method, err, stderr.String())
	}
	if result == nil {
		return nil
	}
	if err = json.Unmarshal(output, result); err != nil {
		return fmt.Errorf("decode Rex %s: %w", method, err)
	}
	return nil
}

type serverStatus struct {
	Host     string `json:"host_id"`
	Instance string `json:"instance_id"`
}
type process struct {
	PID  int    `json:"pid"`
	Name string `json:"name"`
	Cwd  string `json:"cwd"`
}
type processInfo struct {
	Foreground process   `json:"foreground"`
	Child      process   `json:"child"`
	Ancestors  []process `json:"ancestors"`
}

func (p processInfo) all() []process { return append([]process{p.Foreground, p.Child}, p.Ancestors...) }

type block struct {
	ID      string `json:"block_id"`
	Creator string `json:"creator_name"`
	Label   string `json:"label"`
}
type layer struct {
	Kind   string          `json:"kind"`
	Blocks []block         `json:"blocks"`
	Layout json.RawMessage `json:"layout"`
}
type window struct {
	ID      string  `json:"window_id"`
	Label   string  `json:"label"`
	Layers  []layer `json:"layers"`
	Focused string  `json:"focused_block_id"`
	Zoomed  string  `json:"zoomed_block_id"`
}
type view struct {
	ID       string   `json:"session_id"`
	Label    string   `json:"label"`
	Windows  []window `json:"windows"`
	Revision int      `json:"revision"`
	Active   string   `json:"active_window_id"`
}

func (c Client) status(ctx context.Context) (serverStatus, error) {
	var s serverStatus
	err := c.Call(ctx, "server.status", struct{}{}, &s)
	return s, err
}

func (c Client) sessions(ctx context.Context) ([]view, error) {
	var r struct {
		Sessions []view `json:"sessions"`
	}
	err := c.Call(ctx, "session.list", struct{}{}, &r)
	return r.Sessions, err
}

func (c Client) view(ctx context.Context, sid string) (view, error) {
	var v view
	err := c.Call(ctx, "session.view", map[string]string{"session_id": sid}, &v)
	return v, err
}

func (c Client) terminal(ctx context.Context, sid, bid, method string, result any) error {
	return c.Call(ctx, "com.superlogical.terminal."+method, map[string]any{"session_id": sid, "block_id": bid, "args": struct{}{}}, result)
}

func commandOutput(ctx context.Context, name string, args ...string) (string, error) {
	out, err := exec.CommandContext(ctx, name, args...).Output() // #nosec G204 -- Fixed ps/lsof callers, structured argv, no shell.
	if err != nil {
		return "", fmt.Errorf("%s: %w", name, err)
	}
	return strings.TrimSpace(string(out)), nil
}
