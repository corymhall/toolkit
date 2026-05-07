# Helper Switches

Use these switches explicitly.

## Switch To `stage-pulumi-provider-repro`

When:

- the best next step is a durable Pulumi repro artifact
- you need a maintainer-quality example or test in the provider repo
- the issue turns on update, read, refresh, import, or `--refresh --run-program`

## Switch To `stage-terraform-provider-repro`

When:

- Terraform behavior is the sharpest discriminator
- parity with Terraform determines routing
- an upstream acceptance test or durable Terraform artifact is needed

## Switch To `bridge-parity-investigation`

When all of these are true:

- Pulumi behavior is already reproduced or otherwise established
- Terraform behavior is known and differs in a way that matters
- the next useful step is to explain or capture the parity gap in the bridge

Do not switch early. If Terraform parity is still unknown, use the Terraform
repro helper first.

## Switch To `pulumi-rpc-lifecycle-investigation`

When:

- the next best evidence is the actual Pulumi RPC timeline
- gRPC logs exist or can be collected with `PULUMI_DEBUG_GRPC`
- ownership depends on how values moved through engine, bridge, provider, and
  upstream Terraform layers
- refresh, import, replacement, `Check`/`Diff`/`Read`, old inputs, state, or
  unknown values are central to the question

Use this before a bridge parity cross-test when the lifecycle path itself is
still ambiguous.

## Switch To `workaround-investigation`

When:

- the ownership boundary is clear enough for practical purposes
- the human still needs a mitigation or workaround
- another round of attribution work is less valuable than workaround work
