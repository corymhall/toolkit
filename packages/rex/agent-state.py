#!/usr/bin/env python3
"""Small, stdin-only Pi/Codex hook. No conversation text is persisted."""
import sys
from workspace import main

if __name__ == "__main__":
    commands = {"pi": "register-pi", "codex": "register-codex", "pi-stop": "unregister-pi"}
    try:
        sys.argv[1] = commands[sys.argv[1]]
        main()
    except Exception as error:
        print("Rex agent registration: " + str(error), file=sys.stderr)
        sys.exit(1)
