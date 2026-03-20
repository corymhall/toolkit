# Personal Pack Prompt Candidates

The local `personal` pack prompt surface should only hold behavior that is
personal-specific.

Candidate direction:

- keep `base` identity and shared fragments
- add personal-only autonomy guidance only where it genuinely diverges
- avoid copying the full owner-session prompt just to change a small policy

Open questions:

- Do we want a separate personal owner prompt at all, or only personal-specific
  overlays/fragments?
- Which behaviors are safer as config than as prompt text?
