---
name: aws-documentation-mcp
description: Search, read, and cite official AWS documentation through the AWS Labs Documentation MCP server with mcporter. Use when a task depends on AWS service behavior, API constraints, IAM permissions, feature support, configuration requirements, or current AWS guidance.
compatibility: Requires Node.js with npx, uvx, and network access to AWS documentation.
---

# AWS Documentation MCP

Use the skill-owned wrapper from this skill directory:

```bash
./scripts/aws-docs-mcp list --brief
```

## Workflow

1. Search for the AWS concept or exact service feature:

   ```bash
   ./scripts/aws-docs-mcp call \
     'aws-docs.search_documentation(search_phrase: "ECS task execution role permissions", limit: 10)'
   ```

2. Read the most authoritative result before making a claim:

   ```bash
   ./scripts/aws-docs-mcp call \
     'aws-docs.read_documentation(url: "https://docs.aws.amazon.com/...", max_length: 12000)'
   ```

3. For a focused page, read named sections or search a large table:

   ```bash
   ./scripts/aws-docs-mcp call \
     'aws-docs.read_sections(url: "https://docs.aws.amazon.com/...", section_titles: ["Section name"])'

   ./scripts/aws-docs-mcp call \
     'aws-docs.search_table(url: "https://docs.aws.amazon.com/...", query: "term", max_rows: 20)'
   ```

4. Cite the AWS documentation URLs used in the answer. Distinguish documented facts from conclusions or recommendations.

Use `aws-docs.recommend` only when related AWS pages are useful. Prefer an AWS API reference for request shapes and constraints, and an AWS developer or user guide for workflows and recommended practice.

Set `AWS_DOCUMENTATION_PARTITION=aws-cn` before the wrapper command when the user asks about AWS China. The default partition is `aws`.
