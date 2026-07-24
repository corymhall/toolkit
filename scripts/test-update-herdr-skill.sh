#!/bin/sh
set -eu

repo_root="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"
temporary="$(mktemp -d)"
trap 'rm -rf "$temporary"' EXIT HUP INT TERM

source_file="${temporary}/SKILL.md"
destination="${temporary}/installed/SKILL.md"
printf '%s\n' '---' 'name: herdr' 'description: Test Herdr skill' '---' > "$source_file"

HERDR_SKILL_URL="file://${source_file}" \
HERDR_SKILL_DESTINATION="$destination" \
  "${repo_root}/scripts/update-herdr-skill.sh"
cmp "$source_file" "$destination"

printf '%s\n' 'not a skill' > "$source_file"
if HERDR_SKILL_URL="file://${source_file}" \
  HERDR_SKILL_DESTINATION="$destination" \
  "${repo_root}/scripts/update-herdr-skill.sh" 2>/dev/null; then
  echo "expected an invalid Herdr skill download to fail" >&2
  exit 1
fi
grep -q '^name: herdr$' "$destination"

echo "Herdr skill updater tests passed."
