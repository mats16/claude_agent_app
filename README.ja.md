# Claude Code on Databricks

Databricks Apps上で動作するClaude Codeライクなコーディングエージェントを提供するWebアプリケーションです。AIアシスタントと対話しながら、Databricks Workspace内でコマンド実行、ファイル読み書き、コード検索などを行えます。

## 機能

- **ファイル操作**: ファイルの読み取り、書き込み、編集
- **コード検索**: Globパターン検索、正規表現検索（grep）
- **コマンド実行**: ワークスペース内でのシェルコマンド実行
- **ストリーミング応答**: WebSocketによるリアルタイムのエージェント応答表示
- **ワークスペース同期**: Databricks Workspaceとローカルストレージ間の双方向同期
- **多言語対応**: 日本語・英語UI

## アーキテクチャ

```
┌─────────────────────────────────────────┐
│      Frontend (React + Ant Design)      │
│  - ストリーミング対応チャットUI           │
│  - セッション管理                        │
│  - ツール出力レンダリング                 │
└──────────────┬──────────────────────────┘
               │ WebSocket
┌──────────────▼──────────────────────────┐
│      Backend (Node.js + Fastify)        │
│  - REST API & WebSocketハンドラ          │
│  - Claude Agent SDK統合                  │
│  - Databricks Workspace同期              │
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

- Node.js 18+
- PostgreSQLデータベース（例: Neon）
- Service Principal設定済みのDatabricks Workspace
- Anthropic APIキー（Claude Agent SDKで設定）

## セットアップ

### 1. リポジトリのクローン

```bash
git clone <repository-url>
cd claude_agent_app
```

### 2. 依存関係のインストール

```bash
cd app
npm install
```

### 3. 環境変数の設定

`app/.env` ファイルを作成:

```bash
# 必須
DATABRICKS_HOST=your-workspace.cloud.databricks.com
DATABRICKS_CLIENT_ID=your-client-id
DATABRICKS_CLIENT_SECRET=your-client-secret
DB_URL=postgresql://user:password@host:5432/database

# ローカル開発用（Viteプロキシによりヘッダーとして注入）
DATABRICKS_TOKEN=your-personal-access-token
DATABRICKS_USER_NAME=Your Name
DATABRICKS_USER_ID=user-id-from-idp
DATABRICKS_USER_EMAIL=your-email@example.com

# オプション
PORT=8000
```

> **注意**: 本番環境では `DB_URL` は Databricks Secrets 経由で注入されます（[シークレット設定](#シークレット設定本番環境)を参照）。

### 4. データベースマイグレーション

```bash
npm run db:migrate
```

## 開発

フロントエンドとバックエンドを開発モードで起動:

```bash
cd app
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:8000

## ビルド・デプロイ

### ビルド

```bash
cd app
npm run build
```

### シークレット設定（本番環境）

本番デプロイでは DB_URL を Databricks Secrets に保存する必要があります:

```bash
# シークレットスコープを作成
databricks secrets create-scope claude_agent

# DB_URL を保存
databricks secrets put-secret claude_agent db_url
```

シークレットは以下のファイルで参照されます:
- `resources/claude_agent.app.yml` - DAB リソース定義
- `app/app.yaml` - アプリ実行設定

### Databricks Appsへのデプロイ

```bash
# 設定の検証
databricks bundle validate

# 開発環境へデプロイ
databricks bundle deploy -t dev

# 本番環境へデプロイ
databricks bundle deploy -t prod
```

## 利用可能なエージェントツール

| ツール | 説明 |
|--------|------|
| `Bash` | シェルコマンドの実行 |
| `Read` | ファイル内容の読み取り |
| `Write` | ファイルへの書き込み |
| `Edit` | 既存ファイルの編集 |
| `Glob` | パターンによるファイル検索 |
| `Grep` | 正規表現によるファイル内容検索 |
| `WebSearch` | Web検索 |
| `WebFetch` | Webページ内容の取得 |

## プロジェクト構成

```
claude_agent_app/
├── app/
│   ├── frontend/          # Reactフロントエンド
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── contexts/
│   │   │   ├── hooks/
│   │   │   ├── i18n/
│   │   │   └── pages/
│   │   └── public/
│   ├── backend/           # Node.jsバックエンド
│   │   ├── agent/         # Claude Agent SDK統合
│   │   └── db/            # データベース（Drizzle ORM）
│   ├── shared/            # 共有型定義
│   ├── app.yaml           # Databricks Apps実行設定
│   └── package.json       # Turborepo設定
├── resources/
│   └── claude_agent.app.yml  # DABアプリリソース定義
├── databricks.yml         # Databricksバンドル設定
├── CLAUDE.md              # Claude Codeガイダンス
└── README.md
```

## ライセンス

Apache License 2.0
