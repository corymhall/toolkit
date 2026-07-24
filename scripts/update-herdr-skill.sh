#!/bin/sh
set -eu

repo_root="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"
url="${HERDR_SKILL_URL:-https://raw.githubusercontent.com/ogulcancelik/herdr/master/SKILL.md}"
destination="${HERDR_SKILL_DESTINATION:-${repo_root}/.agents/skills/herdr/SKILL.md}"

mkdir -p "$(dirname -- "$destination")"
temporary="$(mktemp "${destination}.tmp.XXXXXX")"
trap 'rm -f "$temporary"' EXIT HUP INT TERM

curl --fail --location --silent --show-error "$url" --output "$temporary"
if ! grep -q '^name: herdr$' "$temporary"; then
  echo "downloaded file is not the Herdr skill: $url" >&2
  exit 1
fi

chmod 0644 "$temporary"
mv "$temporary" "$destination"
trap - EXIT HUP INT TERM
printf 'Updated %s from %s\n' "$destination" "$url"
