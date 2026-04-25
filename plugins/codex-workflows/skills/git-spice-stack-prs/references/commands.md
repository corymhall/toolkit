# Git-Spice Command Cookbook

## Inspect
```bash
git-spice --help
git-spice stack submit --help
git-spice branch split --help
git-spice log short -a --no-prompt
```

## Initialize
```bash
git-spice repo init --trunk master --remote origin --no-prompt
```

## Track and Base Management
```bash
git-spice branch track --base <base-branch> --no-prompt
git-spice branch untrack <branch>
```

## Submit
```bash
git-spice stack submit --fill --draft --no-web
git-spice stack submit --update-only --no-web
git-spice branch submit --fill --draft --no-web
```

## Restack and Sync
```bash
git-spice upstack restack
git-spice stack restack
git-spice repo sync
```

## Useful Git for Stack Surgery
```bash
git rebase --onto <new-base> <old-base> <branch>
git checkout -b <new-branch>
```

## GitHub (must use gh)
```bash
gh pr list --head <branch> --json number,title,headRefName,baseRefName,url
gh pr view <number> --json number,title,body,url,headRefName,baseRefName
gh pr edit <number> --title "<title>" --body "$(cat <<'PR_BODY_EOF'
## Summary
- ...

## Testing
- ...
PR_BODY_EOF
)"
```

## Reference Links
- https://abhinav.github.io/git-spice/llms.txt
- https://abhinav.github.io/git-spice/cli/reference/index.md
