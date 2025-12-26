# Databricks Apps Troubleshooting Guide

## First Steps

**When issues occur, always verify the current state via CLI before guessing.**

```bash
# 1. Check app state (including resources and user_api_scopes)
databricks apps get $SESSION_APP_NAME -o json

# 2. Check deployment history
databricks apps list-deployments $SESSION_APP_NAME -o json

# 3. Check logs
databricks api get /api/2.0/apps/$SESSION_APP_NAME/logs
```

## Important Notes on Authorization Configuration

**Authorization settings (`user_api_scopes`, `resources`) cannot be configured in `app.yaml`.**

Use the `databricks apps update` command for authorization configuration.

### Choosing Authorization Method

| Symptom | Check | Solution |
|---------|-------|----------|
| Permission error | `user_api_scopes` setting | Set `user_api_scopes` via `databricks apps update` |
| Operation not supported by scope | Resource type | Use Service Principal (`resources` required) |
| Need different permissions per user | Access control requirements | Use user-on-behalf-of authorization |
| Want to reference resource ID via env var | `resources` setting | Set `resources` via `databricks apps update` |

## Common Issues and Solutions

### 1. Deployment Failed

**Symptoms**: `status.state` is `FAILED`

**Diagnosis**:
```bash
# Get deployment details
databricks apps get-deployment $SESSION_APP_NAME DEPLOYMENT_ID -o json

# Check deployment logs (required)
databricks api get /api/2.0/apps/$SESSION_APP_NAME/deployments/DEPLOYMENT_ID/logs
```

**Common Causes**:
- **Invalid app.yaml**: Check syntax, required fields
- **Missing dependencies**: Ensure requirements.txt is complete
- **Code errors**: Check Python syntax, import errors
- **Resource limits**: App exceeds memory/CPU limits

### 2. App Not Starting (STOPPED or ERROR state)

**Diagnosis**:
```bash
databricks apps get $SESSION_APP_NAME -o json
```

**Check `compute_status.state` and `compute_status.message`**

**Solutions**:
```bash
# Restart the app
databricks apps stop $SESSION_APP_NAME --no-wait
databricks apps start $SESSION_APP_NAME
```

### 3. User-on-behalf-of Authorization Not Working

**Symptom**: User-on-behalf-of authorization is configured but permission errors occur

**First, check**:
```bash
# Check current settings
databricks apps get $SESSION_APP_NAME -o json | jq '{user_api_scopes, resources}'
```

**Common Causes**:

| Problem | Cause | Solution |
|---------|-------|----------|
| `user_api_scopes` is empty | Missing scope configuration | Add scope via `databricks apps update` (required) |
| Tried to configure in app.yaml | app.yaml doesn't support authorization settings | Use `databricks apps update` |
| User lacks permissions | App user doesn't have permissions to the resource | Grant permissions directly to the user |

**Note**: For user-on-behalf-of authorization, permissions are determined by the app user's permissions. `resources` is not required for authorization purposes (only needed when referencing resource IDs via environment variables).

**Solution**:
```bash
# Set user_api_scopes (minimal configuration)
databricks apps update $SESSION_APP_NAME --json '{
  "user_api_scopes": ["sql", "unity-catalog"]
}'

# Restart the app
databricks apps stop $SESSION_APP_NAME --no-wait
databricks apps start $SESSION_APP_NAME
```

```bash
# If referencing resource IDs via environment variables, also set resources
databricks apps update $SESSION_APP_NAME --json '{
  "user_api_scopes": ["sql", "unity-catalog"],
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
```

### 4. SQL Warehouse Access Denied

**Symptom**: App cannot query SQL warehouse, permission errors

**First, check**:
```bash
# Check user_api_scopes
databricks apps get $SESSION_APP_NAME -o json | jq '{user_api_scopes, resources}'

# Check logs for permission errors
databricks api get /api/2.0/apps/$SESSION_APP_NAME/logs
```

**Solution 1 (recommended)**: Configure user-on-behalf-of authorization
```bash
# user_api_scopes only is OK (permissions determined by user's permissions)
databricks apps update $SESSION_APP_NAME --json '{
  "user_api_scopes": ["sql"]
}'
```

```bash
# If referencing WAREHOUSE_ID via environment variable, also set resources
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
```

**Solution 2 (only when scope cannot handle the operation)**: Grant permissions to Service Principal
```bash
# Bind resource (required for Service Principal)
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

# Get Service Principal name
databricks apps get $SESSION_APP_NAME -o json | jq -r '.service_principal_name'

# Grant permissions to Service Principal
databricks warehouses update-permissions WAREHOUSE_ID --json '{
  "access_control_list": [
    {
      "service_principal_name": "APP_SERVICE_PRINCIPAL_NAME",
      "permission_level": "CAN_USE"
    }
  ]
}'
```

