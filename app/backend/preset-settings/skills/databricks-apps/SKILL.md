---
name: databricks-apps
description: Databricks Apps deployment, debugging, and configuration management. Use when working with Databricks Apps issues including deployment failures, app configuration (app.yaml), checking logs, granting permissions to SQL warehouses or Unity Catalog resources, troubleshooting app errors, or managing app state (start/stop). Triggered by mentions of SESSION_APP_NAME, app.yaml, deployment errors, or permission issues with Apps.
version: 0.0.3
---

# Databricks Apps

Manage Databricks Apps deployment, debugging, and configuration using the Databricks CLI.

## 重要: 認可方式の選択

Databricks Apps では**ユーザー代理認可（User-on-behalf-of Authorization）を優先**して使用してください。

### 認可方式の優先順位

1. **ユーザー代理認可（OAuth scope）** - **最優先**
   - `databricks apps update` コマンドで `user_api_scopes` と `resources` を設定
   - アプリ利用ユーザーの権限で操作を実行
   - ユーザーごとのアクセス制御が可能

2. **Service Principal** - **scope で対応できない場合のみ使用**
   - ユーザー代理認可で対応できない操作がある場合のみ
   - バックグラウンドジョブなど、ユーザーコンテキストがない場合
   - 全ユーザーで共通の認証が必要な場合
   - `databricks apps update` コマンドで `resources` を設定し、Service Principal に権限を付与

## 認可設定の方法

**重要**: `app.yaml` では認可設定（`user_api_scopes`、`resources`）を設定できません。
`databricks apps update` コマンドを使用する必要があります。

### ユーザー代理認可の設定

ユーザー代理認可には以下の **2つの設定が必要** です：

1. **`user_api_scopes`**: アプリがユーザーの代理でアクセスできる API スコープ
2. **`resources`**: アクセスするリソースの詳細

```bash
# ユーザー代理認可の設定
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

### user_api_scopes の種類

| scope | 説明 | 対応する resources |
|-------|------|-------------------|
| `sql` | SQL Warehouse へのアクセス | `sql_warehouse` |
| `unity-catalog` | Unity Catalog へのアクセス | `unity_catalog_schema` |
| `serving` | Model Serving Endpoint へのアクセス | `serving_endpoint` |
| `vector-search` | Vector Search Index へのアクセス | `vector_search_index` |
| `genie` | Genie Space へのアクセス | `genie_space` |
| `jobs` | Jobs へのアクセス | `job` |
| `secrets` | Secret Scope へのアクセス | `secret_scope` |

### resources の設定例

```bash
# SQL Warehouse + Unity Catalog の設定
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
# Serving Endpoint の設定
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
# Vector Search Index の設定
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

### Service Principal 用のリソース設定

Service Principal を使用する場合も `databricks apps update` でリソースを紐付け、その後 Service Principal に権限を付与します。

```bash
# リソースの紐付け（user_api_scopes なし）
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

# Service Principal への権限付与
databricks warehouses update-permissions WAREHOUSE_ID --json '{
  "access_control_list": [
    {
      "service_principal_name": "SERVICE_PRINCIPAL_NAME",
      "permission_level": "CAN_USE"
    }
  ]
}'
```

### よくある設定漏れ

| 問題 | 原因 | 解決策 |
|-----|------|-------|
| ユーザー代理認可が動作しない | `user_api_scopes` の設定漏れ | `databricks apps update` で scope を追加 |
| 特定のリソースにアクセスできない | `resources` の設定漏れ | `databricks apps update` で resource を追加 |
| scope と resource の不一致 | `sql` scope があるのに `sql_warehouse` resource がない | 両方を正しく設定 |
| app.yaml で設定しようとしている | app.yaml では認可設定不可 | `databricks apps update` を使用 |

## Environment

The target app name is available in `SESSION_APP_NAME` environment variable.

```bash
echo $SESSION_APP_NAME
```

### Auto Deploy

When `APP_AUTO_DEPLOY=true`, the app is automatically deployed to `SESSION_APP_NAME` via hooks when the Claude Code session stops. Manual deployment is not required in this case.

## 必須: CLI による状態確認

**作業を始める前に必ず CLI で現在の状態を確認してください。** 推測で作業を進めないでください。

### 1. アプリの状態確認（必須）

