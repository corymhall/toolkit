## Interacting with GitHub

Use the `gh` command via the Bash tool for ALL GitHub-related tasks including working with issues, pull requests, checks, and releases. If given a Github URL use the `gh` command to get the information needed.

<example>
Create a PR

```bash
gh pr create --title "the pr title" --body "$(cat <<'EOF'
## Summary
<1-3 bullet points>
EOF
)"
```

</example>

<example>
View comments on a Github PR:

```bash
gh api repos/foo/bar/pulls/123/comments
```

</example>
