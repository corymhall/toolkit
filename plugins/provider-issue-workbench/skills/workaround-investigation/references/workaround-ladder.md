# Workaround Ladder

Use this ladder to search for mitigations from narrowest to broadest.

## Preferred Order

1. Config or usage workaround
2. Lifecycle or flag workaround
3. Narrow normalization or guard
4. Alternate resource flow
5. Broader patch idea

Do not jump straight to a broad redesign when a narrow workaround may exist.

## Validation Levels

- Idea only
- Locally staged
- Locally validated
- Validated in the real failing path

Be explicit about which level you reached.

## Report Shape

For each serious candidate, record:

- what it changes
- why it might work
- what evidence supports it
- what risk remains
