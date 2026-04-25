# Repo Profiles

Choose one profile before writing ownership metadata.

When the repo is unfamiliar, pick the profile by asking which layer most often owns the fix:

- Terraform bridge or provider-host layer: likely `bridged-provider`
- repo-local provider implementation or API-model layer: likely `native-provider`
- higher-level composition and ergonomics over another provider: likely `component-library`

## Bridged Provider

Use for repos like `pulumi-aws`.

Typical ownership layers:

- `local-provider`
- `bridge`
- `pulumi-engine`
- `upstream`
- `smoke`

Typical examples:

- local tags workaround, aliases, overlays, import transforms
- bridge/provider-host diagnostics or diff normalization
- Pulumi engine semantics like secrets or ignoreChanges
- upstream Terraform or API behavior
- broad example smoke or release verification

This profile often produces:

- more `Move upstream`
- more `Covered upstream`
- explicit patch-backed or upgrade-only buckets

## Native Provider

Use for repos like `pulumi-aws-native`.

Typical ownership layers:

- `local-provider`
- `pulumi-engine`
- `upstream-api`
- `smoke`

Typical examples:

- local codegen behavior
- local CRUD or schema wiring
- API-model or Cloud Control quirks
- Pulumi engine/runtime semantics
- broad smoke and release verification

This profile usually keeps more tests local because there is no bridge bucket by default.

## Component Library

Use for repos like `pulumi-awsx`.

Typical ownership layers:

- `local-component`
- `underlying-provider`
- `pulumi-engine`
- `runtime-ergonomics`
- `smoke`

Typical examples:

- component composition behavior
- provider pass-through behavior
- runtime packaging or language ergonomics
- Pulumi engine semantics
- broad example smoke

This profile often produces more “local component” keeps and fewer upstream moves.

## Mapping Guidance

When uncertain between two layers:

- choose the layer that owns the fix, not the layer where the repro happened
- choose `smoke` only when the test is broad confidence coverage rather than a concrete local hook
- prefer `upstream` or `underlying-provider` when the expensive local test only repros a behavior already fixed elsewhere

When uncertain between two profiles:

- inspect 2-3 representative expensive tests before deciding
- prefer the profile that explains the majority of likely “keep” calls
- state the choice as a working assumption and revise it if the evidence disagrees
