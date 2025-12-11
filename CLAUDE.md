# Claude Agent App

Turborepo を使用した React + Fastify のモノレポ構成アプリケーション。Claude Agent SDK を統合したコーディングエージェント。

**現在の状態**: Claude Agent SDK 実装中
**目標**: Claude Code のような Web ベースのコーディングエージェント

## プロジェクト概要

- **フロントエンド**: React + TypeScript + Vite
- **バックエンド**: Fastify + TypeScript（Node.js）
- **リアルタイム通信**: WebSocket
- **ビルドツール**: Turborepo
- **パッケージマネージャ**: npm workspaces
- **AI エージェント**: Claude Agent SDK (Anthropic)
- **デプロイ**: Databricks Apps

## ディレクトリ構成

```
claude_agent_app/
├── app/                   # モノレポルート
│   ├── frontend/          # React フロントエンド
│   │   ├── src/
│   │   │   ├── App.tsx           # メインコンポーネント
│   │   │   ├── App.css
│   │   │   ├── main.tsx          # エントリポイント
│   │   │   ├── index.css
│   │   │   └── hooks/
│   │   │       └── useAgent.ts   # WebSocket 接続フック
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json          # @app/frontend
│   ├── backend/           # Fastify バックエンド
│   │   ├── app.ts                # Fastify サーバー
│   │   ├── agent/
│   │   │   ├── index.ts          # エージェントループ
│   │   │   └── tools.ts          # エージェントツール定義
│   │   ├── routes/
│   │   │   └── agent.ts          # WebSocket ルート
│   │   ├── dist/                 # ビルド出力
│   │   ├── tsconfig.json
│   │   └── package.json          # @app/backend
│   ├── package.json              # モノレポ設定
│   ├── turbo.json                # Turborepo 設定
│   └── app.yaml                  # Databricks Apps 起動設定
├── resources/
│   └── claude_agent.app.yml      # Databricks Apps 設定
├── databricks.yml                # Databricks Asset Bundle 設定
├── package.json                  # ルートスクリプト
└── CLAUDE.md                     # このファイル
```

## パッケージ管理

- **モノレポ**: npm workspaces
- **ビルド**: Turborepo
- **パッケージマネージャ**: npm

## 開発環境セットアップ

### 前提条件

- Node.js 18+
- npm 10+

### 依存関係のインストール

```bash
# プロジェクトルートまたは app/ ディレクトリから
npm install
```

または

```bash
# app/ ディレクトリで
cd app
npm install
```

### 依存関係の追加

```bash
# フロントエンドにパッケージを追加
cd app/frontend
npm install <package-name>

# バックエンドにパッケージを追加
cd app/backend
npm install <package-name>
```

### 環境変数

```bash
# app/backend/.env
ANTHROPIC_API_KEY=your-api-key-here
PORT=8000
LOG_LEVEL=info
```

または

```bash
# プロジェクトルートで
export ANTHROPIC_API_KEY="your-api-key-here"
```

## 開発・ビルド・起動

### プロジェクトルートから実行

```bash
# ビルド（フロントエンド + バックエンドを並列ビルド）
npm run build

# 本番サーバー起動（ビルド済みバックエンドを起動）
npm start

# 開発モード（フロントエンド + バックエンドを並列起動）
npm run dev
```

### app/ ディレクトリから実行

```bash
cd app

# ビルド（Turborepo で並列実行）
npm run build

# 本番サーバー起動
npm start

# 開発モード
npm run dev
```

### 個別起動

```bash
# フロントエンドのみ開発モード（ポート 5173）
cd app/frontend
npm run dev

# バックエンドのみ開発モード（ポート 8000）
cd app/backend
npm run dev
```

## アーキテクチャ

### バックエンド（Fastify + TypeScript + WebSocket）

- **Web フレームワーク**: Fastify（高速・軽量）
- **WebSocket**: `@fastify/websocket` プラグイン
- **静的ファイル配信**: `@fastify/static` でフロントエンド配信
- **AI SDK**: `@anthropic-ai/sdk` で Claude と通信
- **Graceful Shutdown**: SIGTERM/SIGINT シグナルハンドリング

