---
name: databricks-apps
description: Databricks Apps deployment, debugging, and configuration management. Use when working with Databricks Apps issues including deployment failures, app configuration (app.yaml), checking logs, granting permissions to SQL warehouses or Unity Catalog resources, troubleshooting app errors, or managing app state (start/stop). Triggered by mentions of SESSION_APP_NAME, app.yaml, deployment errors, or permission issues with Apps.
version: 0.0.5
---

# Databricks Apps

Manage Databricks Apps deployment, debugging, and configuration using the Databricks CLI.

## Important: Choosing Authorization Method

For Databricks Apps, **prioritize User-on-behalf-of Authorization**.

### Authorization Method Priority

1. **User-on-behalf-of Authorization (OAuth scope)** - **Highest Priority**
   - Set `user_api_scopes` using `databricks apps update` command (required)
   - Operations execute with the app user's permissions
   - Enables per-user access control

2. **Service Principal** - **Use only when scope cannot handle the operation**
   - Only when operations cannot be handled by user-on-behalf-of authorization
   - For background jobs where there is no user context
   - When shared authentication across all users is required
   - Set `resources` using `databricks apps update` command (required), then grant permissions to Service Principal

## How to Configure Authorization

**Important**: Authorization settings (`user_api_scopes`, `resources`) cannot be configured in `app.yaml`.
You must use the `databricks apps update` command (internally `PATCH /api/2.0/apps/{app_name}`).

### User-on-behalf-of Authorization Configuration

Configuration for user-on-behalf-of authorization:

1. **`user_api_scopes`** (required): API scopes the app can access on behalf of the user
2. **`resources`** (optional): Set when you need to reference resource IDs as environment variables

**Note**: For user-on-behalf-of authorization, permissions are determined by the app user's permissions, so `resources` is not required for authorization purposes. However, setting `resources` allows you to reference resource IDs (such as WAREHOUSE_ID) as environment variables.

```bash
# User-on-behalf-of authorization (user_api_scopes only - minimal configuration)
databricks apps update $SESSION_APP_NAME --json '{
  "user_api_scopes": ["sql", "unity-catalog"]
}'
```

```bash
# User-on-behalf-of authorization (with resources - when referencing IDs via environment variables)
databricks apps update $SESSION_APP_NAME --json '{
  "user_api_scopes": ["sql", "unity-catalog"],
  "resources": [
    {
      "name": "sql_warehouse",
      "sql_warehouse": {
        "id": "warehouse_id",
        "permission": "CAN_USE"
      }
    },
    {
      "name": "catalog_data",
      "unity_catalog_schema": {
        "catalog_name": "catalog_name",
        "schema_name": "schema_name",
        "permission": "SELECT"
      }
    }
  ]
}'
```

### Referencing Resource Values via Environment Variables

When `resources` is configured, you can reference resource IDs as environment variables within your app:

| resource name | Environment Variable |
|--------------|---------------------|
| `sql_warehouse` | `DATABRICKS_RESOURCE_SQL_WAREHOUSE_ID` etc. |

This allows you to reference resource IDs without hardcoding them in your code.

### user_api_scopes Types

| scope | Description | Corresponding resources (for env var reference) |
|-------|-------------|------------------------------------------------|
| `sql` | Access to SQL Warehouse | `sql_warehouse` |
| `unity-catalog` | Access to Unity Catalog | `unity_catalog_schema` |
| `serving` | Access to Model Serving Endpoint | `serving_endpoint` |
| `vector-search` | Access to Vector Search Index | `vector_search_index` |
| `genie` | Access to Genie Space | `genie_space` |
| `jobs` | Access to Jobs | `job` |
| `secrets` | Access to Secret Scope | `secret_scope` |

### resources Configuration Examples (when referencing IDs via environment variables)

```bash
# SQL Warehouse + Unity Catalog (referencing IDs via env vars)
databricks apps update $SESSION_APP_NAME --json '{
  "user_api_scopes": ["sql", "unity-catalog"],
  "resources": [
    {
      "name": "sql_warehouse",
      "sql_warehouse": {
        "id": "abc123def456",
        "permission": "CAN_USE"
      }
    },
    {
      "name": "main_schema",
      "unity_catalog_schema": {
        "catalog_name": "main_catalog",
        "schema_name": "app_data",
        "permission": "SELECT"
      }
    }
  ]
}'
```

