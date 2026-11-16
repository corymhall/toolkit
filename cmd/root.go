// Package cmd defines the toolkit CLI's commands and flags.
package cmd

import "github.com/spf13/cobra"

// NewRootCmd constructs a fresh toolkit command tree.
func NewRootCmd() *cobra.Command {
	root := &cobra.Command{
		Use:           "toolkit",
		Short:         "Workstation tools for Rex and agent workflows",
		Version:       "dev",
		Args:          cobra.NoArgs,
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE: func(command *cobra.Command, _ []string) error {
			return command.Help()
		},
	}
	root.AddCommand(newRexCmd())
	return root
}
