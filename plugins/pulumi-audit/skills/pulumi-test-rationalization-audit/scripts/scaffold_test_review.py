#!/usr/bin/env python3
"""
Print a YAML stub for a single test review entry.
"""

from __future__ import annotations

import argparse


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("test_name", help="Test name, for example TestSecurityGroupPreviewWarning")
    args = parser.parse_args()

    print(
        f"""metadata_overrides:
  {args.test_name}:
    behavior_under_test: ""

review_overrides:
  {args.test_name}:
    working_state: "Needs more evidence"
    disposition:
    confidence:
    needs_migration_spike:
    upstream_plan_ready: "No"
    replacement_coverage: ""
    evidence_needed: ""
    root_cause: ""
    obsolete_since: ""
    last_reviewed: ""
"""
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