```bash
# Serving Endpoint (referencing name via env var)
databricks apps update $SESSION_APP_NAME --json '{
  "user_api_scopes": ["serving"],
  "resources": [
    {
      "name": "ml_endpoint",
      "serving_endpoint": {
        "name": "my-llm-endpoint",
        "permission": "CAN_QUERY"
      }
    }
  ]
}'
```

```bash
# Vector Search Index (referencing name via env var)
databricks apps update $SESSION_APP_NAME --json '{
  "user_api_scopes": ["vector-search"],
  "resources": [
    {
      "name": "vector_index",
      "vector_search_index": {
        "name": "catalog.schema.index_name",
        "permission": "CAN_USE"
      }
    }
  ]
}'
```

### Service Principal Resource Configuration

When using Service Principal, binding `resources` via `databricks apps update` is **required**. Then grant permissions to the Service Principal.

```bash
# Resource binding (without user_api_scopes - for Service Principal)
# Note: When using Service Principal, resources configuration is required
databricks apps update $SESSION_APP_NAME --json '{
  "resources": [
    {
      "name": "sql_warehouse",
      "sql_warehouse": {
        "id": "warehouse_id",
        "permission": "CAN_USE"
      }
    }
  ]
}'

# Grant permissions to Service Principal
databricks warehouses update-permissions WAREHOUSE_ID --json '{
  "access_control_list": [
    {
      "service_principal_name": "SERVICE_PRINCIPAL_NAME",
      "permission_level": "CAN_USE"
    }
  ]
}'
```

### Common Configuration Mistakes

| Problem | Cause | Solution |
|---------|-------|----------|
| User-on-behalf-of authorization not working | Missing `user_api_scopes` | Add scope via `databricks apps update` |
| Service Principal cannot access resource | Missing `resources` | Add resource via `databricks apps update` (required for Service Principal) |
| Cannot get resource ID via environment variable | Missing `resources` | Add resource via `databricks apps update` |
| Trying to configure in app.yaml | Authorization settings not supported in app.yaml | Use `databricks apps update` |

## Environment

The target app name is available in `SESSION_APP_NAME` environment variable.

```bash
echo $SESSION_APP_NAME
```

### Auto Deploy

When `APP_AUTO_DEPLOY=true`, the app is automatically deployed to `SESSION_APP_NAME` via hooks when the Claude Code session stops. Manual deployment is not required in this case.

## Required: Verify State via CLI

**Always verify current state via CLI before starting work.** Do not proceed based on assumptions.

### 1. Check App State (Required)

```bash
# Get app info (state, service principal, URL, active deployment, resources, user_api_scopes)
databricks apps get $SESSION_APP_NAME -o json
```

Fields to check:
- `compute_status.state`: ACTIVE, STOPPED, ERROR
- `active_deployment.status.state`: SUCCEEDED, FAILED, IN_PROGRESS
- `resources`: Configured resources
- `user_api_scopes`: Configured user-on-behalf-of authorization scopes
- `service_principal_name`: Needed for permission grants (only when user-on-behalf-of cannot handle the operation)

### 2. Check Deployment History

```bash
# List recent deployments
databricks apps list-deployments $SESSION_APP_NAME -o json
```

### 3. Check Logs (Required when issues occur)

```bash
# App logs
databricks api get /api/2.0/apps/$SESSION_APP_NAME/logs

# Deployment logs
databricks apps get-deployment $SESSION_APP_NAME DEPLOYMENT_ID -o json
databricks api get /api/2.0/apps/$SESSION_APP_NAME/deployments/DEPLOYMENT_ID/logs
```

**Important**: When errors occur, do not guess the cause without checking logs.

## Common Tasks

### Check Deployment Status

```bash
# Get specific deployment details
databricks apps get-deployment $SESSION_APP_NAME DEPLOYMENT_ID -o json
```

If `status.state` is `FAILED`, check `status.message` for error details.

### Restart App

```bash
databricks apps stop $SESSION_APP_NAME --no-wait
databricks apps start $SESSION_APP_NAME
```

### Access SQL Warehouse via User-on-behalf-of Authorization