### 5. Unity Catalog Access Denied

**Symptom**: App cannot access catalog/schema/table

**First, check**:
```bash
# Check if unity-catalog is in user_api_scopes
databricks apps get $SESSION_APP_NAME -o json | jq '{user_api_scopes, resources}'
```

**Common missing configurations**:
- `unity-catalog` not in `user_api_scopes`
- App user doesn't have permissions to the table

**Solution 1 (recommended)**: Configure user-on-behalf-of authorization
```bash
# user_api_scopes only is OK (permissions determined by user's permissions)
databricks apps update $SESSION_APP_NAME --json '{
  "user_api_scopes": ["sql", "unity-catalog"]
}'
```

```bash
# If referencing resource IDs via environment variables, also set resources
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
```

**Solution 2 (only when scope cannot handle the operation)**: Grant permissions to Service Principal via SQL
```sql
GRANT USE CATALOG ON CATALOG catalog_name TO `service_principal_name`;
GRANT USE SCHEMA ON SCHEMA catalog_name.schema_name TO `service_principal_name`;
GRANT SELECT ON TABLE catalog_name.schema_name.table_name TO `service_principal_name`;
```

### 6. Serving Endpoint Access Denied

**Symptom**: App cannot call serving endpoint

**First, check**:
```bash
# Check if serving is in user_api_scopes
databricks apps get $SESSION_APP_NAME -o json | jq '{user_api_scopes, resources}'
```

**Common configuration mistakes**:
- `serving` not in `user_api_scopes`
- App user doesn't have permissions to the endpoint

**Solution (recommended)**: Configure user-on-behalf-of authorization
```bash
# user_api_scopes only is OK
databricks apps update $SESSION_APP_NAME --json '{
  "user_api_scopes": ["serving"]
}'
```

```bash
# If referencing endpoint name via environment variable, also set resources
# Note: serving_endpoint uses name, not id
databricks apps update $SESSION_APP_NAME --json '{
  "user_api_scopes": ["serving"],
  "resources": [
    {
      "name": "ml_endpoint",
      "serving_endpoint": {
        "name": "endpoint_name",
        "permission": "CAN_QUERY"
      }
    }
  ]
}'
```

### 7. Vector Search Index Access Denied

**Symptom**: App cannot access vector search index

**Common configuration mistakes**:
- `vector-search` not in `user_api_scopes`
- App user doesn't have permissions to the index

**Solution**: Configure user-on-behalf-of authorization
```bash
# user_api_scopes only is OK
databricks apps update $SESSION_APP_NAME --json '{
  "user_api_scopes": ["vector-search"]
}'
```

```bash
# If referencing index name via environment variable, also set resources
# Note: Specify using full path (catalog.schema.index)
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

### 8. App URL Not Accessible

**Diagnosis**:
```bash
databricks apps get $SESSION_APP_NAME -o json
```

**Check**:
- `compute_status.state` should be `ACTIVE`
- `url` field contains the app URL
- Deployment is `SUCCEEDED`

**Solution**: If app is stopped, start it:
```bash
databricks apps start $SESSION_APP_NAME
```

### 9. App Crashes on Startup

**Always check logs**:
```bash
databricks api get /api/2.0/apps/$SESSION_APP_NAME/logs
```

**Common Causes**:
- Port binding issues (app must bind to `APP_PORT` environment variable)
- Missing environment variables
- Import errors in code

**Check app.yaml**:
```yaml
command:
  - "python"
  - "app.py"
env:
  - name: CUSTOM_VAR
    value: "value"
```

**Important**: App must listen on port from `APP_PORT` env var (default: 8000)

### 10. Secrets Not Available

**Symptom**: Environment variables from secrets are empty

**Check app.yaml secret references**:
```yaml
env:
  - name: API_KEY
    valueFrom:
      secretRef:
        key: api_key
        scope: my-scope
