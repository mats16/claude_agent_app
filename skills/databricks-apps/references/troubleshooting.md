# Databricks Apps Troubleshooting Guide

## Table of Contents

- [First Steps](#first-steps)
- [Deployment Issues](#deployment-issues)
- [Authorization Issues](#authorization-issues)
- [Runtime Issues](#runtime-issues)
- [app.yaml Reference](#appyaml-reference)

## First Steps

Always verify state before troubleshooting:

```bash
# 1. Check app state
databricks apps get $SESSION_APP_NAME -o json

# 2. Check logs
databricks apps logs $SESSION_APP_NAME

# 3. Check deployment history
databricks apps list-deployments $SESSION_APP_NAME -o json
```

## Deployment Issues

### Deployment Failed

**Diagnosis:**
```bash
databricks apps get-deployment $SESSION_APP_NAME DEPLOYMENT_ID -o json
databricks apps logs $SESSION_APP_NAME --deployment-id DEPLOYMENT_ID
```

**Common Causes:**

| Cause | Solution |
|-------|----------|
| Invalid app.yaml | Check syntax, required fields |
| Missing dependencies | Complete requirements.txt |
| Code errors | Check Python syntax, imports |
| Resource limits | Reduce memory/CPU usage |

## Authorization Issues

### Permission Errors

**First check:**
```bash
databricks apps get $SESSION_APP_NAME -o json | jq '{user_api_scopes, resources}'
```

### Table Access Denied

**Required scopes for Unity Catalog table access (ALL four required):**
- `sql`
- `catalog.schemas:read`
- `catalog.tables:read`
- `unity-catalog`

**Solution:**
```bash
databricks apps update $SESSION_APP_NAME --json '{
  "user_api_scopes": ["sql", "catalog.schemas:read", "catalog.tables:read", "unity-catalog"]
}'

# Restart to apply
databricks apps stop $SESSION_APP_NAME --no-wait
databricks apps start $SESSION_APP_NAME
```

### SQL Warehouse Access Denied

**Check:** Is `sql` in `user_api_scopes`?

```bash
databricks apps update $SESSION_APP_NAME --json '{
  "user_api_scopes": ["sql"]
}'
```

### Serving Endpoint Access Denied

**Check:** Is `serving` in `user_api_scopes`?

```bash
databricks apps update $SESSION_APP_NAME --json '{
  "user_api_scopes": ["serving"]
}'
```

### Vector Search Access Denied

**Check:** Is `vector-search` in `user_api_scopes`?

```bash
databricks apps update $SESSION_APP_NAME --json '{
  "user_api_scopes": ["vector-search"]
}'
```

### Common Authorization Mistakes

| Problem | Cause | Solution |
|---------|-------|----------|
| Missing `user_api_scopes` | Not configured | Add via `databricks apps update` |
| Missing catalog scopes | Only `sql` configured | Add `catalog.schemas:read`, `catalog.tables:read` |
| Configured in app.yaml | Not supported | Use `databricks apps update` |
| User lacks permissions | User doesn't have access | Grant permissions to the user directly |
| Env var not available | `resources` not configured | Add `resources` configuration |

## Runtime Issues

### App Not Accessible

**Check:**
```bash
databricks apps get $SESSION_APP_NAME -o json
```

- `compute_status.state` should be `ACTIVE`
- `active_deployment.status.state` should be `SUCCEEDED`

**Solution:**
```bash
databricks apps start $SESSION_APP_NAME
```

### App Crashes on Startup

**Check logs:**
```bash
databricks apps logs $SESSION_APP_NAME
```

**Common causes:**
- Port binding: App must bind to `APP_PORT` environment variable
- Missing environment variables
- Import errors in code

### Environment Variables Not Available

**For resource IDs (e.g., `DATABRICKS_RESOURCE_SQL_WAREHOUSE_ID`):**

`resources` must be configured:
```bash
databricks apps update $SESSION_APP_NAME --json '{
  "user_api_scopes": ["sql"],
  "resources": [
    {
      "name": "sql_warehouse",
      "sql_warehouse": { "id": "WAREHOUSE_ID", "permission": "CAN_USE" }
    }
  ]
}'
```

**Auto-injected variables (always available):**
- `DATABRICKS_HOST`
- `DATABRICKS_API_TOKEN` (when using user-on-behalf-of)
- `APP_PORT`

### Secrets Not Available

**Check app.yaml:**
```yaml
env:
  - name: API_KEY
    valueFrom:
      secretRef:
        key: api_key
        scope: my-scope
```

**Or use user-on-behalf-of:**
```bash
databricks apps update $SESSION_APP_NAME --json '{
  "user_api_scopes": ["secrets"]
}'
```

## app.yaml Reference

**Note:** Authorization settings (`user_api_scopes`, `resources`) CANNOT be configured here.

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

**Important:** App must listen on port from `APP_PORT` env var (default: 8000).
