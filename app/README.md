# Claude Agent App

Claude Agent SDK を用いた Web ベースのコーディングエージェント。

## 概要

このアプリケーションは、Claude Code のようなコーディングエージェント機能を Web インターフェースで提供します。

- **フロントエンド**: React + TypeScript + Vite
- **バックエンド**: Fastify + TypeScript
- **通信**: WebSocket によるリアルタイム通信
- **AI エージェント**: Claude Agent SDK (Anthropic)
- **ビルドシステム**: Turborepo

## ディレクトリ構成

```
app/
├── frontend/              # React フロントエンド
│   ├── src/
│   │   ├── hooks/
│   │   │   └── useAgent.ts    # WebSocket 通信フック
│   │   ├── App.tsx            # メイン UI
│   │   ├── App.css            # スタイル
│   │   └── main.tsx           # エントリポイント
│   ├── package.json
│   └── vite.config.ts
├── backend/               # Fastify バックエンド
│   ├── agent/
│   │   ├── index.ts      # エージェントループ
│   │   └── tools.ts      # ツール定義と実行
│   ├── app.ts            # Fastify サーバー
│   ├── package.json
│   └── tsconfig.json
├── package.json           # ルート設定（Turborepo）
├── turbo.json             # Turborepo 設定
└── app.yml                # Databricks Apps 設定
```

## セットアップ

### 前提条件

- Node.js 18+
- npm 10+
- Anthropic API キー

### 環境変数

#### オプション 1: Databricks 環境（推奨）

Databricks の Anthropic プロキシエンドポイントを使用:

```bash
export DATABRICKS_HOST="https://your-workspace.databricks.com"
export DATABRICKS_TOKEN="your-databricks-token"
export WORKSPACE_PATH=/path/to/your/workspace
```

または `.env` ファイルを作成:

```
DATABRICKS_HOST=https://your-workspace.databricks.com
DATABRICKS_TOKEN=your-databricks-token
WORKSPACE_PATH=/path/to/your/workspace
```

#### オプション 2: 直接 Anthropic API を使用

```bash
export ANTHROPIC_API_KEY="your-api-key-here"
export WORKSPACE_PATH=/path/to/your/workspace
```

または `.env` ファイルを作成:

```
ANTHROPIC_API_KEY=your-api-key-here
WORKSPACE_PATH=/path/to/your/workspace
```

### インストール

```bash
# プロジェクトルートで全ワークスペースの依存関係をインストール
npm install

# または個別にインストール
npm install --workspace=backend
npm install --workspace=frontend
```

## 開発

### すべてのワークスペースを開発モードで起動

```bash
npm run dev
```

- フロントエンド開発サーバー: http://localhost:5173
- バックエンドサーバー: http://localhost:8000

### 個別に起動

```bash
# バックエンドのみ
npm run dev --workspace=backend

# フロントエンドのみ
npm run dev --workspace=frontend
```

## ビルド

```bash
# すべてのワークスペースをビルド
npm run build
```

フロントエンドは `frontend/dist` にビルドされ、バックエンドから静的ファイルとして配信されます。

## 本番サーバー起動

```bash
# ビルド後に本番サーバーを起動
npm start
```

サーバーは http://0.0.0.0:8000 で起動します。

## 機能

### エージェントツール

| ツール名 | 説明 |
|---------|------|
| `read_file` | ファイル内容を読み取る |
| `write_file` | ファイルに内容を書き込む |
| `list_directory` | ディレクトリ内のファイル一覧を取得 |
| `search_files` | ファイル名でグロブ検索 (例: `**/*.ts`) |
| `grep_search` | ファイル内容をテキスト検索 |
| `run_command` | シェルコマンドを実行（制限付き） |

### セキュリティ機能

- **ワークスペース境界の強制**: ファイル操作はワークスペース内に制限
- **危険なコマンドのブロック**: `rm -rf`, `mkfs`, `dd` などをブロック
- **コマンド実行のタイムアウト**: 長時間実行を防止

## API エンドポイント

### REST API

- `GET /api/health` - ヘルスチェック
- `GET /api/hello` - テスト用エンドポイント

### WebSocket

- `WS /ws/agent` - エージェント通信

#### メッセージフォーマット

**初期化:**
```json
{ "type": "init" }
```

**メッセージ送信:**
```json
{
  "type": "message",
  "content": "List all TypeScript files"
}
```

**受信メッセージタイプ:**
- `response`: エージェントからのテキスト応答
- `tool_use`: ツールの使用開始
- `tool_result`: ツールの実行結果
- `error`: エラーメッセージ
- `complete`: 処理完了

## Turborepo について

- **並列ビルド**: frontend と backend を並列でビルド
- **キャッシュ**: 変更のないパッケージのビルドをスキップ
- **依存関係**: 依存順序を自動解決

## Databricks Apps デプロイ

### デプロイ前の準備

1. **環境変数の設定**
   - ローカルの `.env` ファイルは除外されます（`.databricksignore` で設定済み）
   - Databricks Apps では環境変数を Databricks Secrets または App 設定で管理します

2. **ビルドの実行**
   ```bash
   npm run build
   ```

### デプロイコマンド

```bash
# バンドルの検証
databricks bundle validate

# 開発環境へデプロイ
databricks bundle deploy -t dev

# 本番環境へデプロイ
databricks bundle deploy -t prod
```

### 除外ファイル

以下のファイルは自動的にデプロイから除外されます：
- `.env` および `.env.*` ファイル
- `node_modules/` ディレクトリ
- `.git/`, `.vscode/` などの開発ツールディレクトリ

除外パターンは以下のファイルで定義されています：
- `.databricksignore`
- `databricks.yml` の `sync.exclude` セクション

## トラブルシューティング

### 認証情報が設定されていない

#### Databricks 環境の場合

環境変数を確認:
```bash
echo $DATABRICKS_HOST
echo $DATABRICKS_TOKEN
```

設定されていない場合:
```bash
export DATABRICKS_HOST="https://your-workspace.databricks.com"
export DATABRICKS_TOKEN="your-databricks-token"
```

#### 直接 Anthropic API を使用する場合

環境変数を確認:
```bash
echo $ANTHROPIC_API_KEY
```

設定されていない場合:
```bash
export ANTHROPIC_API_KEY="your-api-key"
```

### WebSocket 接続エラー

- バックエンドサーバーが起動しているか確認
- ブラウザのコンソールでエラーメッセージを確認
- ポート 8000 が使用可能か確認

### フロントエンドがビルドされていない

```bash
npm run build --workspace=frontend
```

## 技術スタック

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Fastify 4 + TypeScript
- **Agent**: Claude Agent SDK (@anthropic-ai/sdk)
- **Communication**: WebSocket (@fastify/websocket)
- **Build**: Turborepo
- **Package Manager**: npm workspaces
