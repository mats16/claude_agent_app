# Claude Coding Agent

Claude Agent SDK を使ったコーディングエージェントアプリケーション。Claude Code のようなファイル操作、コマンド実行、コード検索機能を Web アプリとして提供します。

## 特徴

- **ファイル操作**: ファイルの読み書き、ディレクトリ一覧表示
- **コード検索**: Glob パターン検索、正規表現検索（grep）
- **コマンド実行**: ワークスペース内でのシェルコマンド実行
- **ストリーミングレスポンス**: リアルタイムでエージェントの応答を表示
- **セキュリティ**: ワークスペース外へのアクセス制限、危険なコマンドのブロック

## アーキテクチャ

```
┌─────────────────────────────────────────┐
│         Frontend (React + TS)           │
│  - Workspace Path Input                 │
│  - Request Input (textarea)             │
│  - Response Display (streaming)         │
└──────────────┬──────────────────────────┘
               │ WebSocket
┌──────────────▼──────────────────────────┐
│     Backend (FastAPI + Anthropic)       │
│  - WebSocket Handler                    │
│  - Agent Loop (Anthropic SDK)           │
│  - Tool Implementations                 │
│    - read_file                          │
│    - write_file                         │
│    - list_directory                     │
│    - search_files (glob)                │
│    - grep_search                        │
│    - run_command                        │
└─────────────────────────────────────────┘
```

## セットアップ

### 前提条件

- Python 3.10+
- Node.js 18+
- Anthropic API キー

### 1. リポジトリのクローン

```bash
git clone <repository-url>
cd claude_agent_app
```

### 2. バックエンドのセットアップ

**uv を使う場合（推奨）:**

```bash
# uv のインストール（未インストールの場合）
curl -LsSf https://astral.sh/uv/install.sh | sh

# プロジェクトルートで依存関係をインストール
uv sync

# requirements.txt を生成（Databricks Apps 用）
uv pip compile pyproject.toml -o src/app/requirements.txt

# 環境変数の設定
cp src/app/.env.example src/app/.env
# .env ファイルを編集して ANTHROPIC_API_KEY を設定
```

**pip を使う場合:**

```bash
# 仮想環境の作成
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# 依存関係のインストール
pip install -e .

# 環境変数の設定
cp src/app/.env.example src/app/.env
# .env ファイルを編集して ANTHROPIC_API_KEY を設定
```

### 3. フロントエンドのセットアップ

```bash
cd src/app

# 依存関係のインストール
npm install

# フロントエンドのビルド
npm run build
```

## 起動方法

### 開発環境

#### バックエンド（ターミナル 1）

**uv を使う場合:**

```bash
# プロジェクトルートから
uv run uvicorn src.app.backend.main:app --reload --host 0.0.0.0 --port 8000
```

**pip を使う場合:**

```bash
cd src/app
source .venv/bin/activate  # 仮想環境をアクティベート
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

#### フロントエンド（ターミナル 2）

```bash
cd src/app
npm run dev
```

ブラウザで `http://localhost:5173` を開く

### 本番環境

**uv を使う場合:**

```bash
cd src/app

# フロントエンドをビルド
npm run build

# バックエンドを起動（静的ファイルも配信）
cd ../..  # プロジェクトルートへ
uv run uvicorn src.app.backend.main:app --host 0.0.0.0 --port 8000
```

**pip を使う場合:**

```bash
cd src/app

# フロントエンドをビルド
npm run build

# バックエンドを起動（静的ファイルも配信）
source .venv/bin/activate
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

ブラウザで `http://localhost:8000` を開く

## 使い方

1. **Workspace Path** にエージェントが操作するディレクトリのパスを入力
   - 例: `/Users/username/my-project`

2. **Request** にエージェントへの指示を入力
   - 例: 「List all Python files in this directory」
   - 例: 「Create a new file called hello.py with a simple hello world function」
   - 例: 「Search for all TODO comments in the codebase」

3. **Send Request** ボタンをクリック

