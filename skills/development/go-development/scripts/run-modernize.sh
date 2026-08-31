#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: run-modernize.sh [--fix] <package>...

Run the pinned Go modernize analyzer against an explicit package scope.
Diagnostics are non-mutating unless --fix is supplied.
EOF
}

fix=false
packages=()
for argument in "$@"; do
  case "${argument}" in
    --fix)
      fix=true
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    -*)
      echo "run-modernize.sh: unsupported option: ${argument}" >&2
      usage >&2
      exit 2
      ;;
    *)
      packages+=("${argument}")
      ;;
  esac
done

if (( ${#packages[@]} == 0 )); then
  echo "run-modernize.sh: specify at least one package; broad scope is not selected automatically" >&2
  usage >&2
  exit 2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
version="$(<"${script_dir}/MODERNIZE_VERSION")"
module="golang.org/x/tools/go/analysis/passes/modernize/cmd/modernize"

if [[ -n "${XDG_CACHE_HOME:-}" ]]; then
  cache_root="${XDG_CACHE_HOME}/toolkit/modernize"
elif [[ -n "${HOME:-}" ]]; then
  cache_root="${HOME}/.cache/toolkit/modernize"
else
  echo "run-modernize.sh: HOME or XDG_CACHE_HOME must be set" >&2
  exit 1
fi

install_dir="${cache_root}/${version}"
binary="${install_dir}/modernize"

if [[ ! -x "${binary}" ]]; then
  if ! command -v go >/dev/null 2>&1; then
    echo "run-modernize.sh: Go is required to install ${module}@${version}" >&2
    exit 1
  fi

  mkdir -p "${cache_root}"
  temp_dir="$(mktemp -d "${cache_root}/.install-${version}.XXXXXX")"
  cleanup() {
    rm -rf "${temp_dir}"
  }
  trap cleanup EXIT HUP INT TERM

  echo "run-modernize.sh: installing ${module}@${version}" >&2
  (
    cd "${temp_dir}"
    GOFLAGS='' GOWORK=off CGO_ENABLED=0 GOBIN="${temp_dir}" \
      go install "${module}@${version}"
  )

  if [[ ! -x "${temp_dir}/modernize" ]]; then
    echo "run-modernize.sh: go install did not produce modernize" >&2
    exit 1
  fi

  mkdir -p "${install_dir}"
  mv "${temp_dir}/modernize" "${binary}.tmp.$$"
  mv "${binary}.tmp.$$" "${binary}"
  cleanup
  trap - EXIT HUP INT TERM
fi

arguments=()
if [[ "${fix}" == true ]]; then
  arguments+=("-fix")
fi
arguments+=("${packages[@]}")

exec "${binary}" "${arguments[@]}"
