# Provider Implementation Families

Routing guide for identifying initial resource ownership boundaries across Pulumi provider families.

---

| Provider Family | Subsystem Ownership Boundaries | Key Discriminator Strategy |
| :--- | :--- | :--- |
| **Bridged Provider** | • Pulumi engine lifecycle & checkpoints<br>• Pulumi-to-TF bridge translation (`pkg/bridge`)<br>• Provider metadata, overlays, & patches<br>• Upstream Terraform provider schema/runtime<br>• `tfgen` & docs converter tools | **Conditional TF Parity vs Direct Source:** Terraform parity *can* be decisive when appropriate, but **direct source code evidence (Go source, AST, parser logic, schema metadata) can settle ownership directly without requiring a Terraform repro.** |
| **Native Provider** | • Pulumi engine lifecycle<br>• Native provider runtime (`pulumi-aws-native`)<br>• Schema generation & OpenAPI/CloudControl specs<br>• Cloud API / SDK runtime behavior<br>• Resource ID, import, refresh, & state normalization | **Cloud Spec & Schema Check:** Do **not** use TF parity. Check generated schema vs underlying Cloud API spec or native runtime code. |
| **Component Provider** | • Component construct logic (`pulumi-awsx`)<br>• Parent & child resource options propagation<br>• Language host vs provider execution<br>• Underlying resource provider behavior | **Parent-Child Dataflow:** Preserve resource options & options propagation when staging repros. |

---

## Direct Source Evidence Principle

If direct source code inspection (log traces, Go code, parser logic, AST, or schema metadata) identifies the bug boundary, **settle ownership directly**. Do not defer a source-supported diagnosis or demand a Terraform repro when repository evidence is already sufficient.