4. **Response** セクションにエージェントの応答がストリーミング表示される
   - テキストレスポンス
   - ツール使用の通知
   - ツール実行結果

## 利用可能なツール

### 1. read_file
ファイルの内容を読み取る

```
例: "Read the contents of README.md"
```

### 2. write_file
ファイルに内容を書き込む

```
例: "Create a new file called test.py with a simple function"
```

### 3. list_directory
ディレクトリ内のファイル一覧を表示

```
例: "List all files in the current directory"
```

### 4. search_files
Glob パターンでファイルを検索

```
例: "Find all Python files"
例: "Search for all .tsx files in the src directory"
```

### 5. grep_search
正規表現でファイル内容を検索

```
例: "Search for all TODO comments"
例: "Find all function definitions in Python files"
```

### 6. run_command
シェルコマンドを実行（セキュリティ制限付き）

```
例: "Run git status"
例: "Run npm test"
```

## セキュリティ機能

### ファイルアクセス制限
- ワークスペースディレクトリ外へのアクセスを禁止
- パストラバーサル攻撃を防止
- シンボリックリンクの適切な処理

### コマンド実行制限
- 危険なコマンドのブロックリスト
  - `rm -rf`, `sudo`, `dd`, `mkfs` など
  - ネットワークコマンド (`curl`, `wget`, `nc`)
- タイムアウト設定（デフォルト: 30秒）
- 標準出力/エラー出力のキャプチャ

## プロジェクト構造

```
claude_agent_app/
├── src/app/
│   ├── backend/
│   │   ├── __init__.py
│   │   ├── main.py              # FastAPI アプリケーション
│   │   ├── agent.py             # エージェントループ
│   │   └── agent_tools.py       # ツール実装
│   ├── frontend/
│   │   ├── src/
│   │   │   ├── App.tsx          # メインコンポーネント
│   │   │   ├── App.css          # スタイル
│   │   │   ├── main.tsx         # エントリポイント
│   │   │   └── hooks/
│   │   │       └── useAgent.ts  # WebSocket フック
│   │   ├── index.html
│   │   └── vite.config.ts
│   ├── main.py                  # Databricks Apps エントリポイント
│   ├── package.json             # Node.js 依存関係
│   ├── requirements.txt         # Python 依存関係（自動生成）
│   ├── app.yml                  # Databricks Apps 起動設定
│   ├── .env.example             # 環境変数テンプレート
│   └── .gitignore
├── pyproject.toml               # Python プロジェクト設定・依存関係
├── databricks.yml               # Databricks デプロイ設定
└── README.md
```

## トラブルシューティング

### エラー: "ANTHROPIC_API_KEY not found"
- `.env` ファイルが存在し、正しい API キーが設定されているか確認
- 環境変数が読み込まれているか確認

### エラー: "Workspace path does not exist"
- 入力したパスが存在するか確認
- 絶対パスを使用しているか確認

### WebSocket 接続エラー
- バックエンドが起動しているか確認
- ファイアウォール設定を確認

### ツールが正しく動作しない
- ワークスペースパスが正しく設定されているか確認
- ブロックされたコマンドを実行していないか確認

## 開発

### 依存関係の追加

**Python パッケージ:**

uv を使う場合:
```bash
# pyproject.toml に依存関係を追加
uv add <package-name>

# 開発用の依存関係を追加
uv add --dev <package-name>

# requirements.txt を更新（Databricks Apps 用）
uv pip compile pyproject.toml -o src/app/requirements.txt
```

pip を使う場合:
```bash
# パッケージをインストール
pip install <package-name>

# pyproject.toml の dependencies に手動で追加
```

**Node.js パッケージ:**
```bash
npm install <package-name>
```

### テスト

```bash
# バックエンド
pytest tests/

# フロントエンド
npm test
```

## ライセンス

MIT

## 参考

- [Claude Agent SDK](https://docs.anthropic.com/claude/docs)
- [FastAPI](https://fastapi.tiangolo.com/)
- [React](https://react.dev/)