```

**Or configure via user_api_scopes**:
```bash
# user_api_scopes only is OK
databricks apps update $SESSION_APP_NAME --json '{
  "user_api_scopes": ["secrets"]
}'
```

```bash
# If referencing scope name via environment variable, also set resources
databricks apps update $SESSION_APP_NAME --json '{
  "user_api_scopes": ["secrets"],
  "resources": [
    {
      "name": "app_secrets",
      "secret_scope": {
        "scope": "my-scope",
        "permission": "READ"
      }
    }
  ]
}'
```

**Verify**:
- Secret scope exists
- `secrets` is configured in user_api_scopes
- App user has permissions to the secret scope
- Key name matches exactly

### 11. Cannot Get Resource ID via Environment Variable

**Symptom**: Cannot reference resource ID from environment variable within the app

**Cause**: `resources` is not configured

**Solution**: Configure `resources`
```bash
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
```

**Note**: For user-on-behalf-of authorization, `resources` is not required for permissions. It's only needed when referencing resource IDs via environment variables.

### 12. Missing user_api_scopes Configuration

**Symptom**: Authorization is configured but cannot access resources

**Diagnosis**:
```bash
databricks apps get $SESSION_APP_NAME -o json | jq '{user_api_scopes, resources}'
```

**Scope and resource correspondence to check**:

| user_api_scopes | Corresponding resources (for env var reference) |
|----------------|------------------------------------------------|
| `sql` | `sql_warehouse` |
| `unity-catalog` | `unity_catalog_schema` |
| `serving` | `serving_endpoint` |
| `vector-search` | `vector_search_index` |
| `genie` | `genie_space` |
| `jobs` | `job` |
| `secrets` | `secret_scope` |

**Note**: For user-on-behalf-of authorization, only `user_api_scopes` is required. Configure `resources` only when referencing resource IDs via environment variables.

**Example**: Accessing SQL Warehouse and Unity Catalog
```bash
# Minimal configuration (user_api_scopes only)
databricks apps update $SESSION_APP_NAME --json '{
  "user_api_scopes": ["sql", "unity-catalog"]
}'
```

```bash
# When referencing resource IDs via environment variables
databricks apps update $SESSION_APP_NAME --json '{
  "user_api_scopes": ["sql", "unity-catalog"],
  "resources": [
    {
      "name": "sql_warehouse",
      "sql_warehouse": { ... }
    },
    {
      "name": "catalog_data",
      "unity_catalog_schema": { ... }
    }
  ]
}'
```

## Debugging Workflow

1. **Get current state (required)**:
   ```bash
   databricks apps get $SESSION_APP_NAME -o json
   ```

2. **Check user_api_scopes and resources**:
   ```bash
   databricks apps get $SESSION_APP_NAME -o json | jq '{user_api_scopes, resources}'
   ```

3. **List recent deployments**:
   ```bash
   databricks apps list-deployments $SESSION_APP_NAME -o json
   ```

4. **Check latest deployment status**:
   ```bash
   databricks apps get-deployment $SESSION_APP_NAME DEPLOYMENT_ID -o json
   ```

5. **Get logs (required when issues occur)**:
   ```bash
   databricks api get /api/2.0/apps/$SESSION_APP_NAME/logs
   ```

6. **Check permissions (only when using Service Principal)**:
   ```bash
   databricks apps get-permissions $SESSION_APP_NAME -o json
   ```

## app.yaml Reference

**Note**: Authorization settings (`user_api_scopes`, `resources`) cannot be configured in `app.yaml`. Use `databricks apps update` for authorization configuration.

```yaml
# Required
command:
  - "python"
  - "main.py"

# Optional
env:
  - name: VAR_NAME
    value: "static_value"
  - name: SECRET_VAR
    valueFrom:
      secretRef:
        key: secret_key
        scope: secret_scope
```

## Authorization Configuration Reference (databricks apps update)

### User-on-behalf-of Authorization (Recommended)

```bash
# Minimal configuration (user_api_scopes only - permissions determined by user's permissions)
databricks apps update $SESSION_APP_NAME --json '{
  "user_api_scopes": ["sql", "unity-catalog", "serving", "vector-search", "genie", "jobs", "secrets"]
}'
```

```bash
# If referencing resource IDs via environment variables, also set resources
databricks apps update $SESSION_APP_NAME --json '{
  "user_api_scopes": ["sql", "unity-catalog", "serving", "vector-search", "genie", "jobs", "secrets"],
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
        "catalog_name": "catalog",
        "schema_name": "schema",
        "permission": "SELECT"
      }
    },
    {
      "name": "serving_endpoint",
      "serving_endpoint": {
        "name": "endpoint_name",
        "permission": "CAN_QUERY"
      }
    },
    {
      "name": "vector_index",
      "vector_search_index": {
        "name": "catalog.schema.index",
        "permission": "CAN_USE"
      }
    },
    {
      "name": "genie",
      "genie_space": {
        "id": "genie_id",
        "permission": "CAN_VIEW"
      }
    },
    {
      "name": "my_job",
      "job": {
        "id": "job_id",
        "permission": "CAN_MANAGE_RUN"
      }
    },
    {
      "name": "app_secrets",
      "secret_scope": {
        "scope": "my_scope",
        "permission": "READ"
      }
    }
  ]
}'
```

### Service Principal (Only When Scope Cannot Handle the Operation)

```bash
# For Service Principal, resources configuration is required
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
# Then grant permissions to the Service Principal
```
