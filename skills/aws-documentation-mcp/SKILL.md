---
name: aws-documentation-mcp
description: Search, read, and cite official AWS documentation through an AWS documentation connection in Executor. Use when a task depends on AWS service behavior, API constraints, IAM permissions, feature support, configuration requirements, or current AWS guidance.
compatibility: Requires an Executor MCP server with an AWS documentation connection.
---

# AWS Documentation MCP

Use the AWS documentation connection through Executor. Follow the selected server's advertised discovery and execution guidance, inspect live tool schemas, and call the returned paths; do not assume connection addresses.

## Workflow

1. Use `search_documentation` for the AWS concept or exact service feature. Use specific service names and technical terms.
2. Use the discovered documentation-reading action to read the most authoritative result before making a claim. If required content is truncated, follow its live pagination or section-reading guidance.
3. Use section- or table-specific actions when the connection exposes them; otherwise read the relevant source text. A truncated table is not evidence that a row is absent.
4. Cite the AWS documentation URLs used in the answer. Distinguish documented facts from conclusions or recommendations.

Use a related-pages recommendation action only when the connection exposes one and related AWS pages are useful. Prefer an AWS API reference for request shapes and constraints, and an AWS developer or user guide for workflows and recommended practice.

For AWS China, verify that the connection supports the required partition and documentation domain. A local `AWS_DOCUMENTATION_PARTITION` environment variable does not configure the remote executor connection. If support is unavailable, report the limitation rather than treating standard-partition documentation as China-specific evidence.

If actions are missing, follow the server's discovery diagnostics before concluding that AWS documentation is unavailable. If the connection fails, report the failure and required connection setup; do not install a local server as an automatic fallback.
