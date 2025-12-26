# Databricks Apps CLI Reference

## Important: Configure Authorization via databricks apps update

**Authorization settings (`user_api_scopes`, `resources`) cannot be configured in `app.yaml`.**

Use the `databricks apps update` command (internally `PATCH /api/2.0/apps/{app_name}`) for authorization configuration.

### Choosing Authorization Method

| Method | Use Case | Required Settings |
|--------|----------|-------------------|
| **User-on-behalf-of** | Normal app operations (recommended) | `user_api_scopes` (required) + `resources` (optional) |
| Service Principal | Only when scope cannot handle the operation | `resources` (required) + permission grants |

## Authorization Configuration via databricks apps update

### User-on-behalf-of Authorization Configuration

User-on-behalf-of authorization requires **`user_api_scopes`**.
`resources` is optional, but when set, allows referencing resource IDs as environment variables.

**Note**: For user-on-behalf-of authorization, permissions are determined by the app user's permissions, so `resources` is not required for authorization purposes.

```bash
# Minimal configuration (user_api_scopes only)
databricks apps update APP_NAME --json '{
  "user_api_scopes": ["sql", "unity-catalog"]
}'
```

```bash
# With resources (when referencing resource IDs via environment variables)
databricks apps update APP_NAME --json '{
  "user_api_scopes": ["sql", "unity-catalog"],
  "resources": [
    {
      "name": "resource_name",
      "sql_warehouse": {
        "id": "warehouse_id",
        "permission": "CAN_USE"
      }
    }
  ]
}'
```

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

### resources Types

#### SQL Warehouse
```json
{
  "name": "sql_warehouse",
  "sql_warehouse": {
    "id": "warehouse_id",
    "permission": "CAN_USE"
  }
}
```

#### Serving Endpoint
```json
{
  "name": "serving_endpoint",
  "serving_endpoint": {
    "name": "endpoint_name",
    "permission": "CAN_QUERY"
  }
}
```
**Note**: Use `name`, not `id`

#### Unity Catalog Schema
```json
{
  "name": "catalog_data",
  "unity_catalog_schema": {
    "catalog_name": "catalog_name",
    "schema_name": "schema_name",
    "permission": "SELECT"
  }
}
```
Permission: `SELECT`, `MODIFY`, `ALL_PRIVILEGES`

**Note**: When accessing multiple schemas, configure each schema separately

#### Secret Scope
```json
{
  "name": "app_secrets",
  "secret_scope": {
    "scope": "my_scope",
    "permission": "READ"
  }
}
```

#### Job
```json
{
  "name": "my_job",
  "job": {
    "id": "job_id",
    "permission": "CAN_MANAGE_RUN"
  }
}
```
Permission: `CAN_VIEW`, `CAN_MANAGE_RUN`, `CAN_MANAGE`

#### Genie Space
```json
{
  "name": "genie_space",
  "genie_space": {
    "id": "genie_space_id",
    "permission": "CAN_VIEW"
  }
}
```
Permission: `CAN_VIEW`, `CAN_EDIT`, `CAN_MANAGE`

#### Vector Search Index
```json
{
  "name": "vector_index",
  "vector_search_index": {
    "name": "catalog.schema.index_name",
    "permission": "CAN_USE"
  }
}
```
**Note**: Specify using full path (catalog.schema.index)

### Example: SQL Warehouse + Unity Catalog

```bash
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
    },
    {
      "name": "another_schema",
      "unity_catalog_schema": {
        "catalog_name": "main_catalog",
        "schema_name": "other_data",
        "permission": "SELECT"
      }
    }
  ]
}'
```

### Example: Serving Endpoint

```bash
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

### resources Configuration and Environment Variables

When `resources` is configured, you can reference resource IDs as environment variables within your app.
This allows you to reference resource IDs without hardcoding them in your code.

### Service Principal Resource Configuration

When using Service Principal, `resources` configuration is **required**.
Configure `resources` without `user_api_scopes`, then grant permissions to the Service Principal.

```bash
# Resource binding (for Service Principal - required)
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
```

## App Management Commands

### Get App Info
```bash
databricks apps get APP_NAME -o json
```
Returns: app details including `service_principal_id`, `service_principal_name`, `active_deployment`, `compute_status`, `url`, **`resources`**, **`user_api_scopes`**

### List All Apps
```bash
databricks apps list -o json
```

### Update App (Authorization Configuration)
```bash
# User-on-behalf-of authorization (minimal configuration)
databricks apps update APP_NAME --json '{
  "user_api_scopes": ["sql", "unity-catalog"]
}'

