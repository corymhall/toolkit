package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/corymhall/toolkit/herdr/github-status/internal/status"
)

func main() {
	if err := run(); err != nil {
		log.Print(err)
		os.Exit(1)
	}
}
func run() error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	appHome := os.Getenv("HERDR_APP_HOME")
	if appHome == "" {
		appHome = filepath.Join(home, ".config", "herdr-app")
	}
	flags := flag.NewFlagSet("herdr-github-status", flag.ContinueOnError)
	state := flags.String("state", filepath.Join(appHome, "data", "toolkit-github-status"), "private runtime directory")
	interval := flags.Duration("interval", time.Minute, "minimum refresh interval")
	if err = flags.Parse(os.Args[1:]); err != nil {
		return err
	}
	if *interval < time.Minute {
		return errors.New("interval must be at least one minute")
	}
	action := "refresh"
	if flags.NArg() > 0 {
		action = flags.Arg(0)
	}
	if flags.NArg() > 1 {
		return errors.New("expected one command: refresh, serve, or status")
	}
	path := filepath.Join(*state, "status.json")
	if action == "status" {
		cache, err := status.Load(path)
		if err != nil {
			return err
		}
		fmt.Printf("last refresh: %s; folders: %d\n", cache.UpdatedAt.Format(time.RFC3339), len(cache.Entries))
		return nil
	}
	if action != "serve" && action != "refresh" {
		return errors.New("expected refresh, serve, or status")
	}
	if err = os.MkdirAll(*state, 0700); err != nil {
		return err
	}
	lock := filepath.Join(*state, "collector.lock")
	if err = os.Mkdir(lock, 0700); err != nil {
		return fmt.Errorf("collector lock unavailable at %s: %w; inspect the running service before removing a stale lock", lock, err)
	}
	defer os.RemoveAll(lock)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	collector := status.Collector{Run: status.Exec, Now: time.Now}
	refresh := func() error {
		cycle, cancel := context.WithTimeout(ctx, 3*time.Minute)
		defer cancel()
		old, err := status.Load(path)
		if err != nil {
			return err
		}
		cache, err := collector.Refresh(cycle, old)
		if err != nil {
			return err
		}
		return status.Save(path, cache)
	}
	if action == "refresh" {
		return refresh()
	}
	for {
		if err := refresh(); err != nil {
			if ctx.Err() != nil {
				return nil
			}
			log.Printf("refresh failed: %v", err)
		}
		timer := time.NewTimer(*interval)
		select {
		case <-ctx.Done():
			timer.Stop()
			return nil
		case <-timer.C:
		}
	}
}
