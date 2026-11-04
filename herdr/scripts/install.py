#!/usr/bin/env python3
"""Link only toolkit-owned Herdr assets. No settings edits or live commands."""
import argparse
import hashlib
import json
import os
import tempfile
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]

def links(home, root=ROOT):
    return {
        home / "mods/toolkit-workbench": root / "herdr/mods/toolkit-workbench",
        home / "layouts/toolkit-workbench.json": root / "herdr/layouts/toolkit-workbench.json",
        home / "layouts/toolkit-workbench.svg": root / "herdr/layouts/toolkit-workbench.svg",
        home / "bin/toolkit-github-status": root / ".build/herdr/herdr-github-status",
        home / "bin/toolkit-picker": root / "herdr/scripts/picker.py",
    }

def asset_plan(home, root):
    source = root / "herdr/mods/toolkit-workbench/icons"
    files = {path.name: path.read_bytes() for path in source.glob("*.svg")}
    if not files:
        raise ValueError(f"Missing workbench icons: {source}")
    files["preview.svg"] = (root / "herdr/layouts/toolkit-workbench.svg").read_bytes()
    destination = home / "assets/toolkit-workbench"
    manifest = destination / "manifest.json"
    for path in [destination.parent, destination]:
        if path.is_symlink() or (path.exists() and not path.is_dir()):
            raise ValueError(f"Refusing asset path: {path}")
    old = {}
    if destination.exists():
        if manifest.is_symlink() or not manifest.is_file():
            raise ValueError(f"Refusing unowned asset directory: {destination}")
        data = json.loads(manifest.read_text())
        if not isinstance(data, dict) or data.get("owner") != "corymhall/toolkit:workbench-assets-v1":
            raise ValueError(f"Refusing unowned asset manifest: {manifest}")
        old = data.get("files")
        if not isinstance(old, dict) or any(
            not isinstance(name, str) or Path(name).name != name or name == "manifest.json"
            or not isinstance(digest, str) or len(digest) != 64
            or any(character not in "0123456789abcdef" for character in digest)
            for name, digest in old.items()
        ):
            raise ValueError(f"Invalid asset manifest: {manifest}")
        for path in destination.iterdir():
            if path.name == "manifest.json":
                continue
            if path.name not in old or path.is_symlink() or not path.is_file():
                raise ValueError(f"Refusing unrelated asset: {path}")
            if hashlib.sha256(path.read_bytes()).hexdigest() != old[path.name]:
                raise ValueError(f"Refusing locally modified asset: {path}")
        if any(not (destination / name).is_file() for name in old):
            raise ValueError("An installed asset is missing; review the manifest before reinstalling")
    return destination, files, old


def write_atomic(path, contents):
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as output:
        temporary = Path(output.name)
        output.write(contents)
    try:
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def apply(home, check=False, root=ROOT):
    expected = links(home, root)
    for destination, source in expected.items():
        if not source.exists():
            raise ValueError(f"Missing source {source}. Run mise run herdr:build first.")
        if destination.exists() and not destination.is_symlink():
            raise ValueError(f"Refusing non-symlink destination: {destination}")
        if destination.is_symlink() and destination.resolve() != source.resolve():
            raise ValueError(f"Refusing unrelated symlink: {destination}")
    asset_dir, assets, old_assets = asset_plan(home, root)
    if check:
        for name, contents in assets.items():
            if not (asset_dir / name).is_file() or (asset_dir / name).read_bytes() != contents:
                raise ValueError(f"Missing or outdated toolkit icon: {asset_dir / name}")
        for destination, source in expected.items():
            if not destination.is_symlink() or destination.resolve() != source.resolve():
                raise ValueError(f"Missing toolkit link: {destination}")
        print("Herdr links and copied assets match this checkout.")
        return
    for destination, source in expected.items():
        destination.parent.mkdir(parents=True, exist_ok=True)
        if not destination.is_symlink():
            destination.symlink_to(source)
        print(f"{destination} -> {source}")
    asset_dir.mkdir(parents=True, exist_ok=True)
    hashes = dict(old_assets)
    for name, contents in assets.items():
        write_atomic(asset_dir / name, contents)
        hashes[name] = hashlib.sha256(contents).hexdigest()
    write_atomic(asset_dir / "manifest.json", json.dumps({"owner": "corymhall/toolkit:workbench-assets-v1", "files": hashes}, indent=2).encode() + b"\n")
    print(f"Copied {len(assets)} sandbox-local assets into {asset_dir}")
    print("Installed without changing the selected layout or starting services.")

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--home", type=Path, default=Path(os.environ.get("HERDR_APP_HOME", Path.home()/".config/herdr-app")))
    args = parser.parse_args()
    if not args.home.is_absolute():
        parser.error("Herdr home must be absolute")
    try:
        apply(args.home, args.check)
    except (ValueError, OSError) as error:
        print(error, file=sys.stderr)
        return 1
    return 0

if __name__ == "__main__":
    sys.exit(main())
