---
name: aws-documentation-mcp
description: Search, read, and cite official AWS documentation through the AWS Labs Documentation connection in executor. Use when a task depends on AWS service behavior, API constraints, IAM permissions, feature support, configuration requirements, or current AWS guidance.
compatibility: Requires the executor MCP server with an AWS Labs Documentation connection.
---

# AWS Documentation MCP

Use the AWS documentation connection through executor. Discover actions with `executor_search_awslabs_aws_documentation_mcp`. Before calling `executor_execute`, read `executor_skills` with `name: "execute"`. Inspect live tool schemas and call the returned paths; do not assume connection addresses.

## Workflow

1. Use `search_documentation` for the AWS concept or exact service feature. Use specific service names and technical terms.
2. Use `read_documentation` to read the most authoritative result before making a claim. Continue with `start_index` when required content is truncated.
3. Use `read_sections` for named sections and `search_table` for specific rows in large tables. A truncated table is not evidence that a row is absent.
4. Cite the AWS documentation URLs used in the answer. Distinguish documented facts from conclusions or recommendations.

Use `recommend` only when related AWS pages are useful. Prefer an AWS API reference for request shapes and constraints, and an AWS developer or user guide for workflows and recommended practice.

For AWS China, verify that the connection supports the required partition and documentation domain. A local `AWS_DOCUMENTATION_PARTITION` environment variable does not configure the remote executor connection. If support is unavailable, report the limitation rather than treating standard-partition documentation as China-specific evidence.

If discovery tools are missing, refresh the executor tool list before concluding that AWS documentation is unavailable. If the connection fails, report the failure and required connection setup; do not install a local server as an automatic fallback.
