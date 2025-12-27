---
name: databricks-apps
description: Databricks Apps deployment, debugging, and configuration management. Use when working with Databricks Apps issues including deployment failures, app configuration (app.yaml), checking logs, granting permissions to SQL warehouses or Unity Catalog resources, troubleshooting app errors, or managing app state (start/stop). Triggered by mentions of SESSION_APP_NAME, app.yaml, deployment errors, or permission issues with Apps.
---

# Databricks Apps

## Environment

- App name: `$SESSION_APP_NAME`
- Auto deploy: When `APP_AUTO_DEPLOY=true`, app deploys automatically on session stop

## Core Workflow

### 1. Always Check State First

```bash
databricks apps get $SESSION_APP_NAME -o json
```

Key fields: `compute_status.state`, `active_deployment.status.state`, `user_api_scopes`, `resources`

### 2. Check Logs When Issues Occur

```bash
# App logs
databricks apps logs $SESSION_APP_NAME

# Deployment logs
databricks apps logs $SESSION_APP_NAME --deployment-id DEPLOYMENT_ID
```

### 3. Restart App After Config Changes

```bash
databricks apps stop $SESSION_APP_NAME --no-wait
databricks apps start $SESSION_APP_NAME
```

## Authorization: User-on-behalf-of (Primary Method)

**Authorization CANNOT be configured in app.yaml.** Use `databricks apps update`.

### Required Scopes for Unity Catalog Table Access

```bash
databricks apps update $SESSION_APP_NAME --json '{
  "user_api_scopes": ["sql", "catalog.schemas:read", "catalog.tables:read", "unity-catalog"]
}'
```

**All four scopes are required** for table access:
- `sql` - SQL Warehouse access
- `catalog.schemas:read` - schema metadata
- `catalog.tables:read` - table metadata
- `unity-catalog` - data access

### With Resource ID Environment Variables

When app code needs resource IDs via environment variables (e.g., `DATABRICKS_RESOURCE_SQL_WAREHOUSE_ID`):

```bash
databricks apps update $SESSION_APP_NAME --json '{
  "user_api_scopes": ["sql", "catalog.schemas:read", "catalog.tables:read", "unity-catalog"],
  "resources": [
    {
      "name": "sql_warehouse",
      "sql_warehouse": { "id": "WAREHOUSE_ID", "permission": "CAN_USE" }
    }
  ]
}'
```

### All Available Scopes

| scope | Description |
|-------|-------------|
| `sql` | SQL Warehouse |
| `catalog.schemas:read` | Schema metadata (required for table access) |
| `catalog.tables:read` | Table metadata (required for table access) |
| `unity-catalog` | Unity Catalog data |
| `serving` | Model Serving Endpoint |
| `vector-search` | Vector Search Index |
| `genie` | Genie Space |
| `jobs` | Jobs |
| `secrets` | Secret Scope |

## Connecting to SQL Warehouse

```python
from databricks import sql
import os

connection = sql.connect(
    server_hostname=os.environ["DATABRICKS_HOST"],
    http_path=f"/sql/1.0/warehouses/{os.environ['DATABRICKS_RESOURCE_SQL_WAREHOUSE_ID']}",
    access_token=os.environ["DATABRICKS_API_TOKEN"]
)

cursor = connection.cursor()
cursor.execute("SELECT * FROM range(10)")
print(cursor.fetchall())
cursor.close()
connection.close()
```

- `DATABRICKS_HOST`, `DATABRICKS_API_TOKEN`: Auto-injected by runtime
- `DATABRICKS_RESOURCE_SQL_WAREHOUSE_ID`: Requires `resources` configuration
- Do NOT use other authentication methods

## Troubleshooting Quick Reference

| Issue | First Action |
|-------|--------------|
| Deployment failed | `databricks apps logs $SESSION_APP_NAME --deployment-id ID` |
| Permission error | Check `user_api_scopes` includes all required scopes |
| Table access denied | Ensure ALL 4 scopes: sql, catalog.schemas:read, catalog.tables:read, unity-catalog |
| App not accessible | Check `compute_status.state` is ACTIVE |
| App crashes | `databricks apps logs $SESSION_APP_NAME` |

For detailed troubleshooting: [troubleshooting.md](references/troubleshooting.md)

## Service Principal (Use Only When Necessary)

Use Service Principal only when:
- Background jobs with no user context
- Shared authentication required across all users

For Service Principal setup: [cli-reference.md](references/cli-reference.md#service-principal-resource-configuration)

## References

- [CLI Reference](references/cli-reference.md): All CLI commands and resource type configurations
- [Troubleshooting Guide](references/troubleshooting.md): Detailed issue diagnosis and solutions
