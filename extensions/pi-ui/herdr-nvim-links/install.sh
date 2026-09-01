#!/usr/bin/env bash
set -euo pipefail

extension_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
app_dest="${HOME}/Applications/HerdrNvimURLHandler.app"
nvim_dest="${XDG_DATA_HOME:-${HOME}/.local/share}/nvim/site/pack/toolkit/start/herdr-nvim"
bundle_id="dev.corymhall.toolkit.herdr-nvim-url-handler"
lsregister="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
install_nvim_package=1

case "${1:-}" in
  "") ;;
  --native-only) install_nvim_package=0 ;;
  *)
    echo "Usage: $0 [--native-only]" >&2
    exit 2
    ;;
esac
if [[ "$#" -gt 1 ]]; then
  echo "Usage: $0 [--native-only]" >&2
  exit 2
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "The Herdr Neovim URL handler currently supports macOS only." >&2
  exit 1
fi

for command in swiftc codesign plutil herdr nvim; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "Missing required command: ${command}" >&2
    exit 1
  fi
done
if [[ ! -x "${lsregister}" ]]; then
  echo "Missing Launch Services registration tool: ${lsregister}" >&2
  exit 1
fi

if [[ "${install_nvim_package}" -eq 1 && -e "${nvim_dest}" && ! -L "${nvim_dest}" ]]; then
  echo "Refusing to replace non-symlink Neovim package: ${nvim_dest}" >&2
  exit 1
fi

if [[ -e "${app_dest}" ]]; then
  existing_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "${app_dest}/Contents/Info.plist" 2>/dev/null || true)"
  if [[ "${existing_id}" != "${bundle_id}" ]]; then
    echo "Refusing to replace app with a different bundle identifier: ${app_dest}" >&2
    exit 1
  fi
fi

build_root="$(mktemp -d)"
trap 'rm -rf "${build_root}"' EXIT
app_build="${build_root}/HerdrNvimURLHandler.app"
mkdir -p "${app_build}/Contents/MacOS" "${app_build}/Contents/Resources"
cp "${extension_root}/macos/Info.plist" "${app_build}/Contents/Info.plist"
plutil -lint "${app_build}/Contents/Info.plist" >/dev/null

swiftc "${extension_root}/macos/URLHandler.swift" \
  -framework AppKit \
  -o "${app_build}/Contents/MacOS/herdr-nvim-url-handler"
swiftc "${extension_root}/macos/HerdrNvimOpen.swift" \
  -o "${app_build}/Contents/Resources/herdr-nvim-open"
chmod 755 \
  "${app_build}/Contents/MacOS/herdr-nvim-url-handler" \
  "${app_build}/Contents/Resources/herdr-nvim-open"
codesign --force --deep --sign - "${app_build}" >/dev/null

mkdir -p "$(dirname "${app_dest}")"
rm -rf "${app_dest}"
mv "${app_build}" "${app_dest}"
if [[ "${install_nvim_package}" -eq 1 ]]; then
  mkdir -p "$(dirname "${nvim_dest}")"
  ln -sfn "${extension_root}/nvim" "${nvim_dest}"
fi
"${lsregister}" -f "${app_dest}"

echo "Installed ${app_dest}"
if [[ "${install_nvim_package}" -eq 1 ]]; then
  echo "Linked ${nvim_dest} -> ${extension_root}/nvim"
else
  echo "Skipped the native Neovim package link; configure the local plugin through your package manager."
fi
echo "Restart Neovim so it can advertise its RPC server, then reload or restart Pi."