```bash
# アプリ情報を取得（state, service principal, URL, active deployment, resources, user_api_scopes）
databricks apps get $SESSION_APP_NAME -o json
```

確認すべきフィールド:
- `compute_status.state`: ACTIVE, STOPPED, ERROR
- `active_deployment.status.state`: SUCCEEDED, FAILED, IN_PROGRESS
- `resources`: 設定されているリソース
- `user_api_scopes`: 設定されているユーザー代理認可スコープ
- `service_principal_name`: 権限付与に必要（ユーザー代理認可で対応できない場合のみ）

### 2. デプロイメント履歴の確認

```bash
# 最近のデプロイメント一覧
databricks apps list-deployments $SESSION_APP_NAME -o json
```

### 3. ログの確認（問題発生時は必須）

```bash
# アプリのログ
databricks api get /api/2.0/apps/$SESSION_APP_NAME/logs

# デプロイメントのログ
databricks apps get-deployment $SESSION_APP_NAME DEPLOYMENT_ID -o json
databricks api get /api/2.0/apps/$SESSION_APP_NAME/deployments/DEPLOYMENT_ID/logs
```

**重要**: エラーが発生した場合、ログを確認せずに原因を推測しないでください。

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

### ユーザー代理認可で SQL Warehouse にアクセス

```bash
# 1. 現在の設定を確認
databricks apps get $SESSION_APP_NAME -o json

# 2. user_api_scopes と resources を設定
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

# 3. アプリを再起動して設定を反映
databricks apps stop $SESSION_APP_NAME --no-wait
databricks apps start $SESSION_APP_NAME
```

### ユーザー代理認可で Unity Catalog にアクセス

```bash
# 1. 現在の設定を確認
databricks apps get $SESSION_APP_NAME -o json

# 2. user_api_scopes と resources を設定
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

# 3. アプリを再起動して設定を反映
databricks apps stop $SESSION_APP_NAME --no-wait
databricks apps start $SESSION_APP_NAME
```

### Grant SQL Warehouse Access（Service Principal - ユーザー代理認可で対応できない場合のみ）

```bash
# 1. リソースを紐付け
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

# 2. Service Principal 名を取得
databricks apps get $SESSION_APP_NAME -o json | jq -r '.service_principal_name'

# 3. Service Principal に権限付与
databricks warehouses update-permissions WAREHOUSE_ID --json '{
  "access_control_list": [
    {
      "service_principal_name": "SERVICE_PRINCIPAL_NAME",
      "permission_level": "CAN_USE"
    }
  ]
}'
```

### Grant Unity Catalog Access（Service Principal - ユーザー代理認可で対応できない場合のみ）

```bash
# 1. リソースを紐付け
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

# 2. Service Principal に SQL で権限付与
```

```sql
GRANT USE CATALOG ON CATALOG catalog_name TO `service_principal_name`;
GRANT USE SCHEMA ON SCHEMA catalog_name.schema_name TO `service_principal_name`;
GRANT SELECT ON TABLE catalog_name.schema_name.table_name TO `service_principal_name`;
```

## Troubleshooting Decision Tree

1. **Deployment failed?**
   - **必ずログを確認**: `databricks api get /api/2.0/apps/$SESSION_APP_NAME/deployments/DEPLOYMENT_ID/logs`
   - Check deployment status message
   - Verify app.yaml syntax
   - Check requirements.txt completeness
   - See [troubleshooting.md](references/troubleshooting.md)

2. **Permission errors?**
   - **まず `databricks apps get` で `user_api_scopes` と `resources` を確認**
   - scope 設定が正しいか確認
   - resources 設定が正しいか確認
   - **ユーザー代理認可で対応できない場合のみ** Service Principal への権限付与を検討

3. **App not accessible?**
   - **CLI で状態確認**: `databricks apps get $SESSION_APP_NAME -o json`
   - Check `compute_status.state` is ACTIVE
   - Verify deployment succeeded
   - Try restarting the app

4. **App crashes on startup?**
   - **ログを確認**: `databricks api get /api/2.0/apps/$SESSION_APP_NAME/logs`
   - Verify app binds to `APP_PORT` env var
   - Check for import errors in code
   - Review app.yaml command configuration

## References

- [CLI Reference](references/cli-reference.md): Complete CLI command reference
- [Troubleshooting Guide](references/troubleshooting.md): Detailed issue resolution