#### サーバー構成

```typescript
// app/backend/app.ts
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import staticPlugin from '@fastify/static';

const fastify = Fastify({ logger: true });

// WebSocket サポート
await fastify.register(websocket);

// 静的ファイル配信
await fastify.register(staticPlugin, {
  root: path.join(__dirname, '../../frontend/dist'),
});

// WebSocket ルート
fastify.register(async (fastify) => {
  fastify.get('/ws/agent', { websocket: true }, (connection, req) => {
    // エージェント通信
  });
});
```

#### Claude Agent 統合

```typescript
// app/backend/agent/index.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function* processAgentRequest(
  message: string,
  workspacePath: string
) {
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: message }
  ];

  while (true) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      tools: getTools(workspacePath),
      messages,
    });

    yield { type: 'response', content: response.content };

    if (response.stop_reason === 'tool_use') {
      const toolResults = await executeTools(response.content);
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
    } else {
      break;
    }
  }
}
```

#### エージェントツール

```typescript
// app/backend/agent/tools.ts
export const tools = [
  {
    name: 'read_file',
    description: 'ファイル内容を読み取る',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'ファイルパス' }
      },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'ファイルに書き込む',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'ファイルパス' },
        content: { type: 'string', description: 'ファイル内容' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'list_directory',
    description: 'ディレクトリ内のファイル一覧',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'ディレクトリパス' }
      },
      required: ['path']
    }
  },
  {
    name: 'search_files',
    description: 'ファイル名検索（glob）',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob パターン' }
      },
      required: ['pattern']
    }
  },
  {
    name: 'grep_search',
    description: 'コンテンツ検索（正規表現）',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: '正規表現パターン' },
        path: { type: 'string', description: '検索パス（省略可）' }
      },
      required: ['pattern']
    }
  },
  {
    name: 'run_command',
    description: 'シェルコマンド実行',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'コマンド' }
      },
      required: ['command']
    }
  }
];
```

### フロントエンド（React + TypeScript + Vite）

- **UI フレームワーク**: React 18
- **ビルドツール**: Vite
- **スタイリング**: CSS（グラデーション背景、カード UI）
- **リアルタイム通信**: WebSocket
- **状態管理**: React Hooks

#### WebSocket 接続

```typescript
// app/frontend/src/hooks/useAgent.ts
export const useAgent = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = (workspacePath: string) => {
    const ws = new WebSocket('ws://localhost:8000/ws/agent');

    ws.onopen = () => {
      ws.send(JSON.stringify({ workspacePath }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setMessages(prev => [...prev, data]);
    };

    wsRef.current = ws;
  };

  const sendMessage = (message: string) => {
    wsRef.current?.send(JSON.stringify({ message }));
    setIsProcessing(true);
  };

  return { messages, isProcessing, connect, sendMessage };
};
```

## API エンドポイント

### WebSocket エンドポイント

- `WS /ws/agent` - エージェント通信（メイン）

### REST API

- `GET /api/health` - ヘルスチェック
- `GET /` - React SPA を配信（静的ファイル）

### WebSocket メッセージフォーマット

#### クライアント → サーバー

```json
{
  "type": "init",
  "workspacePath": "/path/to/workspace"
}

{
  "type": "message",
  "content": "ユーザーのリクエスト"
}
```

#### サーバー → クライアント

```json
{
  "type": "response",
  "content": "エージェントのレスポンス"
}

{
  "type": "tool_use",
  "tool": "read_file",
  "input": { "path": "file.ts" }
}

{
  "type": "tool_result",
  "tool": "read_file",
  "result": "ファイル内容..."
}

{
  "type": "error",
  "message": "エラーメッセージ"
}

{
  "type": "complete",
  "message": "処理完了"
}
```

## Turborepo について

### 並列ビルド

```json
// turbo.json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    }
  }
}
```

- フロントエンドとバックエンドを並列でビルド
- 変更のないパッケージはキャッシュを利用
- 依存関係の順序を自動解決

## Databricks デプロイ

### デプロイ前の準備

