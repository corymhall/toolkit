"""Interactive delegate popup. Worktree and Rex ownership stay in the user's picker."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import shlex
import subprocess
import sys
import traceback


def load_picker(path):
    spec = importlib.util.spec_from_file_location("rex_picker", path)
    picker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(picker)
    return picker


def repos(picker):
    # Reuse the same inventory but exclude scratch roots, which have no worktrees.
    output = io.StringIO()
    with contextlib.redirect_stdout(output):
        picker.dispatch(["repos"])
    for line in output.getvalue().splitlines():
        if line.split("\t")[-1] == "git":
            print(line)


def delegate(request, picker):
    source = shlex.join([sys.executable, "-B", str(Path(__file__).resolve()), "repos", request["picker"]])
    selected = subprocess.run(
        ["tv", "--no-remote", "--source-command", source,
         "--source-display", "{split:\\t:0}  {split:\\t:1}",
         "--source-output", "{split:\\t:3}", "--input-header", "Delegate to project"],
        text=True, stdout=subprocess.PIPE)
    if selected.returncode == 130:
        return
    if selected.returncode != 0:
        raise RuntimeError(f"Project picker exited with {selected.returncode}")
    if not selected.stdout.strip():
        return
    repo = picker.dec(selected.stdout.strip())
    branch = input("New worktree branch: ").strip()
    if not branch:
        return
    print(f"Create {branch!r} in {repo}, run its Worktrunk hooks, and start Pi with your instructions.")
    if input("Continue? [y/N] ").strip().lower() not in ("y", "yes"):
        return
    # No shell typing, no clipboard, no second implementation of worktree setup.
    picker.create_worktree(repo, command=request["command"], branch=branch)


def main(args):
    if args[0] == "repos":
        repos(load_picker(args[1]))
        return
    path = Path(args[0])
    request = json.loads(path.read_text())
    picker = load_picker(request["picker"])
    # The private handoff is consumed once. Do not replay after an uncertain mutation.
    path.unlink()
    path.parent.rmdir()
    try:
        delegate(request, picker)
    except (KeyboardInterrupt, EOFError):
        pass
    except Exception:
        traceback.print_exc()
        input("Delegation failed. Inspect Rex and worktrees before retrying. Press Enter to close.")
    finally:
        picker.close_picker_popup()


if __name__ == "__main__":
    main(sys.argv[1:])
