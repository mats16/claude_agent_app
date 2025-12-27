# Databricks Apps CLI Reference

## Table of Contents

- [Authorization Configuration](#authorization-configuration)
- [Resource Types](#resource-types)
- [App Management Commands](#app-management-commands)
- [Deployment Commands](#deployment-commands)
- [Log Commands](#log-commands)
- [Permission Commands](#permission-commands)
- [Service Principal Setup](#service-principal-resource-configuration)

## Authorization Configuration

**Authorization settings CANNOT be configured in app.yaml.** Use `databricks apps update`.

### User-on-behalf-of Authorization

```bash
# Minimal for table access
databricks apps update $SESSION_APP_NAME --json '{
  "user_api_scopes": ["sql", "catalog.schemas:read", "catalog.tables:read", "unity-catalog"]
}'

# With resource environment variables
databricks apps update $SESSION_APP_NAME --json '{
  "user_api_scopes": ["sql", "catalog.schemas:read", "catalog.tables:read", "unity-catalog"],
  "resources": [...]
}'
```

## Resource Types

### SQL Warehouse

```json
{
  "name": "sql_warehouse",
  "sql_warehouse": {
    "id": "warehouse_id",
    "permission": "CAN_USE"
  }
}
```
Environment variable: `DATABRICKS_RESOURCE_SQL_WAREHOUSE_ID`

### Unity Catalog Schema

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
Permissions: `SELECT`, `MODIFY`, `ALL_PRIVILEGES`

Note: Configure each schema separately for multiple schemas.

### Serving Endpoint

```json
{
  "name": "ml_endpoint",
  "serving_endpoint": {
    "name": "endpoint_name",
    "permission": "CAN_QUERY"
  }
}
```
Note: Use `name`, not `id`.

### Vector Search Index

```json
{
  "name": "vector_index",
  "vector_search_index": {
    "name": "catalog.schema.index_name",
    "permission": "CAN_USE"
  }
}
```
Note: Use full path (catalog.schema.index).

### Genie Space

```json
{
  "name": "genie_space",
  "genie_space": {
    "id": "genie_space_id",
    "permission": "CAN_VIEW"
  }
}
```
Permissions: `CAN_VIEW`, `CAN_EDIT`, `CAN_MANAGE`

### Job

```json
{
  "name": "my_job",
  "job": {
    "id": "job_id",
    "permission": "CAN_MANAGE_RUN"
  }
}
```
Permissions: `CAN_VIEW`, `CAN_MANAGE_RUN`, `CAN_MANAGE`

### Secret Scope

```json
{
  "name": "app_secrets",
  "secret_scope": {
    "scope": "my_scope",
    "permission": "READ"
  }
}
```

## App Management Commands

### Get App Info

```bash
databricks apps get APP_NAME -o json
```

Returns: `service_principal_name`, `active_deployment`, `compute_status`, `url`, `resources`, `user_api_scopes`

### List Apps

```bash
databricks apps list -o json
```

### Update App

```bash
databricks apps update APP_NAME --json '{...}'
databricks apps update APP_NAME --description "New description"
```

### Start/Stop App

```bash
databricks apps start APP_NAME
databricks apps stop APP_NAME --no-wait
```

## Deployment Commands

### Deploy

```bash
databricks apps deploy APP_NAME --source-code-path /Workspace/path/to/code
```

Options:
- `--mode AUTO_SYNC|SNAPSHOT`
- `--no-wait`
- `--timeout 20m`

### List Deployments

```bash
databricks apps list-deployments APP_NAME -o json
```

### Get Deployment

```bash
databricks apps get-deployment APP_NAME DEPLOYMENT_ID -o json
```

## Log Commands

### App Logs

```bash
databricks apps logs APP_NAME
```

### Deployment Logs

```bash
databricks apps logs APP_NAME --deployment-id DEPLOYMENT_ID
```

## Permission Commands

### App Permissions

```bash
databricks apps get-permissions APP_NAME -o json
databricks apps set-permissions APP_NAME --json '{
  "access_control_list": [
    { "service_principal_name": "SP_NAME", "permission_level": "CAN_MANAGE" }
  ]
}'
```

### Warehouse Permissions

```bash
databricks warehouses get-permissions WAREHOUSE_ID -o json
databricks warehouses update-permissions WAREHOUSE_ID --json '{
  "access_control_list": [
    { "service_principal_name": "SP_NAME", "permission_level": "CAN_USE" }
  ]
}'
```

Permission levels: `CAN_MANAGE`, `CAN_MONITOR`, `CAN_USE`

### List Warehouses

```bash
databricks warehouses list -o json
```

## Service Principal Resource Configuration

Use Service Principal only when user-on-behalf-of cannot handle the operation:
- Background jobs with no user context
- Shared authentication across all users

### Step 1: Bind Resources (Required)

```bash
databricks apps update $SESSION_APP_NAME --json '{
  "resources": [
    {
      "name": "sql_warehouse",
      "sql_warehouse": { "id": "WAREHOUSE_ID", "permission": "CAN_USE" }
    }
  ]
}'
```

### Step 2: Get Service Principal Name

```bash
databricks apps get $SESSION_APP_NAME -o json | jq -r '.service_principal_name'
```

### Step 3: Grant Permissions

For SQL Warehouse:
```bash
databricks warehouses update-permissions WAREHOUSE_ID --json '{
  "access_control_list": [
    { "service_principal_name": "SP_NAME", "permission_level": "CAN_USE" }
  ]
}'
```

For Unity Catalog (via SQL):
```sql
GRANT USE CATALOG ON CATALOG catalog_name TO `service_principal_name`;
GRANT USE SCHEMA ON SCHEMA catalog_name.schema_name TO `service_principal_name`;
GRANT SELECT ON TABLE catalog_name.schema_name.table_name TO `service_principal_name`;
```

## Service Principal Commands

```bash
databricks service-principals get SP_ID -o json
databricks service-principals list -o json
```

## App Object Structure

```json
{
  "name": "app-name",
  "service_principal_id": 123456,
  "service_principal_name": "app-name-sp",
  "user_api_scopes": ["sql", "catalog.schemas:read", "catalog.tables:read", "unity-catalog"],
  "resources": [...],
  "compute_status": { "state": "ACTIVE|STOPPED|ERROR" },
  "active_deployment": {
    "deployment_id": "...",
    "status": { "state": "SUCCEEDED|FAILED|IN_PROGRESS" }
  },
  "url": "https://app-name.cloud.databricks.com"
}
```
