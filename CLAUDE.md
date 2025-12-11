# Claude Agent App

Claude Agent SDK を用いてサーバサイドで動作するコーディングエージェントアプリケーション。

## プロジェクト概要

このプロジェクトは Claude Code のようなコーディングエージェントを Web アプリケーションとして提供する。

- **フロントエンド**: React + TypeScript + Vite
- **バックエンド**: FastAPI (Python)
- **AI エージェント**: Claude Agent SDK (Anthropic)
- **デプロイ**: Databricks Apps

## ディレクトリ構成

```
claude_agent_app/
├── src/app/
│   ├── backend/           # FastAPI バックエンド
│   │   ├── __init__.py
│   │   └── main.py        # FastAPI アプリケーションのエントリポイント
│   ├── frontend/          # React フロントエンド
│   │   ├── src/
│   │   │   ├── App.tsx    # メインコンポーネント
│   │   │   ├── App.css
│   │   │   ├── main.tsx   # エントリポイント
│   │   │   └── index.css
│   │   ├── index.html
│   │   └── vite.config.ts
│   ├── requirements.txt   # Python 依存関係
│   ├── package.json       # Node.js 依存関係
│   └── app.yaml           # アプリケーション起動設定
├── resources/
│   └── claude_agent.app.yml  # Databricks Apps 設定
├── databricks.yml         # Databricks Asset Bundle 設定
└── CLAUDE.md              # このファイル
```

## パッケージ管理

- **Python**: [uv](https://docs.astral.sh/uv/) - 高速な Python パッケージマネージャ
- **Node.js**: npm

## 開発環境セットアップ

### 前提条件

- Python 3.10+
- Node.js 18+
- uv (`curl -LsSf https://astral.sh/uv/install.sh | sh`)

### バックエンド

```bash
cd src/app
uv venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
uv pip install -r requirements.txt
```

### フロントエンド

```bash
cd src/app
npm install
```

### 依存関係の追加

```bash
# Python パッケージの追加
uv pip install <package-name>
uv pip freeze > requirements.txt

# Node.js パッケージの追加
npm install <package-name>
```

### 環境変数

```bash
export ANTHROPIC_API_KEY="your-api-key"
```

## 開発サーバ起動

### バックエンド（FastAPI）

```bash
cd src/app
uvicorn backend.main:app --reload --port 8000
```

### フロントエンド（Vite 開発サーバ）

```bash
cd src/app
npm run dev
```

### ビルド

```bash
cd src/app
npm run build  # フロントエンドをビルドし backend/static に出力
```

## Claude Agent SDK アーキテクチャ

### エージェントループの基本構造

```python
from anthropic import Anthropic

client = Anthropic()
messages = []

while True:
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4096,
        tools=tools,
        messages=messages
    )

    if response.stop_reason == "tool_use":
        # ツールを実行して結果を追加
        tool_results = execute_tools(response.content)
        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": tool_results})
    else:
        # 最終レスポンス
        break
```

### コーディングエージェント用ツール

実装予定のツール:

| ツール名 | 説明 |
|---------|------|
| `read_file` | ファイル内容を読み取る |
| `write_file` | ファイルに内容を書き込む |
| `edit_file` | ファイルの一部を編集する |
| `list_directory` | ディレクトリ内のファイル一覧を取得 |
| `search_files` | ファイル名でグロブ検索 |
| `grep` | ファイル内容を正規表現で検索 |
| `run_command` | シェルコマンドを実行 |

### ツール定義の例

```python
tools = [
    {
        "name": "read_file",
        "description": "指定されたパスのファイル内容を読み取る",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "読み取るファイルのパス"
                }
            },
            "required": ["path"]
        }
    }
]
```

## API エンドポイント設計

### 既存のエンドポイント

- `GET /api/hello` - ヘルスチェック用
- `GET /api/health` - ヘルスステータス
- `GET /api/data` - サンプルデータ取得

### 実装予定のエンドポイント

- `POST /api/chat` - エージェントとのチャット（ストリーミング対応）
- `GET /api/sessions` - セッション一覧
- `GET /api/sessions/{id}` - セッション詳細
- `DELETE /api/sessions/{id}` - セッション削除

## WebSocket 通信

リアルタイムのストリーミングレスポンスには WebSocket を使用:

```python
from fastapi import WebSocket

@app.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    await websocket.accept()
    # エージェントからのストリーミングレスポンスを送信
```

## セキュリティ考慮事項

- ファイル操作はワークスペースディレクトリ内に制限
- シェルコマンド実行はサンドボックス環境で行う
- 機密ファイル（.env, credentials など）へのアクセスを制限
- API キーは環境変数で管理し、コードにハードコードしない

## Databricks デプロイ

```bash
# バンドルの検証
databricks bundle validate

# 開発環境へデプロイ
databricks bundle deploy -t dev

# 本番環境へデプロイ
databricks bundle deploy -t prod
```

## コーディング規約

### Python (バックエンド)

- フォーマッタ: black
- リンター: ruff
- 型ヒント: 必須
- docstring: Google スタイル

### TypeScript (フロントエンド)

- フォーマッタ: prettier
- リンター: eslint
- 型定義: 厳格モード（strict: true）

## テスト

### バックエンド

```bash
pytest tests/
```

### フロントエンド

```bash
npm test
```

## トラブルシューティング

### よくある問題

1. **ANTHROPIC_API_KEY が設定されていない**
   - 環境変数を確認: `echo $ANTHROPIC_API_KEY`

2. **フロントエンドがビルドされていない**
   - `npm run build` を実行

3. **ポートが使用中**
   - 別のポートを指定: `uvicorn backend.main:app --port 8001`
