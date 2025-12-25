# Claude Code on Databricks

Databricks Apps 上で動作する Claude Code ライクなコーディングエージェント Web アプリケーション。AI アシスタントと対話しながら、Databricks Workspace 内でコマンド実行、ファイル読み書き、コード検索、SQL クエリ実行などを行えます。

[English README](README.md)

## 機能

- **AI コーディングエージェント**: ファイル操作、コード検索、コマンド実行が可能な Claude ベースのアシスタント
- **Databricks 統合**: MCP 経由の SQL 実行、ワークスペース同期、Databricks Apps デプロイ
- **Personal Access Token**: ユーザーレベル認証のためのオプション PAT 設定
- **Skills & Agents**: GitHub インポート対応のカスタマイズ可能なスキルとサブエージェント
- **リアルタイムストリーミング**: WebSocket ベースの応答ストリーミング
- **多言語 UI**: 日本語・英語対応

## アーキテクチャ

```
┌─────────────────────────────────────────┐
│      Frontend (React + Ant Design)      │
│  - ストリーミング対応チャット UI          │
│  - セッション管理                        │
│  - Skills/Agents 設定                   │
└──────────────┬──────────────────────────┘
               │ WebSocket
┌──────────────▼──────────────────────────┐
│      Backend (Node.js + Fastify)        │
│  - REST API & WebSocket ハンドラ         │
│  - Claude Agent SDK 統合                │
│  - MCP サーバー (Databricks SQL)         │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│         PostgreSQL (Neon)               │
│  - Users, Sessions, Events, Settings    │
│  - Row Level Security (RLS)             │
└─────────────────────────────────────────┘
```

## 技術スタック

- **Frontend**: React + Vite + Ant Design v5 + TypeScript
- **Backend**: Node.js + Fastify + WebSocket
- **Agent**: Claude Agent SDK (TypeScript)
- **Database**: PostgreSQL + Drizzle ORM
- **Deployment**: Databricks Apps

## 前提条件

- Node.js 20+
- PostgreSQL データベース（例: Neon）
- Service Principal 設定済みの Databricks Workspace
- Anthropic API アクセス（Databricks Model Serving または API キー経由）

## クイックスタート

### 1. 依存関係のインストール

```bash
cd app
npm install
```

### 2. 環境変数の設定

`app/.env` を作成:

```bash
# 必須
DATABRICKS_HOST=your-workspace.cloud.databricks.com
DATABRICKS_CLIENT_ID=your-client-id
DATABRICKS_CLIENT_SECRET=your-client-secret
DATABASE_URL=postgresql://user:password@host:5432/database

# ローカル開発用（Vite プロキシによりヘッダーとして注入）
DATABRICKS_TOKEN=your-personal-access-token
DATABRICKS_USER_NAME=Your Name
DATABRICKS_USER_ID=user-id-from-idp
DATABRICKS_USER_EMAIL=your-email@example.com

# オプション
PORT=8000
ENCRYPTION_KEY=<64文字のhex>  # PAT保存用 (openssl rand -hex 32)

# SQL Warehouse IDs（MCP ツール用）
WAREHOUSE_ID_2XS=your-2xs-warehouse-id
WAREHOUSE_ID_XS=your-xs-warehouse-id
WAREHOUSE_ID_S=your-s-warehouse-id
```

### 3. 開発サーバーの起動

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:8000

## デプロイ

### シークレット設定

```bash
# シークレットスコープを作成
databricks secrets create-scope claude-agent

# DATABASE_URL を保存
databricks secrets put-secret claude-agent database-url
```

### Databricks Apps へのデプロイ

```bash
databricks bundle validate
databricks bundle deploy -t dev   # 開発環境
databricks bundle deploy -t prod  # 本番環境
```

## エージェントツール

### 組み込みツール

| ツール | 説明 |
|--------|------|
| `Bash` | シェルコマンドの実行 |
| `Read` | ファイル内容の読み取り |
| `Write` | ファイルへの書き込み |
| `Edit` | 既存ファイルの編集 |
| `Glob` | パターンによるファイル検索 |
| `Grep` | 正規表現によるファイル内容検索 |
| `WebSearch` | Web 検索 |
| `WebFetch` | Web ページ内容の取得 |

### MCP ツール（Databricks）

| ツール | 説明 |
|--------|------|
| `mcp__databricks__run_sql` | Databricks SQL Warehouse で SQL を実行 |
| `mcp__databricks__list_warehouses` | 利用可能な SQL Warehouse を一覧表示 |
| `mcp__databricks__get_warehouse_info` | Warehouse の詳細情報を取得 |

## プロジェクト構成

```
claude-agent-databricks/
├── app/
│   ├── frontend/          # React フロントエンド
│   │   └── src/
│   │       ├── components/
│   │       ├── contexts/
│   │       ├── hooks/
│   │       └── pages/
│   ├── backend/           # Node.js バックエンド
│   │   ├── agent/         # Claude Agent SDK + MCP
│   │   ├── db/            # Drizzle ORM
│   │   ├── models/        # ドメインモデル
│   │   ├── routes/        # REST API + WebSocket
│   │   └── services/      # ビジネスロジック
│   ├── shared/            # 共有型定義 (@app/shared)
│   └── app.yaml           # Databricks Apps 設定
├── resources/
│   └── claude_agent.app.yml  # DAB アプリリソース
├── databricks.yml         # Databricks バンドル設定
├── CLAUDE.md              # Claude Code ガイダンス
└── README.md
```

## ライセンス

Apache License 2.0
