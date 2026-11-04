#!/usr/bin/env python3
"""Render native empty, populated, Full, and Close views in temporary homes."""
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[2]
scenarios = ["empty", "activity", "working", "full", "close", "picker-work", "picker-projects", "picker-worktrees", "picker-create", "picker-remove", "picker-job"]
for scenario in sys.argv[1:] or scenarios:
    if scenario not in scenarios:
        raise ValueError(f"Unknown render scenario: {scenario}")
    with tempfile.TemporaryDirectory(prefix="toolkit-herdr-check-") as directory:
        home = Path(directory)
        mod = home / "mods/toolkit-workbench"
        shutil.copytree(root / "herdr/mods/toolkit-workbench", mod)
        shutil.copytree(root / "herdr/mods/toolkit-workbench/icons", home / "assets/toolkit-workbench")
        if scenario != "empty":
            # Test-only source adapter. The shipped module always reads live Herdr.
            source = (mod / "main.js").read_text()
            source, count = re.subn(
                r"const world = \(\) => \(\{.*?\}\);",
                "const world = () => fixtureWorld;", source, count=1, flags=re.S)
            assert count == 1, "world adapter changed"
            source, count = re.subn(
                r"const load = \(\) => initialState\(shared\(stateKey\)\);",
                "const load = () => fixtureState;", source, count=1)
            assert count == 1, "state adapter changed"
            source = source.replace("  props,", "  props as hostProps,")
            source = ('import { fixture } from "./fixture.js";\n' + source)
            source += '\nconst fixtureWorld = fixture();\n'
            if scenario == "working":
                source += 'fixtureWorld.agents[0].status = "working";\n'
            source += 'const fixtureState = reconcile(initialState(), fixtureWorld);\n'
            if scenario.startswith("picker-"):
                kind = "work" if scenario == "picker-work" else "projects"
                source += f'const props = () => ({{ role: "picker", kind: "{kind}" }});\n'
                picker = (mod / "picker.js").read_text().replace("  props,", "  props as hostProps,")
                picker, count = re.subn(r"const world = \(\) => \(\{.*?\}\);", "const world = () => fixture();", picker, count=1, flags=re.S)
                assert count == 1, "picker world adapter changed"
                # Herdr check materializes outside a rendered view. Its virtual
                # list/scrollbar bridge currently panics in Window::current_view.
                # Render the same rows eagerly here; verify the real list live.
                picker = picker.replace("  v_virtual_list,", "  v_virtual_list as nativeList,").replace("  Scrollbar,", "  Scrollbar as nativeScrollbar,")
                picker = ('import { fixture } from "./fixture.js";\n'
                          'const v_virtual_list = (_id, count, _size, _key, render) => v_flex().children(render({start: 0, end: Math.min(count, 10)}));\n'
                          'const Scrollbar = {vertical: () => div()};\n' + picker)
                picker += f'\nconst props = () => ({{ role: "picker", kind: "{kind}" }});\n'
                (mod / "picker.js").write_text(picker)
            elif scenario == "close":
                source += 'const props = () => ({ role: "close", session: "main", plan: closePlan(fixtureState, fixtureWorld, "main") });\n'
            else:
                source += 'const props = () => hostProps();\n'
            (mod / "fixture.js").write_text((root / "herdr/test/fixtures/world.js").read_text())
            (mod / "implementation.js").write_text(source)
            (mod / "main.js").write_text(
                'import Workbench from "./implementation.js";\n'
                'export default class CheckWorkbench extends Workbench {\n'
                '  init(p, cx) { super.init(p, cx); '
                f'this.mode = "{scenario}"; '
                'this.expanded = new Set(["main"]); '
                'this.cache = {version: 1, entries: { '
                '[JSON.stringify([null, "/work/provider"])]: {checkedAt: new Date().toISOString(), dirty: true, '
                'pr: {number: 42, state: "OPEN", title: "Fix import", reviewDecision: "CHANGES_REQUESTED", checks: "failed"}} '
                '}}; }\n}\n')
        if scenario.startswith("picker-"):
            setup = ''
            if scenario == "picker-worktrees":
                setup = 'this.location = {kind: "git", path: "/work/provider", name: "provider"}; '
            elif scenario in ("picker-create", "picker-remove"):
                setup = 'this.form = {action: "' + ('remove' if scenario == 'picker-remove' else 'create') + '", project: {path: "/work/provider"}}; this.formInput = InputState.new({placeholder: "Branch name"}); this.plan = {path: "/work/provider-feature", mode: "force", tabs: [{name: "Feature", terminals: ["t3"]}]}; '
            elif scenario == "picker-job":
                setup = 'this.job = {job: "fixture", state: "failed", error: "Hook failed. Checkout preserved.", log: "Preparing checkout\\nBuild failed"}; '
            (mod / "main.js").write_text(
                'import Workbench from "./implementation.js";\n'
                'import { InputState } from "gpui-base";\n'
                'export default class CheckWorkbench extends Workbench {\n'
                ' refresh() {} requestPreview() {} pollJob() {}\n'
                ' init(p, cx) { super.init(p, cx); this.preview = "Git status and terminal screen preview"; '
                'this.items = [{id: "repo", name: "provider", path: "/work/provider", kind: "git", detail: "main · /work"}]; '
                + setup + '}\n}\n')
        env = dict(os.environ, HERDR_APP_HOME=str(home))
        print(f"Native check: {scenario}", flush=True)
        subprocess.run(["herdr-app", "check", str(mod)], env=env, check=True)
