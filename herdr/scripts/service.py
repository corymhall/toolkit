#!/usr/bin/env python3
"""Explicit macOS launchd lifecycle for the collector. Never called by install."""
import argparse
import os
from pathlib import Path
import plistlib
import subprocess
import sys

LABEL = "com.corymhall.toolkit.herdr-github-status"
def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["install", "start", "stop", "status"])
    args = parser.parse_args()
    if sys.platform != "darwin":
        parser.error("launchd is macOS-only. Run the collector's serve command under your supervisor.")
    home = Path(os.environ.get("HERDR_APP_HOME", Path.home()/".config/herdr-app")).resolve()
    binary = home / "bin/toolkit-github-status"
    state = home / "data/toolkit-github-status"
    plist = Path.home() / "Library/LaunchAgents" / f"{LABEL}.plist"
    domain = f"gui/{os.getuid()}"
    if args.action == "install":
        if not binary.is_file():
            parser.error("Run mise run herdr:install first.")
        spec = {"Label": LABEL, "ProgramArguments": [str(binary.resolve()), "--state", str(state), "serve"],
                "EnvironmentVariables": {"PATH": os.environ["PATH"], "HERDR_APP_HOME": str(home)},
                "RunAtLoad": True, "KeepAlive": True, "ThrottleInterval": 60,
                "StandardOutPath": str(state/"stdout.log"), "StandardErrorPath": str(state/"stderr.log")}
        state.mkdir(parents=True, exist_ok=True, mode=0o700)
        plist.parent.mkdir(parents=True, exist_ok=True)
        if plist.exists():
            current = plistlib.loads(plist.read_bytes())
            if current != spec:
                parser.error(f"Existing service differs. Stop and review {plist} before replacing it.")
        else:
            with plist.open("xb") as output:
                plistlib.dump(spec, output)
        print(f"Installed {plist}. Not started. Use mise run herdr:service-start explicitly.")
    elif args.action == "start":
        if not plist.is_file():
            parser.error("Install the service definition first.")
        subprocess.run(["launchctl", "bootstrap", domain, str(plist)], check=True)
    elif args.action == "stop":
        subprocess.run(["launchctl", "bootout", f"{domain}/{LABEL}"], check=True)
    else:
        subprocess.run(["launchctl", "print", f"{domain}/{LABEL}"], check=True)
    return 0

if __name__ == "__main__":
    sys.exit(main())