```bash
# 1. フロントエンド + バックエンドをビルド
npm run build

# 2. ビルド成果物の確認
ls -la app/frontend/dist/    # フロントエンドビルド
ls -la app/backend/dist/     # バックエンドビルド
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

### Databricks Apps 設定

```yaml
# app/app.yaml
command: ["npm", "run", "start", "--workspace=backend"]
```

バックエンドが起動し、ビルド済みフロントエンドを配信します。

## コーディング規約

### TypeScript (共通)

- **厳格モード**: `strict: true`
- **型定義**: 明示的な型アノテーション推奨
- **命名規則**:
  - 変数・関数: camelCase
  - 型・インターフェース: PascalCase
  - 定数: UPPER_SNAKE_CASE

### フロントエンド

- **コンポーネント**: 関数コンポーネント + Hooks
- **スタイル**: CSS Modules または CSS-in-JS

### バックエンド

- **ルーティング**: Fastify のプラグインシステム
- **エラーハンドリング**: try-catch + エラーハンドリングフック
- **ロギング**: Fastify の組み込みロガー（pino）

## トラブルシューティング

### よくある問題

1. **フロントエンドがビルドされていない**
   ```bash
   npm run build
   ```

2. **ポート 8000 が使用中**
   ```bash
   # 他のプロセスを確認
   lsof -i :8000

   # または環境変数でポート変更
   PORT=8001 npm start
   ```

3. **Turborepo キャッシュの問題**
   ```bash
   # キャッシュをクリア
   cd app
   npx turbo clean
   npm run build
   ```

4. **依存関係の不整合**
   ```bash
   # node_modules を削除して再インストール
   rm -rf app/node_modules app/frontend/node_modules app/backend/node_modules
   cd app
   npm install
   ```

5. **TypeScript コンパイルエラー**
   ```bash
   # バックエンドの型チェック
   cd app/backend
   npx tsc --noEmit

   # フロントエンドの型チェック
   cd app/frontend
   npx tsc --noEmit
   ```

## 本番運用

### ログ

バックエンドは標準出力にログを出力：
- サーバー起動: `Backend server running on http://0.0.0.0:8000`
- SIGTERM/SIGINT: Graceful shutdown メッセージ

### モニタリング

- Health Check: `GET /api/health`
- 応答時間の監視
- エラーレート

### スケーリング

- Databricks Apps の自動スケーリング機能を利用
- バックエンドはステートレス設計

## セキュリティ

### ファイル操作

- **ワークスペース制限**: すべてのファイル操作を指定ワークスペース内に制限
- **パストラバーサル対策**: `path.resolve()` と `path.relative()` で検証
- **シンボリックリンク**: ワークスペース外を指すシンボリックリンクを拒否

```typescript
function validatePath(workspacePath: string, targetPath: string): string {
  const resolved = path.resolve(workspacePath, targetPath);
  const relative = path.relative(workspacePath, resolved);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path outside workspace');
  }

  return resolved;
}
```

### コマンド実行

- **ブロックリスト**: 危険なコマンドを拒否
  - `rm -rf /`
  - `sudo`
  - `chmod +x`（特定パターン）
  - その他破壊的コマンド

- **タイムアウト**: コマンド実行に制限時間を設定
- **出力サイズ制限**: 大量の出力を防ぐ

### API キー管理

- 環境変数で管理（`.env` ファイル）
- Git にコミットしない（`.gitignore` に追加）
- Databricks Apps では Secrets で管理

### WebSocket セキュリティ

- オリジン検証（CORS）
- レート制限
- セッションタイムアウト

## 技術スタック

### バックエンド

- **Fastify**: 4.x（Web フレームワーク）
- **@fastify/websocket**: WebSocket サポート
- **@fastify/static**: 静的ファイル配信
- **@anthropic-ai/sdk**: Claude API クライアント
- **glob**: ファイル検索
- **dotenv**: 環境変数管理

### フロントエンド

- **React**: 18.x
- **TypeScript**: 5.x
- **Vite**: 5.x
- **highlight.js**: コードハイライト
- **marked**: Markdown レンダリング
- **DOMPurify**: XSS 対策
