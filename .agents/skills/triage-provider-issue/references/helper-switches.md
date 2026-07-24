# Specialist Capability Switches

Use these switches explicitly. Provider-family specialists may not be installed in every repository; select only an available capability that matches the implementation family.

## Switch To `stage-pulumi-provider-repro`

When:

- the best next step is a durable Pulumi repro artifact
- a maintainer-quality example or test is needed
- the issue turns on update, read, refresh, import, preview, diff, or `--refresh --run-program`
- the opposite Pulumi repro result would change routing

## Switch To `stage-terraform-provider-repro`

When the skill is installed and:

- Terraform behavior is the sharpest discriminator
- parity with Terraform determines bridged-provider routing
- an upstream acceptance test or durable Terraform artifact is needed
- the opposite Terraform result would change routing

Do not use Terraform parity as a default discriminator for native or component providers.

## Switch To `bridge-parity-investigation`

When the skill is installed and all of these are true:

- Pulumi behavior is established
- Terraform behavior is known and differs meaningfully
- the next useful step is to explain or capture the bridge parity gap

Do not switch early. If Terraform parity remains unknown, use the Terraform repro specialist first.

Do not call `awaiting/bridge` while the next real question is still whether Terraform behaves the same way.

## Switch To `pulumi-rpc-lifecycle-investigation`

When the skill is installed and:

- the next best evidence is the actual Pulumi RPC timeline
- gRPC logs exist or can be collected with `PULUMI_DEBUG_GRPC`
- ownership depends on how values moved through engine, bridge, provider, and upstream Terraform layers
- refresh, import, replacement, `Check`, `Diff`, `Read`, old inputs, state, or unknown values are central

Use this before a bridge parity cross-test when the lifecycle path itself is ambiguous.

## Switch To `investigate-converted-provider-docs`

When the skill is installed and:

- a bridged provider has incorrect generated documentation or examples
- Terraform source, generated PCL, and target-language output must be compared
- ownership may lie in schema generation, `tfgen`, the Terraform converter, the bridge, or a core language generator

## Enter Workaround Investigation

Read `references/workaround-investigation.md` when:

- the ownership boundary is clear enough for practical purposes
- the user still needs a mitigation
- another attribution pass is less valuable than workaround validation

State that triage is complete and the session is entering workaround mode.
