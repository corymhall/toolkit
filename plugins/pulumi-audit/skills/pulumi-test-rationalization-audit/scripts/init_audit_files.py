#!/usr/bin/env python3
"""
Initialize audit config files for a Pulumi repo.
"""

from __future__ import annotations

import argparse
from pathlib import Path


PRESETS = {
    "pulumi-aws": {
        "repo": "pulumi/pulumi-aws",
        "profile": "bridged-provider",
        "test_roots": ["examples"],
        "suite_label": "examples/*",
    },
    "pulumi-aws-native": {
        "repo": "pulumi/pulumi-aws-native",
        "profile": "native-provider",
        "test_roots": ["examples"],
        "suite_label": "examples/*",
    },
    "pulumi-awsx": {
        "repo": "pulumi/pulumi-awsx",
        "profile": "component-library",
        "test_roots": ["examples"],
        "suite_label": "examples/*",
    },
}


REPO_AUDIT_TEMPLATE = """repo: {repo}
profile: {profile}

discovery:
  roots:
{discovery_roots}
  adapter: go-top-level-tests
  include:
    - "*_test.go"

history:
  moved_path_hints: []

paths:
  introductions_jsonl: "test-introductions.jsonl"
  commit_prs_jsonl: "commit-prs.jsonl"

report:
  title: "{suite_label} Test Provenance"
  markdown_path: "TEST_PROVENANCE.md"
  machine_json_path: "test-provenance.json"

issues:
  parent_issue:
  audit_issue:

labels:
  decision_buckets:
    remove: "Tests We Can Remove"
    rewrite: "Rewrite Cheaper"
    move_upstream: "Ready To Move Upstream"
    conditional: "Keep - Conditionally"
    always_run: "Keep - Always Run"
    analysis: "Still Needs Analysis"
"""


AUDIT_METADATA_TEMPLATE = """groups: []

metadata_overrides: {}

review_overrides: {}

special_tracking:
  patch: {}
  upgrade: {}
  replay: {}
  broad_smoke: {}
"""


def render_roots(test_roots: list[str]) -> str:
    return "\n".join(f"    - {root}" for root in test_roots)


def resolve_settings(args: argparse.Namespace) -> dict[str, object]:
    preset = PRESETS.get(args.preset or "")
    if not preset and (not args.profile or not args.repo):
        raise SystemExit("pass --preset or provide both --profile and --repo")

    settings = dict(preset or {})
    if args.profile:
        settings["profile"] = args.profile
    if args.repo:
        settings["repo"] = args.repo
    if args.test_root:
        settings["test_roots"] = list(args.test_root)
    settings.setdefault("test_roots", ["examples"])
    if args.suite_label:
        settings["suite_label"] = args.suite_label
    settings.setdefault("suite_label", "examples/*")
    return settings


def ensure_can_write(paths: list[Path], force: bool) -> None:
    existing = [path for path in paths if path.exists()]
    if existing and not force:
        formatted = "\n".join(f"- {path}" for path in existing)
        raise SystemExit(
            "refusing to overwrite existing audit file(s):\n"
            f"{formatted}\n"
            "Pass --force only when you intentionally want to replace them."
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output_dir", help="Directory where audit files should be written")
    parser.add_argument(
        "--preset",
        choices=sorted(PRESETS),
        help="Known Pulumi repo preset that fills in repo, profile, and starting test roots",
    )
    parser.add_argument(
        "--profile",
        choices=["bridged-provider", "native-provider", "component-library"],
        help="Pulumi repo profile; required unless --preset is used",
    )
    parser.add_argument("--repo", help="GitHub repo slug, for example pulumi/pulumi-aws")
    parser.add_argument(
        "--test-root",
        action="append",
        help="Test root to scan; repeat to add more than one root",
    )
    parser.add_argument("--suite-label", help="Human-friendly suite label")
    parser.add_argument("--force", action="store_true", help="Overwrite existing audit files")
    args = parser.parse_args()

    output_dir = Path(args.output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    settings = resolve_settings(args)

    repo_audit = output_dir / "repo-audit.yaml"
    audit_metadata = output_dir / "audit-metadata.yaml"
    ensure_can_write([repo_audit, audit_metadata], args.force)

    repo_audit.write_text(
        REPO_AUDIT_TEMPLATE.format(
            repo=settings["repo"],
            profile=settings["profile"],
            discovery_roots=render_roots(list(settings["test_roots"])),
            suite_label=settings["suite_label"],
        ),
        encoding="utf-8",
    )
    audit_metadata.write_text(AUDIT_METADATA_TEMPLATE, encoding="utf-8")

    print(f"Wrote {repo_audit}")
    print(f"Wrote {audit_metadata}")
    if args.preset:
        print(f"Initialized from preset: {args.preset}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
