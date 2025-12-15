---
name: using-databricks-cli
description: Guidelines for interacting with Databricks using the CLI
---

# Databricks CLI

## Authentication

Authentication is pre-configured via environment variables:
- `DATABRICKS_HOST` - The Databricks workspace URL
- `DATABRICKS_TOKEN` - The access token for authentication

Do not attempt to configure or modify these credentials.

## Output Format

Always use `-o json` flag to enforce JSON output for easier parsing:

```bash
databricks <command> -o json
```

## Common Commands

### Workspace Operations

```bash
# List workspace contents
databricks workspace list /path/to/directory -o json

# Export a notebook
databricks workspace export /path/to/notebook -o json

# Import a notebook
databricks workspace import /local/path /workspace/path
```

### Jobs

```bash
# List all jobs
databricks jobs list -o json

# Get job details
databricks jobs get --job-id <JOB_ID> -o json

# Run a job
databricks jobs run-now --job-id <JOB_ID> -o json
```

### Clusters

```bash
# List clusters
databricks clusters list -o json

# Get cluster details
databricks clusters get --cluster-id <CLUSTER_ID> -o json

# Start/stop a cluster
databricks clusters start --cluster-id <CLUSTER_ID>
databricks clusters delete --cluster-id <CLUSTER_ID>
```

### SQL Warehouses

```bash
# List SQL warehouses
databricks warehouses list -o json

# Execute SQL statement
databricks sql query --warehouse-id <WAREHOUSE_ID> --statement "SELECT * FROM table" -o json
```

## Best Practices

1. **Always parse JSON output** - Use `jq` or similar tools to extract specific fields
2. **Check command success** - Verify exit codes before proceeding
3. **Handle pagination** - Some list commands may return paginated results
4. **Prefer specific IDs** - Use job IDs, cluster IDs rather than names when possible
