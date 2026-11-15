---
name: macos-storage-cleanup
description: Investigate and reduce disk usage on macOS developer machines. Use when storage looks unexpectedly full, Finder/System Settings reports very high usage, APFS space does not match visible files, or Codex needs to identify and safely reclaim space from caches, Docker, worktrees, package managers, app data, local snapshots, or oversized project directories.
---

# macOS Storage Cleanup

## Overview

Use this skill to triage disk usage on macOS, explain where space is going, and reclaim space safely.

Prefer a staged workflow:
1. Measure before deleting anything.
2. Separate real files from APFS accounting and snapshots.
3. Rank the largest buckets.
4. Clean the safest rebuildable data first.
5. Escalate before deleting project folders, user data, or app state.

## Workflow

### 1. Establish the real disk picture

Start with filesystem and APFS facts:

```bash
df -h /
df -h /System/Volumes/Data
diskutil info /
diskutil apfs list
tmutil listlocalsnapshots /
tmutil listlocalsnapshots /System/Volumes/Data
diskutil apfs listSnapshots /System/Volumes/Data
```

Interpret the results before moving on:
- `/` is the sealed system snapshot and is usually small.
- `/System/Volumes/Data` is where most writable user data lives.
- APFS snapshots and local Time Machine snapshots can make reported usage look larger than visible files.
- If snapshots are absent, treat the usage as real files unless deleted-but-open files prove otherwise.

Also check for deleted files still held open:

```bash
lsof +L1 2>/dev/null | head -n 200
```

### 2. Rank the largest top-level buckets

Scan the Data volume and the user home directory first:

```bash
du -x -hd 1 /System/Volumes/Data 2>/dev/null | sort -hr | head -n 30
du -x -hd 1 "$HOME" 2>/dev/null | sort -hr | head -n 30
du -x -hd 1 "$HOME/Library" 2>/dev/null | sort -hr | head -n 40
```

On developer Macs, the usual hotspots are:
- `~/work`, `~/github`, other repo roots
- `~/Library/Caches`
- `~/Library/Application Support`
- `~/Library/Containers`
- `~/.local`, `~/.cache`, `~/.npm`, `~/.cargo`, `~/.gradle`, `~/.nvm`
- Docker data
- `mise` installs
- `Downloads`

If `du` is slow, probe likely hotspots directly instead of waiting for a full-tree walk.

### 3. Identify common macOS and developer hotspots

Use targeted checks:

```bash
du -x -sh "$HOME/Library/Caches" \
          "$HOME/Library/Application Support" \
          "$HOME/Library/Containers" \
          "$HOME/Library/Developer" \
          "$HOME/.local" \
          "$HOME/Downloads" 2>/dev/null
```

For large files:

```bash
find "$HOME" -xdev -type f -size +5G -print 2>/dev/null | head -n 100
mdfind 'kMDItemPhysicalSize > 1000000000' | head -n 100
```

Important nuance:
- `mdfind` can surface cloud-backed files that are not actually consuming local blocks.
- Verify local size with `du`, not just Spotlight.

### 4. Clean the safest buckets first

Start with rebuildable caches and tool state.

#### Docker

Check first:

```bash
docker system df
docker volume ls
du -x -sh "$HOME/Library/Containers/com.docker.docker" 2>/dev/null
```

Then clean:

```bash
docker system prune -af --volumes
docker volume prune -af
```

Note:
- Docker Desktop may still keep a sparse `Docker.raw` file around.
- `docker system df` is the truth for reclaimable Docker objects.

#### Tool-native cache cleanup

Prefer native cleanup commands before raw deletion:

```bash
go clean -cache -testcache -fuzzcache
yarn cache clean
pip cache purge
brew cleanup -s
npx playwright uninstall --all
npx cypress cache clear
mise prune
mise cache prune
```

Interpretation:
- `mise cache prune` targets the small cache area.
- `mise prune` is the high-value command because it removes unused installed tool versions.

#### Manual cache cleanup

If native commands leave large cache directories behind, manual removal is acceptable for rebuildable caches:

```bash
rm -rf ~/Library/Caches/go-build
rm -rf ~/Library/Caches/goimports
rm -rf ~/Library/Caches/gopls
rm -rf ~/Library/Caches/Yarn
rm -rf ~/Library/Caches/ms-playwright
rm -rf ~/Library/Caches/Cypress
rm -rf ~/Library/Caches/pip
rm -rf ~/Library/Caches/node-gyp
rm -rf ~/Library/Caches/Homebrew
```

Prefer calling out exactly which cache directories remain and how large they are before removing them.

### 5. Handle repos, bare repos, and worktrees carefully

Project directories can dominate disk usage. Measure them explicitly:

```bash
du -x -hd 1 "$HOME/work" 2>/dev/null | sort -hr | head -n 30
du -x -hd 1 "$HOME/github" 2>/dev/null | sort -hr | head -n 30
```

Many "repo" directories on developer machines are actually bare repos with linked worktrees. Detect them before deleting:

```bash
git -C /path/to/repo rev-parse --is-bare-repository
git -C /path/to/repo worktree list
```

If a directory is a bare repo:
- inspect its worktrees first
- report branch and dirty state for each worktree
- remove worktrees with `git worktree remove --force <path>` when appropriate
- only delete the bare repo after the user clearly wants the whole repo family removed

Do not blindly `rm -rf` a bare repo path before checking whether it owns live worktrees elsewhere.

### 6. Escalate before deleting user data or app state

Pause and confirm before deleting:
- project repos or worktrees with active work
- `~/Library/Application Support/*`
- browser profiles
- sync folders or cloud-storage content
- large media files
- unknown app databases

Good examples of "ask first":
- `~/Library/Application Support/com.apple.wallpaper`
- `~/Library/Application Support/Slack`
- `~/Library/Application Support/Notion`
- large repo backups like `*-bkp`

### 7. Verify after every major cleanup

After each deletion wave, re-measure:

```bash
df -h /System/Volumes/Data
du -x -sh "$HOME/Library/Caches" "$HOME/.local" "$HOME/work" 2>/dev/null
```

Summarize:
- starting used/free space
- ending used/free space
- estimated reclaimed space
- exactly what was removed
- what still remains large

## Safety Rules

- Prefer measurement, then ranking, then cleanup.
- Prefer native cleanup commands before raw deletion.
- Do not use destructive git commands unless explicitly requested.
- Do not delete active worktrees or repos without checking branch and dirty state.
- Treat cloud-sync paths carefully; local visibility does not always equal local disk usage.
- If a cleanup command partially succeeds, re-measure instead of assuming failure.

## Typical Next Moves

After the first cleanup wave, the next high-value candidates are often:
- leftover Go editor caches such as `goimports` and `gopls`
- oversized repo backups or stale worktree forests
- `testing-apps` directories with `.terraform`, `node_modules`, `.venv`, or build outputs
- `~/Library/Application Support/com.apple.wallpaper/aerials`
- Docker Desktop leftovers
- `mise` installs that survive prune because configs still reference them