# User-on-behalf-of authorization (when referencing resource IDs via env vars)
databricks apps update APP_NAME --json '{
  "user_api_scopes": ["sql", "unity-catalog"],
  "resources": [...]
}'

# Service Principal resource configuration (resources is required)
databricks apps update APP_NAME --json '{
  "resources": [...]
}'

# Update description
databricks apps update APP_NAME --description "New description"
```

### Start/Stop App
```bash
databricks apps start APP_NAME
databricks apps stop APP_NAME
```

**Note**: After changing authorization settings via `databricks apps update`, you may need to restart the app.

## Deployment Commands

### Deploy App
```bash
databricks apps deploy APP_NAME --source-code-path /Workspace/path/to/code
```
Options:
- `--mode AUTO_SYNC|SNAPSHOT`: AUTO_SYNC syncs changes automatically
- `--no-wait`: Don't wait for deployment to complete
- `--timeout 20m`: Max wait time (default 20m)

### List Deployments
```bash
databricks apps list-deployments APP_NAME -o json
```

### Get Deployment Details
```bash
databricks apps get-deployment APP_NAME DEPLOYMENT_ID -o json
```
Returns: deployment status, `status.state` (SUCCEEDED, FAILED, IN_PROGRESS), `status.message`

## Permission Commands (for Service Principal - only when user-on-behalf-of cannot handle)

### Get App Permissions
```bash
databricks apps get-permissions APP_NAME -o json
```

### Set App Permissions
```bash
databricks apps set-permissions APP_NAME --json '{
  "access_control_list": [
    {
      "service_principal_name": "SP_NAME",
      "permission_level": "CAN_MANAGE"
    }
  ]
}'
```
Permission levels: `CAN_MANAGE`, `CAN_USE`

## SQL Warehouse Permission Commands (for Service Principal)

**Note**: Normally use user-on-behalf-of authorization by setting `user_api_scopes` via `databricks apps update`.

### Get Warehouse Permissions
```bash
databricks warehouses get-permissions WAREHOUSE_ID -o json
```

### Update Warehouse Permissions (Add)
```bash
databricks warehouses update-permissions WAREHOUSE_ID --json '{
  "access_control_list": [
    {
      "service_principal_name": "SP_NAME",
      "permission_level": "CAN_USE"
    }
  ]
}'
```
Permission levels: `CAN_MANAGE`, `CAN_MONITOR`, `CAN_USE`

### List Warehouses
```bash
databricks warehouses list -o json
```

## Service Principal Commands

### Get Service Principal
```bash
databricks service-principals get SP_ID -o json
```

### List Service Principals
```bash
databricks service-principals list -o json
```

## REST API for Logs

App logs are accessed via REST API:

### Get App Logs
```bash
databricks api get /api/2.0/apps/APP_NAME/logs
```

### Get Deployment Logs
```bash
databricks api get /api/2.0/apps/APP_NAME/deployments/DEPLOYMENT_ID/logs
```

## Common JSON Output Fields

### App Object
```json
{
  "name": "app-name",
  "description": "...",
  "service_principal_id": 123456,
  "service_principal_name": "app-name-sp",
  "user_api_scopes": ["sql", "unity-catalog"],
  "resources": [
    {
      "name": "sql_warehouse",
      "sql_warehouse": {
        "id": "warehouse_id",
        "permission": "CAN_USE"
      }
    }
  ],
  "compute_status": {
    "state": "ACTIVE|STOPPED|ERROR",
    "message": "..."
  },
  "active_deployment": {
    "deployment_id": "...",
    "source_code_path": "/Workspace/...",
    "status": {
      "state": "SUCCEEDED|FAILED|IN_PROGRESS",
      "message": "..."
    }
  },
  "url": "https://app-name.cloud.databricks.com"
}
```

### Deployment Status States
- `SUCCEEDED`: Deployment completed successfully
- `FAILED`: Deployment failed (check `status.message`)
- `IN_PROGRESS`: Deployment is running
- `CANCELLED`: Deployment was cancelled
