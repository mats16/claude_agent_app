---
name: databricks-api
description: Databricks REST API and CLI usage for workspace operations
version: 0.0.1
---

# Overview

How to manage resources using Databricks REST API. Primarily use CLI, and call REST API directly for resources not supported by CLI.

## Authentication

Environment variables `DATABRICKS_HOST` and `DATABRICKS_TOKEN` are assumed to be set.

```bash
# Check environment variables
echo $DATABRICKS_HOST
echo $DATABRICKS_TOKEN
```

## Best Practices

- Prefer CLI for operations that are supported
- Use `-o json` option for CLI commands to get JSON output
- Use `curl` for direct API calls

## Workspace API

### File/Notebook Operations (CLI)

```bash
# List workspace contents
databricks workspace list /Users/$USER -o json

# Export notebook
databricks workspace export /path/to/notebook output.py -o json

# Import notebook
databricks workspace import input.py /path/to/notebook -l PYTHON -o json

# Create directory
databricks workspace mkdirs /path/to/directory -o json

# Delete file
databricks workspace delete /path/to/file -o json
```

### Workspace Status (API)

Get detailed workspace information not supported by CLI:

```bash
# Get workspace details
curl -X GET "${DATABRICKS_HOST}/api/2.0/workspace/get-status" \
  -H "Authorization: Bearer ${DATABRICKS_TOKEN}" \
  -d '{"path": "/Users/your.email@example.com"}'
```

## Jobs API

### Job Management (CLI)

```bash
# List jobs
databricks jobs list -o json

# Get job details
databricks jobs get --job-id <job-id> -o json

# Run job
databricks jobs run-now --job-id <job-id> -o json

# Get run history
databricks jobs list-runs --job-id <job-id> -o json

# Cancel run
databricks jobs cancel-run --run-id <run-id> -o json
```

### Create Job (API)

Create complex configurations directly via API:

```bash
curl -X POST "${DATABRICKS_HOST}/api/2.1/jobs/create" \
  -H "Authorization: Bearer ${DATABRICKS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Job",
    "tasks": [{
      "task_key": "main",
      "notebook_task": {
        "notebook_path": "/Users/your.email@example.com/notebook",
        "source": "WORKSPACE"
      },
      "new_cluster": {
        "spark_version": "13.3.x-scala2.12",
        "node_type_id": "i3.xlarge",
        "num_workers": 2
      }
    }]
  }'
```

## Clusters API

### Cluster Management (CLI)

```bash
# List clusters
databricks clusters list -o json

# Get cluster details
databricks clusters get --cluster-id <cluster-id> -o json

# Start cluster
databricks clusters start --cluster-id <cluster-id> -o json

# Stop cluster
databricks clusters stop --cluster-id <cluster-id> -o json

# Delete cluster
databricks clusters delete --cluster-id <cluster-id> -o json
```

### Create Cluster (API)

```bash
curl -X POST "${DATABRICKS_HOST}/api/2.0/clusters/create" \
  -H "Authorization: Bearer ${DATABRICKS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "cluster_name": "my-cluster",
    "spark_version": "13.3.x-scala2.12",
    "node_type_id": "i3.xlarge",
    "num_workers": 2,
    "autotermination_minutes": 60
  }'
```

## DBFS API

### File Operations (CLI)

```bash
# List DBFS files
databricks fs ls dbfs:/path/ -o json

# Upload file
databricks fs cp local-file.txt dbfs:/path/file.txt -o json

# Download file
databricks fs cp dbfs:/path/file.txt local-file.txt -o json

# Delete file
databricks fs rm dbfs:/path/file.txt -o json
```

## Repos API (Git Integration)

### Repository Operations (CLI)

```bash
# List repositories
databricks repos list -o json

# Create repository
databricks repos create --url https://github.com/user/repo --provider github -o json

# Update repository (switch branch)
databricks repos update --repo-id <repo-id> --branch main -o json

# Delete repository
databricks repos delete --repo-id <repo-id> -o json
```

