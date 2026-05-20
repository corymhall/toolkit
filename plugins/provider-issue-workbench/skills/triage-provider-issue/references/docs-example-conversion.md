# Docs And Example Conversion

Use this reference when a provider issue involves generated docs, converted
Terraform examples, or unexpected casing in examples.

## Pipeline

For bridged providers, generated docs examples usually flow through:

1. `tfgen` extracts upstream Terraform markdown and HCL examples.
2. The bridge invokes `pulumi convert --from terraform --language pcl`.
3. `pulumi-converter-terraform` emits PCL.
4. The bridge converts PCL to target languages with core `hcl2*` generators.

Do not assign ownership from final SDK docs alone. Compare source Terraform,
generated PCL, and target-language output.

## Discriminator

Create the smallest synthetic example that reproduces the suspicious shape.
Prefer real resource tokens and property names when they are known.

Run Terraform to PCL:

```bash
pulumi convert --from terraform --language pcl --out out-pcl --generate-only
```

Then run known-good PCL to representative languages:

```bash
pulumi convert --from pcl --language typescript --out out-ts --generate-only
pulumi convert --from pcl --language python --out out-python --generate-only
pulumi convert --from pcl --language go --out out-go --generate-only
```

Interpretation:

- Source Terraform correct, PCL wrong: suspect `pulumi-converter-terraform` or
  mapping information passed to it.
- PCL correct, target language wrong: suspect core `hcl2*` language generator.
- PCL cannot bind because schema/mappings are absent: report that limitation
  and use checked-in generated docs or `tfgen` output as supporting evidence.
- Pulumi schema has the wrong shape before conversion: suspect provider or
  bridge schema generation.

## Any And Dynamic Values

Object keys inside `Any`, dynamic, JSON-like, or otherwise opaque values should
be treated as data keys unless explicit provider metadata says otherwise.
Recasing those keys can change provider behavior.

Default routing rule:

- Typed Pulumi object property: convert keys to Pulumi names.
- Map: preserve keys.
- `Any`, dynamic, JSON-like, or unknown shape: preserve keys.

If an `Any` value appears to require Pulumi-shaped nested casing, do not infer
that from examples alone. Call out that the converter needs explicit metadata
or a targeted override to do that safely.

## Reporting Shape

For a converter issue, include:

- source Terraform HCL
- generated PCL
- one target-language output if useful
- the relevant Pulumi schema shape (`Any`, map, typed object, or unknown)
- why the observed key spelling is semantically meaningful

For the provider issue, include:

- user-visible workaround
- link to the upstream converter/core/bridge issue
- whether local provider action remains
- labels that reflect the provider-side state, such as docs/usability plus an
  awaiting label when the actionable fix moved elsewhere
