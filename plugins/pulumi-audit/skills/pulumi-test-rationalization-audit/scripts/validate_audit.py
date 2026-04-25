#!/usr/bin/env python3
"""
Validate that an audit dataset is complete enough to trust for reporting or follow-up work.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any

import yaml


REQUIRED_METADATA_FIELDS = [
    "behavior_under_test",
    "layer_under_test",
    "recommended_home",
    "cadence",
]

REQUIRED_REVIEW_FIELDS = [
    "disposition",
    "confidence",
    "replacement_coverage",
    "evidence_needed",
    "root_cause",
    "last_reviewed",
]

REQUIRED_BUCKET_KEYS = ["remove", "rewrite", "move_upstream", "conditional", "always_run", "analysis"]


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


def has_value(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    return True


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


def build_metadata_by_test(metadata: dict[str, Any], errors: list[str]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    seen_groups: dict[str, int] = {}

    for index, group in enumerate(metadata.get("groups", []), start=1):
        shared = {
            "layer_under_test": group.get("layer_under_test", ""),
            "recommended_home": group.get("recommended_home", ""),
            "cadence": group.get("cadence", ""),
            "behavior_under_test": group.get("behavior_under_test", ""),
        }
        for test in group.get("tests", []):
            key = str(test)
            if key in seen_groups:
                errors.append(
                    f"{key}: appears in more than one group (group {seen_groups[key]} and group {index})"
                )
            seen_groups[key] = index
            result[key] = dict(shared)

    for test, override in metadata.get("metadata_overrides", {}).items():
        result.setdefault(str(test), {}).update(override or {})

    return result


def classify_special_bucket(test: str, metadata: dict[str, Any], errors: list[str]) -> str | None:
    special = metadata.get("special_tracking", {})
    hits = []
    for label, map_name in [
        ("patch", "patch"),
        ("upgrade", "upgrade"),
        ("replay", "replay"),
        ("broad_smoke", "broad_smoke"),
    ]:
        if test in (special.get(map_name, {}) or {}):
            hits.append(label)
    if len(hits) > 1:
        errors.append(f"{test}: appears in multiple special tracking buckets: {', '.join(hits)}")
    return hits[0] if hits else None


def labels(config: dict[str, Any]) -> dict[str, str]:
    return dict(config.get("labels", {}).get("decision_buckets", {}))


def classify_decision_bucket(
    test: str,
    metadata: dict[str, Any],
    review: dict[str, Any],
    bucket_labels: dict[str, str],
    errors: list[str],
) -> str:
    disposition = str(review.get("disposition") or "")
    special = classify_special_bucket(test, metadata, errors)
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


def unknown_override_tests(
    label: str,
    values: dict[str, Any],
    discovered: set[str],
    errors: list[str],
) -> None:
    for test in values:
        if str(test) not in discovered:
            errors.append(f"{label}: unknown test {test}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("config", help="Path to repo-audit.yaml")
    parser.add_argument("metadata", help="Path to audit-metadata.yaml")
    parser.add_argument(
        "--mode",
        choices=["progress", "complete"],
        default="progress",
        help="Validation mode: progress checks structure for iterative work, complete enforces full row coverage",
    )
    parser.add_argument(
        "--allow-analysis",
        action="store_true",
        help="Allow tests to remain in the Still Needs Analysis bucket in complete mode",
    )
    args = parser.parse_args()

    config_path = Path(args.config).expanduser().resolve()
    metadata_path = Path(args.metadata).expanduser().resolve()
    config = load_yaml(config_path)
    metadata = load_yaml(metadata_path)

    config_dir = config_path.parent
    machine_json = resolve_path(
        config_dir,
        str(config.get("report", {}).get("machine_json_path", "test-provenance.json")),
    )
    records = json.loads(machine_json.read_text(encoding="utf-8"))
    if not isinstance(records, list):
        raise SystemExit(f"expected list in {machine_json}")

    errors: list[str] = []
    warnings: list[str] = []

    discovered_tests = [str(record.get("test") or "") for record in records]
    if not any(discovered_tests):
        errors.append("no tests found in machine JSON; check discovery.roots and provenance generation")
    duplicates = [name for name, count in Counter(discovered_tests).items() if name and count > 1]
    for test in sorted(duplicates):
        errors.append(
            f"{test}: discovered more than once; rename or extend the tooling because row-level keys are test-name based"
        )

    discovered = {test for test in discovered_tests if test}
    metadata_by_test = build_metadata_by_test(metadata, errors)
    review_overrides = metadata.get("review_overrides", {})
    special_tracking = metadata.get("special_tracking", {})

    for group in metadata.get("groups", []):
        for test in group.get("tests", []):
            if str(test) not in discovered:
                errors.append(f"groups: unknown test {test}")

    unknown_override_tests("metadata_overrides", metadata.get("metadata_overrides", {}), discovered, errors)
    unknown_override_tests("review_overrides", review_overrides, discovered, errors)
    for bucket_name, bucket in special_tracking.items():
        unknown_override_tests(f"special_tracking.{bucket_name}", bucket or {}, discovered, errors)

    reviewed_count = 0
    metadata_count = 0
    missing_metadata_rows: list[str] = []
    missing_review_rows: list[str] = []
    for test in sorted(discovered):
        row_metadata = metadata_by_test.get(test, {})
        if row_metadata:
            metadata_count += 1
            for field in REQUIRED_METADATA_FIELDS:
                if not has_value(row_metadata.get(field)):
                    errors.append(f"{test}: missing metadata field {field}")
        else:
            missing_metadata_rows.append(test)

        review = review_overrides.get(test, {})
        if review:
            reviewed_count += 1
            for field in REQUIRED_REVIEW_FIELDS:
                if not has_value(review.get(field)):
                    errors.append(f"{test}: missing review field {field}")
            if not has_value(review.get("needs_migration_spike")):
                warnings.append(f"{test}: missing optional review field needs_migration_spike")
        else:
            missing_review_rows.append(test)

    bucket_labels = labels(config)
    missing_bucket_keys = [key for key in REQUIRED_BUCKET_KEYS if key not in bucket_labels]
    for key in missing_bucket_keys:
        errors.append(f"config.labels.decision_buckets missing key {key}")

    bucket_counts: Counter[str] = Counter()
    if not missing_bucket_keys:
        for test in sorted(discovered):
            review = review_overrides.get(test, {}) or {}
            if args.mode == "progress" and not review:
                continue
            bucket = classify_decision_bucket(
                test,
                metadata,
                review,
                bucket_labels,
                errors,
            )
            bucket_counts[bucket] += 1

        analysis_bucket = bucket_labels["analysis"]
        if args.mode == "complete" and bucket_counts[analysis_bucket] and not args.allow_analysis:
            errors.append(
                f"{analysis_bucket}: {bucket_counts[analysis_bucket]} test(s) still unresolved; pass --allow-analysis if that is intentional"
            )

    if args.mode == "complete":
        for test in missing_metadata_rows:
            errors.append(f"{test}: missing metadata row")
        for test in missing_review_rows:
            errors.append(f"{test}: missing review_overrides row")
    else:
        if missing_metadata_rows:
            warnings.append(f"{len(missing_metadata_rows)} discovered test(s) still missing metadata rows")
        if missing_review_rows:
            warnings.append(f"{len(missing_review_rows)} discovered test(s) still missing review rows")

    if errors:
        print("Validation failed.")
        for error in sorted(set(errors)):
            print(f"ERROR: {error}")
        for warning in sorted(set(warnings)):
            print(f"WARN: {warning}")
        return 1

    print(f"Validation passed in {args.mode} mode for {len(discovered)} discovered tests.")
    print(f"COVERAGE: metadata rows = {metadata_count}/{len(discovered)}")
    print(f"COVERAGE: reviewed rows = {reviewed_count}/{len(discovered)}")
    for label, count in sorted(bucket_counts.items()):
        print(f"BUCKET: {label} = {count}")
    for warning in sorted(set(warnings)):
        print(f"WARN: {warning}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