## Secrets API

### Secret Management (CLI)

```bash
# List secret scopes
databricks secrets list-scopes -o json

# Create secret scope
databricks secrets create-scope --scope my-scope -o json

# Put secret
databricks secrets put --scope my-scope --key my-key --string-value "secret-value" -o json

# List secrets
databricks secrets list --scope my-scope -o json

# Delete secret
databricks secrets delete --scope my-scope --key my-key -o json
```

## SQL API

### SQL Warehouse Operations (API)

```bash
# List SQL warehouses
curl -X GET "${DATABRICKS_HOST}/api/2.0/sql/warehouses" \
  -H "Authorization: Bearer ${DATABRICKS_TOKEN}"

# Start SQL warehouse
curl -X POST "${DATABRICKS_HOST}/api/2.0/sql/warehouses/<warehouse-id>/start" \
  -H "Authorization: Bearer ${DATABRICKS_TOKEN}"

# Stop SQL warehouse
curl -X POST "${DATABRICKS_HOST}/api/2.0/sql/warehouses/<warehouse-id>/stop" \
  -H "Authorization: Bearer ${DATABRICKS_TOKEN}"
```

### Execute Query (API)

```bash
# Execute statement
curl -X POST "${DATABRICKS_HOST}/api/2.0/sql/statements" \
  -H "Authorization: Bearer ${DATABRICKS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "warehouse_id": "<warehouse-id>",
    "statement": "SELECT * FROM catalog.schema.table LIMIT 10",
    "wait_timeout": "30s"
  }'
```

## MLflow API

### MLflow Tracking (API)

```bash
# List experiments
curl -X GET "${DATABRICKS_HOST}/api/2.0/mlflow/experiments/list" \
  -H "Authorization: Bearer ${DATABRICKS_TOKEN}"

# Create experiment
curl -X POST "${DATABRICKS_HOST}/api/2.0/mlflow/experiments/create" \
  -H "Authorization: Bearer ${DATABRICKS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "/Users/your.email@example.com/my-experiment"
  }'

# Search runs
curl -X GET "${DATABRICKS_HOST}/api/2.0/mlflow/runs/search" \
  -H "Authorization: Bearer ${DATABRICKS_TOKEN}" \
  -d "experiment_ids=<experiment-id>"
```

## Unity Catalog API

Unity Catalog operations are handled by CLI (see databricks-cli skill).

Use API for detailed permission management not supported by CLI:

```bash
# Get table permissions
curl -X GET "${DATABRICKS_HOST}/api/2.1/unity-catalog/permissions/table/<catalog>.<schema>.<table>" \
  -H "Authorization: Bearer ${DATABRICKS_TOKEN}"

# Grant permissions
curl -X PATCH "${DATABRICKS_HOST}/api/2.1/unity-catalog/permissions/table/<catalog>.<schema>.<table>" \
  -H "Authorization: Bearer ${DATABRICKS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "changes": [{
      "principal": "user@example.com",
      "add": ["SELECT", "MODIFY"]
    }]
  }'
```

## Tips

- Use `--help` option to display detailed help for each command
- Split long commands into variables for better readability
- Add error handling with `|| echo "Error"`

## Error Handling

```bash
# API call error handling example
response=$(curl -s -w "\n%{http_code}" -X GET "${DATABRICKS_HOST}/api/2.0/clusters/list" \
  -H "Authorization: Bearer ${DATABRICKS_TOKEN}")

http_code=$(echo "$response" | tail -n 1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" -eq 200 ]; then
  echo "$body"
else
  echo "Error: HTTP $http_code"
  echo "$body"
fi
```

## Related Resources

- [Databricks REST API Reference](https://docs.databricks.com/api/workspace/introduction)
- [Databricks CLI Documentation](https://docs.databricks.com/dev-tools/cli/index.html)
- [Unity Catalog API](https://docs.databricks.com/api/workspace/unitycatalog)
