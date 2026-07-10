# Git-Spice Command Cookbook

## Inspect
```bash
git-spice --help
git-spice stack submit --help
git-spice branch create --help
git-spice branch split --help
git-spice log short -a --no-prompt
git-spice log long --no-prompt
```

## Initialize
```bash
git-spice repo init --trunk <main-or-master> --remote origin --no-prompt
```

## Create, Track, and Navigate
```bash
git-spice branch create <branch-name> --message "<commit message>" --target <base-branch> --no-prompt
git-spice branch create <branch-name> --message "<commit message>" --insert --target <base-branch> --no-prompt
git-spice branch create <branch-name> --message "<commit message>" --below --target <base-branch> --no-prompt
git-spice branch create <branch-name> --no-commit --target <base-branch> --no-prompt
git-spice branch create <branch-name> --all --message "<commit message>" --target <base-branch> --no-prompt
git-spice branch track --base <base-branch> --no-prompt
git-spice downstack track --no-prompt
git-spice up
git-spice down
git-spice top
git-spice bottom
git-spice trunk
git-spice branch checkout
```

## Commit Changes
```bash
git-spice commit amend --no-edit --no-prompt
git-spice commit create --message "<commit message>" --no-prompt
```

## Submit
```bash
git-spice stack submit --fill --draft --no-web
git-spice stack submit --update-only --no-web
git-spice branch submit --fill --draft --no-web
git-spice upstack submit --fill --no-web
git-spice downstack submit --fill --no-web
```

## Restack and Sync
```bash
git-spice upstack restack
git-spice stack restack
git-spice branch restack
git-spice repo sync --restack --no-prompt
git-spice rebase continue
git-spice rebase abort
```

## Reorganize
```bash
git-spice branch onto <target> --no-prompt
git-spice upstack onto <target> --no-prompt
git-spice branch fold --no-prompt
git-spice branch split --at=<commit>:<new-branch> --no-prompt
git-spice branch squash --no-edit --no-prompt
git-spice branch rename <old> <new> --no-prompt
git-spice branch delete --no-prompt
git-spice branch untrack <branch>
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
