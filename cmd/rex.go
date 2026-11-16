package cmd

import (
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/corymhall/toolkit/rex"
	"github.com/spf13/cobra"
)

func newRexCmd() *cobra.Command {
	var server string
	command := &cobra.Command{Use: "rex", Short: "Pi messaging and safe agent recovery in Rex"}
	command.PersistentFlags().StringVar(&server, "server", "", "Explicit local Rex server, defaults to REX_SERVER")
	command.AddCommand(newAgentsCmd(&server), newMessageCmd(&server), newWorkspaceCmd(&server))
	return command
}

func newAgentsCmd(server *string) *cobra.Command {
	return &cobra.Command{Use: "agents", Short: "List live Pi message endpoints as JSON", Args: cobra.NoArgs, RunE: func(cmd *cobra.Command, _ []string) error {
		c, err := rex.NewClient(*server)
		if err != nil {
			return err
		}
		entries, err := rex.Endpoints(rex.InputDirectory(), c.Server)
		if err != nil {
			return err
		}
		if err = json.NewEncoder(cmd.OutOrStdout()).Encode(entries); err != nil {
			return fmt.Errorf("write agents: %w", err)
		}
		return nil
	}}
}

func newMessageCmd(server *string) *cobra.Command {
	var target, file string
	command := &cobra.Command{Use: "message", Short: "Choose a Pi agent and compose a native follow-up", Args: cobra.NoArgs, RunE: func(cmd *cobra.Command, _ []string) error {
		c, err := rex.NewClient(*server)
		if err != nil {
			return err
		}
		entries, err := rex.Endpoints(rex.InputDirectory(), c.Server)
		if err != nil {
			return err
		}
		if target == "" {
			return rex.Compose(cmd.Context(), entries, cmd.InOrStdin(), cmd.OutOrStdout())
		}
		chosen, err := findEndpoint(entries, target)
		if err != nil {
			return err
		}
		text, err := readMessage(file, cmd.InOrStdin())
		if err != nil {
			return err
		}
		return rex.Send(cmd.Context(), chosen, string(text))
	}}
	command.Flags().StringVar(&target, "session", "", "Send to this exact Pi conversation instead of opening the form")
	command.Flags().StringVar(&file, "file", "", "Message file, or - for stdin, requires --session")
	command.MarkFlagsRequiredTogether("session", "file")
	return command
}

func findEndpoint(entries []rex.Endpoint, target string) (rex.Endpoint, error) {
	matches := []rex.Endpoint{}
	for _, e := range entries {
		if e.Session == target {
			matches = append(matches, e)
		}
	}
	if len(matches) != 1 {
		return rex.Endpoint{}, fmt.Errorf("expected one live endpoint for session %q, got %d", target, len(matches))
	}
	return matches[0], nil
}

func readMessage(path string, input io.Reader) ([]byte, error) {
	if path == "-" {
		text, err := io.ReadAll(io.LimitReader(input, 64*1024+1))
		if err != nil {
			return nil, fmt.Errorf("read stdin: %w", err)
		}
		return text, nil
	}
	text, err := os.ReadFile(path) // #nosec G304 -- Explicit user-selected message file.
	if err != nil {
		return nil, fmt.Errorf("read message file: %w", err)
	}
	return text, nil
}

func newWorkspaceCmd(server *string) *cobra.Command {
	command := &cobra.Command{Use: "workspace", Short: "Track and resume agent conversations without restoring layouts"}
	for _, kind := range []string{"register-pi", "register-codex", "unregister-pi"} {
		command.AddCommand(newRegistrationCmd(server, kind))
	}
	command.AddCommand(newForgetCmd(server), newTrackCmd(server), newSaveCmd(server), newResumeCmd(server, "preview"), newResumeCmd(server, "restore"))
	return command
}

func newRegistrationCmd(server *string, kind string) *cobra.Command {
	return &cobra.Command{Use: kind, Short: "Record a verified agent lifecycle hook", Args: cobra.NoArgs, RunE: func(cmd *cobra.Command, _ []string) error {
		if os.Getenv("REX_BLOCK") == "" {
			return nil
		}
		c, err := rex.NewClient(*server)
		if err != nil {
			return err
		}
		agent := "pi"
		if kind == "register-codex" {
			agent = "codex"
		}
		return rex.Register(cmd.Context(), c, rex.NewStore(), agent, os.Getenv("REX_SESSION"), os.Getenv("REX_BLOCK"), kind == "unregister-pi", cmd.InOrStdin())
	}}
}

func newForgetCmd(server *string) *cobra.Command {
	return &cobra.Command{Use: "forget [pane-id]", Short: "Forget the last conversation for a pane", Args: cobra.MaximumNArgs(1), RunE: func(cmd *cobra.Command, args []string) error {
		c, err := rex.NewClient(*server)
		if err != nil {
			return err
		}
		bid := os.Getenv("REX_BLOCK")
		if len(args) > 0 {
			bid = args[0]
		}
		return rex.Forget(cmd.Context(), c, rex.NewStore(), bid)
	}}
}

func newTrackCmd(server *string) *cobra.Command {
	return &cobra.Command{Use: "track", Short: "Backfill tracking from verified running agents", Args: cobra.NoArgs, RunE: func(cmd *cobra.Command, _ []string) error {
		c, err := rex.NewClient(*server)
		if err != nil {
			return err
		}
		count, err := rex.Track(cmd.Context(), c, rex.NewStore())
		if err != nil {
			return err
		}
		cmd.Printf("Tracked %d verified running agents\n", count)
		return nil
	}}
}

func newSaveCmd(server *string) *cobra.Command {
	return &cobra.Command{Use: "save", Short: "Save an optional metadata snapshot", Args: cobra.NoArgs, RunE: func(cmd *cobra.Command, _ []string) error {
		c, err := rex.NewClient(*server)
		if err != nil {
			return err
		}
		id, err := rex.Save(cmd.Context(), c, rex.NewStore())
		if err != nil {
			return err
		}
		cmd.Println("Saved", id)
		return nil
	}}
}

func newResumeCmd(server *string, name string) *cobra.Command {
	var yes bool
	child := &cobra.Command{Use: name + " [snapshot-id]", Short: "Preview or resume agents in existing panes", Args: cobra.MaximumNArgs(1), RunE: func(cmd *cobra.Command, args []string) error {
		c, err := rex.NewClient(*server)
		if err != nil {
			return err
		}
		id := ""
		if len(args) > 0 {
			id = args[0]
		}
		return rex.Workspace(cmd.Context(), c, rex.NewStore(), id, name == "restore", yes, cmd.InOrStdin(), cmd.OutOrStdout())
	}}
	if name == "restore" {
		child.Flags().BoolVarP(&yes, "yes", "y", false, "Skip the restore confirmation")
	}
	return child
}