```bash
# 1. Check current settings
databricks apps get $SESSION_APP_NAME -o json

# 2. Set user_api_scopes and resources
databricks apps update $SESSION_APP_NAME --json '{
  "user_api_scopes": ["sql"],
  "resources": [
    {
      "name": "sql_warehouse",
      "sql_warehouse": {
        "id": "WAREHOUSE_ID",
        "permission": "CAN_USE"
      }
    }
  ]
}'

# 3. Restart app to apply settings
databricks apps stop $SESSION_APP_NAME --no-wait
databricks apps start $SESSION_APP_NAME
```

### Access Unity Catalog via User-on-behalf-of Authorization

```bash
# 1. Check current settings
databricks apps get $SESSION_APP_NAME -o json

# 2. Set user_api_scopes and resources
databricks apps update $SESSION_APP_NAME --json '{
  "user_api_scopes": ["sql", "unity-catalog"],
  "resources": [
    {
      "name": "sql_warehouse",
      "sql_warehouse": {
        "id": "WAREHOUSE_ID",
        "permission": "CAN_USE"
      }
    },
    {
      "name": "catalog_data",
      "unity_catalog_schema": {
        "catalog_name": "CATALOG_NAME",
        "schema_name": "SCHEMA_NAME",
        "permission": "SELECT"
      }
    }
  ]
}'

# 3. Restart app to apply settings
databricks apps stop $SESSION_APP_NAME --no-wait
databricks apps start $SESSION_APP_NAME
```

### Grant SQL Warehouse Access (Service Principal - only when user-on-behalf-of cannot handle)

```bash
# 1. Bind resource
databricks apps update $SESSION_APP_NAME --json '{
  "resources": [
    {
      "name": "sql_warehouse",
      "sql_warehouse": {
        "id": "WAREHOUSE_ID",
        "permission": "CAN_USE"
      }
    }
  ]
}'

# 2. Get Service Principal name
databricks apps get $SESSION_APP_NAME -o json | jq -r '.service_principal_name'

# 3. Grant permissions to Service Principal
databricks warehouses update-permissions WAREHOUSE_ID --json '{
  "access_control_list": [
    {
      "service_principal_name": "SERVICE_PRINCIPAL_NAME",
      "permission_level": "CAN_USE"
    }
  ]
}'
```

### Grant Unity Catalog Access (Service Principal - only when user-on-behalf-of cannot handle)

```bash
# 1. Bind resource
databricks apps update $SESSION_APP_NAME --json '{
  "resources": [
    {
      "name": "catalog_data",
      "unity_catalog_schema": {
        "catalog_name": "CATALOG_NAME",
        "schema_name": "SCHEMA_NAME",
        "permission": "SELECT"
      }
    }
  ]
}'

# 2. Grant permissions to Service Principal via SQL
```

```sql
GRANT USE CATALOG ON CATALOG catalog_name TO `service_principal_name`;
GRANT USE SCHEMA ON SCHEMA catalog_name.schema_name TO `service_principal_name`;
GRANT SELECT ON TABLE catalog_name.schema_name.table_name TO `service_principal_name`;
```

## Troubleshooting Decision Tree

1. **Deployment failed?**
   - **Always check logs**: `databricks api get /api/2.0/apps/$SESSION_APP_NAME/deployments/DEPLOYMENT_ID/logs`
   - Check deployment status message
   - Verify app.yaml syntax
   - Check requirements.txt completeness
   - See [troubleshooting.md](references/troubleshooting.md)

2. **Permission errors?**
   - **First check `user_api_scopes` and `resources` via `databricks apps get`**
   - Verify scope settings are correct
   - Verify resources settings are correct
   - **Only consider Service Principal permission grants when user-on-behalf-of cannot handle**

3. **App not accessible?**
   - **Check state via CLI**: `databricks apps get $SESSION_APP_NAME -o json`
   - Check `compute_status.state` is ACTIVE
   - Verify deployment succeeded
   - Try restarting the app

4. **App crashes on startup?**
   - **Check logs**: `databricks api get /api/2.0/apps/$SESSION_APP_NAME/logs`
   - Verify app binds to `APP_PORT` env var
   - Check for import errors in code
   - Review app.yaml command configuration

## References

- [CLI Reference](references/cli-reference.md): Complete CLI command reference
- [Troubleshooting Guide](references/troubleshooting.md): Detailed issue resolution
