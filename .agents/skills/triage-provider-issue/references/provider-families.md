# Provider Implementation Families

Use this reference to identify the first ownership boundaries to inspect. It is a routing aid, not a substitute for repository evidence.

## Bridged Provider

Typical boundaries include:

- Pulumi engine lifecycle and checkpoint behavior
- Pulumi-to-Terraform bridge translation
- provider metadata, overlays, mappings, and patches
- upstream Terraform provider schema and runtime behavior
- converters and language generators for generated examples

Terraform parity can be a decisive discriminator. Use installed bridged-provider skills for Terraform repros, bridge cross-tests, or detailed bridge lifecycle work.

## Native Provider

Typical boundaries include:

- Pulumi engine lifecycle behavior
- native provider runtime behavior
- schema source and generated schema
- cloud API or SDK behavior
- identifier, import, refresh, and state normalization
- native code generation

Do not substitute Terraform parity for native-provider evidence. Ask which observation would actually change the ownership recommendation.

## Component Provider

Typical boundaries include:

- component construction logic
- parent and child resource options
- provider propagation to child resources
- language host versus provider execution
- component schema and generated SDKs
- behavior inherited from underlying resource providers

Preserve the parent-to-child dataflow and resource options when staging a repro.

## Unknown Or Mixed Family

Inspect the repository layout and resource implementation before selecting a family. Some repositories contain more than one implementation style. Route the specific resource or failing path rather than assigning one family to the entire repository by name alone.
