#!/usr/bin/env python3
"""
Render a markdown test rationalization report from config, metadata, and provenance JSON.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any

import yaml


def load_yaml(path: Path) -> dict[str, Any]:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise SystemExit(f"expected mapping in {path}")
    return data


def resolve_path(base_dir: Path, raw_path: str) -> Path:
    path = Path(raw_path).expanduser()
    if path.is_absolute():
        return path
    return (base_dir / path).resolve()


def markdown_escape(value: Any) -> str:
    return str(value or "").replace("|", "\\|").replace("\n", " ")


def normalize_flag(value: Any) -> str:
    if value is True:
        return "Yes"
    if value is False:
        return "No"
    text = str(value or "").strip()
    lowered = text.lower()
    if lowered in {"yes", "true"}:
        return "Yes"
    if lowered in {"no", "false"}:
        return "No"
    return text


def format_introduced(record: dict[str, Any]) -> str:
    prs = list(record.get("introPrs", []))
    sha = str(record.get("intro_commit") or "")[:7] or "MISSING"
    subject = markdown_escape(record.get("intro_subject") or "Unknown subject")
    if prs:
        pr = prs[0]
        return f"[#{pr['number']}]({pr['url']}) {markdown_escape(pr['title'])}<br>`{sha}` {subject}"
    return f"No PR found<br>`{sha}` {subject}"


def build_metadata_by_test(metadata: dict[str, Any]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for group in metadata.get("groups", []):
        shared = {
            "layer_under_test": group.get("layer_under_test", ""),
            "recommended_home": group.get("recommended_home", ""),
            "cadence": group.get("cadence", ""),
            "behavior_under_test": group.get("behavior_under_test", ""),
        }
        for test in group.get("tests", []):
            result[str(test)] = dict(shared)
    for test, override in metadata.get("metadata_overrides", {}).items():
        result.setdefault(str(test), {}).update(override or {})
    return result


def classify_special_bucket(test: str, metadata: dict[str, Any]) -> str | None:
    special = metadata.get("special_tracking", {})
    hits = []
    for label, map_name in [
        ("patch", "patch"),
        ("upgrade", "upgrade"),
        ("replay", "replay"),
        ("broad-smoke", "broad_smoke"),
    ]:
        if test in (special.get(map_name, {}) or {}):
            hits.append(label)
    if len(hits) > 1:
        raise SystemExit(f"test appears in multiple special tracking buckets: {test} -> {hits}")
    return hits[0] if hits else None


def labels(config: dict[str, Any]) -> dict[str, str]:
    return dict(config.get("labels", {}).get("decision_buckets", {}))


def classify_decision_bucket(test: str, metadata: dict[str, Any], review: dict[str, Any], bucket_labels: dict[str, str]) -> str:
    disposition = str(review.get("disposition") or "")
    special = classify_special_bucket(test, metadata)
    if disposition in {"Delete candidate", "Covered upstream"}:
        return bucket_labels["remove"]
    if disposition == "Rewrite cheaper":
        return bucket_labels["rewrite"]
    if disposition == "Move upstream" and normalize_flag(review.get("upstream_plan_ready")) == "Yes":
        return bucket_labels["move_upstream"]
    if special in {"patch", "upgrade"} or disposition in {"Do not run by default", "Release only"}:
        return bucket_labels["conditional"]
    if disposition == "Keep":
        return bucket_labels["always_run"]
    return bucket_labels["analysis"]


def render_table(title: str, rows: list[dict[str, Any]], metadata_by_test: dict[str, dict[str, Any]], review_overrides: dict[str, Any]) -> list[str]:
    if not rows:
        return []
    lines = [
        f"## {title}",
        "",
        f"Count: {len(rows)}.",
        "",
        "| Test | Behavior Under Test | Layer Under Test | Recommended Home | Cadence | Disposition | Confidence | Working State | Needs Migration Spike | Replacement Coverage | Evidence Needed | Root Cause | Obsolete Since | Last Reviewed | Introduced In |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for record in rows:
        test = str(record["test"])
        meta = metadata_by_test.get(test, {})
        review = review_overrides.get(test, {})
        lines.append(
            "| "
            + " | ".join(
                [
                    f"`{test}`",
                    markdown_escape(meta.get("behavior_under_test", "")),
                    markdown_escape(meta.get("layer_under_test", "")),
                    markdown_escape(meta.get("recommended_home", "")),
                    markdown_escape(meta.get("cadence", "")),
                    markdown_escape(review.get("disposition", "")),
                    markdown_escape(review.get("confidence", "")),
                    markdown_escape(review.get("working_state", "")),
                    markdown_escape(normalize_flag(review.get("needs_migration_spike"))),
                    markdown_escape(review.get("replacement_coverage", "")),
                    markdown_escape(review.get("evidence_needed", "")),
                    markdown_escape(review.get("root_cause", "")),
                    markdown_escape(review.get("obsolete_since", "")),
                    markdown_escape(review.get("last_reviewed", "")),
                    format_introduced(record),
                ]
            )
            + " |"
        )
    lines.append("")
    return lines


def render_special_section(title: str, rows: list[dict[str, Any]], metadata: dict[str, Any], review_overrides: dict[str, Any], mapping: str) -> list[str]:
    if not rows:
        return []
    special = metadata.get("special_tracking", {}).get(mapping, {})
    lines = [
        f"## {title}",
        "",
        f"Count: {len(rows)}.",
        "",
        "| Test | Current Disposition | Trigger | Notes |",
        "| --- | --- | --- | --- |",
    ]
    for record in rows:
        test = str(record["test"])
        review = review_overrides.get(test, {})
        tracking = special.get(test, {})
        trigger = tracking.get("trigger") or tracking.get("remove_when") or ""
        notes = tracking.get("rationale") or ", ".join(tracking.get("files", [])) or ""
        lines.append(
            f"| `{test}` | {markdown_escape(review.get('disposition', ''))} | {markdown_escape(trigger)} | {markdown_escape(notes)} |"
        )
    lines.append("")
    return lines


def render_report(config: dict[str, Any], metadata: dict[str, Any], records: list[dict[str, Any]]) -> str:
    report_cfg = config.get("report", {})
    issue_cfg = config.get("issues", {})
    bucket_labels = labels(config)
    metadata_by_test = build_metadata_by_test(metadata)
    review_overrides = metadata.get("review_overrides", {})

    rows_by_bucket: dict[str, list[dict[str, Any]]] = {label: [] for label in bucket_labels.values()}
    special_counts = Counter()
    rows_by_special: dict[str, list[dict[str, Any]]] = {name: [] for name in ["patch", "upgrade", "replay", "broad_smoke"]}

    missing_metadata = []
    for record in records:
        test = str(record["test"])
        if test not in metadata_by_test:
            missing_metadata.append(test)
        review = review_overrides.get(test, {})
        bucket = classify_decision_bucket(test, metadata, review, bucket_labels)
        rows_by_bucket[bucket].append(record)
        special = classify_special_bucket(test, metadata)
        if special:
            special_counts[special] += 1
            rows_by_special[special.replace("-", "_")].append(record)

    confidence_counts = Counter(str((review_overrides.get(str(r["test"]), {}) or {}).get("confidence") or "") for r in records)
    disposition_counts = Counter(str((review_overrides.get(str(r["test"]), {}) or {}).get("disposition") or "") for r in records)

    lines = [
        f"# {report_cfg.get('title', 'Test Provenance')}",
        "",
        "This report joins machine-readable provenance with handwritten review metadata.",
        "",
        "## Status",
        "",
    ]
    if issue_cfg.get("parent_issue"):
        lines.append(f"- Parent issue: #{issue_cfg['parent_issue']}")
    if issue_cfg.get("audit_issue"):
        lines.append(f"- Audit issue: #{issue_cfg['audit_issue']}")
    lines.extend(
        [
            f"- Active tests traced: {len(records)}",
            f"- Tests missing group metadata: {len(missing_metadata)}",
            "",
            "## Headline Counts",
            "",
            f"- Active tests traced: {len(records)}",
        ]
    )
    for label in ["broad-smoke", "patch", "upgrade", "replay"]:
        if special_counts[label]:
            lines.append(f"- {label} tests tracked: {special_counts[label]}")
    lines.extend(
        [
            "",
            "## Dispositions",
            "",
        ]
    )
    for disposition, count in sorted(disposition_counts.items()):
        if disposition:
            lines.append(f"- `{disposition}`: {count}")
    lines.extend(
        [
            "",
            "## Confidence",
            "",
        ]
    )
    for confidence, count in sorted(confidence_counts.items()):
        if confidence:
            lines.append(f"- `{confidence}`: {count}")
    lines.extend(
        [
            "",
            "## Decision Buckets",
            "",
            "| Bucket | Tests |",
            "| --- | ---: |",
        ]
    )
    for key in ["remove", "rewrite", "move_upstream", "conditional", "always_run", "analysis"]:
        label = bucket_labels[key]
        lines.append(f"| {label} | {len(rows_by_bucket[label])} |")
    lines.append("")

    for key in ["remove", "rewrite", "move_upstream", "conditional", "always_run", "analysis"]:
        label = bucket_labels[key]
        lines.extend(render_table(label, rows_by_bucket[label], metadata_by_test, review_overrides))

    lines.extend(render_special_section("Live Patch-backed Tests", rows_by_special["patch"], metadata, review_overrides, "patch"))
    lines.extend(render_special_section("Upgrade Tests", rows_by_special["upgrade"], metadata, review_overrides, "upgrade"))
    lines.extend(render_special_section("Replay Tests", rows_by_special["replay"], metadata, review_overrides, "replay"))
    lines.extend(render_special_section("Broad Smoke Tests", rows_by_special["broad_smoke"], metadata, review_overrides, "broad_smoke"))

    if missing_metadata:
        lines.extend(
            [
                "## Missing Metadata",
                "",
                "These tests were discovered in provenance, but do not yet have group metadata:",
                "",
            ]
        )
        for test in sorted(missing_metadata):
            lines.append(f"- `{test}`")
        lines.append("")

    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("config", help="Path to repo-audit.yaml")
    parser.add_argument("metadata", help="Path to audit-metadata.yaml")
    parser.add_argument("--output", help="Write markdown to this path instead of config report.markdown_path")
    args = parser.parse_args()

    config_path = Path(args.config).expanduser().resolve()
    metadata_path = Path(args.metadata).expanduser().resolve()
    config = load_yaml(config_path)
    metadata = load_yaml(metadata_path)

    config_dir = config_path.parent
    report_cfg = config.get("report", {})
    machine_json = resolve_path(config_dir, str(report_cfg.get("machine_json_path", "test-provenance.json")))
    output_path = resolve_path(config_dir, args.output or str(report_cfg.get("markdown_path", "TEST_PROVENANCE.md")))

    records = json.loads(machine_json.read_text(encoding="utf-8"))
    if not isinstance(records, list):
        raise SystemExit(f"expected list in {machine_json}")

    output_path.write_text(render_report(config, metadata, records), encoding="utf-8")
    print(f"Wrote {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
