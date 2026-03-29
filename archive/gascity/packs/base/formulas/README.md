# Base Pack Formula Candidates

This directory is intentionally shape-first in M2.

Current candidates to discuss:

- `delivery-workflow-planned`
- `mol-review-implementation`
- the `mol-polecat-base` factoring pattern as reference only

Questions to resolve before adding real local formula files:

- Which formulas are truly safe across both `work` and `personal` trust classes?
- Which formulas should remain repo-local workflow assets instead of becoming
  reusable pack content?
- Do we borrow the worker-base layering pattern without committing to a real
  shared worker formula in `base` yet?

Current M2 direction:

- borrow the `mol-polecat-base` layering idea as reference
- defer actual worker-formula ownership to later `work` / `personal` stages
- keep `base` formulas as candidates, not commitments, until the local owner
  session and trust split are more settled
