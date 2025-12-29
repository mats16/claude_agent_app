# Session Management Refactoring Plan

## 概要

Session stub（8文字hex）を廃止し、TypeID形式（`session_` + UUIDv7 Base32）に移行する大規模リファクタリング。

## 変更の全体像

### Before
```
Session ID: UUID v4 (e.g., "550e8400-e29b-41d4-a716-446655440000")
Session Stub: 8-char hex (e.g., "a1b2c3d4")
URL: /sessions/{claude_code_session_id}
App Name: app-by-claude-{stub}
Directory: $HOME/ws/{stub}
```

### After
```
Session ID: TypeID (e.g., "session_01h455vb4pex5vsknk084sn02q")
Claude Code Session ID: 別カラムで管理
URL: /{session_id} (e.g., /session_01h455vb4pex5vsknk084sn02q)
App Name: app-by-claude-{suffix} (TypeIDの末尾8文字)
Directory: $HOME/ws/{suffix}
```

---

## Phase 1: 依存パッケージの追加

### 1.1 typeid-js のインストール

```bash
cd app/backend
npm install typeid-js
```

---

## Phase 2: Session モデルの作成

### 2.1 新規ファイル: `app/backend/models/Session.ts`

```typescript
import { typeid, TypeID } from 'typeid-js';

export class Session {
  private _id: TypeID<'session'>;
  private _claudeCodeSessionId: string | null = null;

  constructor(id?: string) {
    if (id) {
      this._id = TypeID.fromString(id) as TypeID<'session'>;
    } else {
      this._id = typeid('session');
    }
  }

  // Getters
  get id(): string {
    return this._id.toString();
  }

  get suffix(): string {
    return this._id.getSuffix();  // UUIDv7 Base32部分
  }

  get shortSuffix(): string {
    return this.suffix.slice(-8);  // 末尾8文字（App名・ディレクトリ用）
  }

  get claudeCodeSessionId(): string | null {
    return this._claudeCodeSessionId;
  }

  get localPath(): string {
    return path.join(paths.sessionsBase, this.shortSuffix);
  }

  get appName(): string {
    return `app-by-claude-${this.shortSuffix}`;
  }

  get gitBranch(): string {
    return `claude/session-${this.shortSuffix}`;
  }

  // Methods
  setClaudeCodeSessionId(sessionId: string): void {
    this._claudeCodeSessionId = sessionId;
  }

  static fromString(id: string): Session {
    return new Session(id);
  }

  static isValidId(id: string): boolean {
    try {
      const parsed = TypeID.fromString(id);
      return parsed.getType() === 'session';
    } catch {
      return false;
    }
  }
}
```

---

## Phase 3: データベーススキーマの変更

### 3.1 スキーマ変更: `app/backend/db/schema.ts`

**sessions テーブル:**

| Column | Before | After |
|--------|--------|-------|
| id | `text` (UUID) | `text` (TypeID: session_xxx) |
| stub | `text` (8-char hex) | **削除** |
| claude_code_session_id | - | `text` (新規追加, nullable) |
| agent_local_path | `text` | **削除** (Session モデルから導出) |

```typescript
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),  // TypeID format: session_xxx
    claudeCodeSessionId: text('claude_code_session_id'),  // Claude Code internal session ID
    title: text('title'),
    summary: text('summary'),
    model: text('model').notNull(),
    workspacePath: text('workspace_path'),
    userId: text('user_id').notNull(),
    workspaceAutoPush: boolean('workspace_auto_push').default(false).notNull(),
    appAutoDeploy: boolean('app_auto_deploy').default(false).notNull(),
    isArchived: boolean('is_archived').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  // RLS policy unchanged
);
```

### 3.2 マイグレーション作成

既存データを削除し、新スキーマを適用:

```sql
-- Drop existing tables (cascade to events)
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;

-- Recreate with new schema
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,  -- TypeID format
  claude_code_session_id TEXT,
  title TEXT,
  summary TEXT,
  model TEXT NOT NULL,
  workspace_path TEXT,
  user_id TEXT NOT NULL,
  workspace_auto_push BOOLEAN NOT NULL DEFAULT FALSE,
  app_auto_deploy BOOLEAN NOT NULL DEFAULT FALSE,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Recreate events table
CREATE TABLE events (
  uuid TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  subtype TEXT,
  message JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Recreate indexes
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_events_session_id ON events(session_id);
CREATE INDEX idx_events_session_seq ON events(session_id, seq);

-- Recreate RLS policies
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY sessions_user_policy ON sessions
  FOR ALL USING (user_id = current_setting('app.current_user_id', true));
```

---

## Phase 4: バックエンド実装の変更

### 4.1 utils/stub.ts の削除

このファイルは不要になるため削除。

### 4.2 agent/index.ts の変更

**環境変数の変更:**

```typescript
// Before
env: {
  SESSION_APP_NAME: `app-by-claude-${sessionStub}`,
  GIT_BRANCH: `claude/session-${sessionStub}`,
  // ...
}

// After
env: {
  CLAUDE_CODE_REMOTE_SESSION_ID: session.id,  // TypeID
  // CLAUDE_CODE_SESSION_ID: undefined (後回し)
  SESSION_APP_NAME: session.appName,
  GIT_BRANCH: session.gitBranch,
  // ...
}
```

**ProcessAgentRequestOptions の変更:**

```typescript
// Before
export interface ProcessAgentRequestOptions {
  sessionStub: string;
  agentLocalPath?: string;
  // ...
}

// After
export interface ProcessAgentRequestOptions {
  session: Session;  // Session モデルを渡す
  // agentLocalPath は Session.localPath から取得
  // ...
}
```

### 4.3 routes/v1/sessions/handlers.ts の変更

**createSessionHandler:**

```typescript
// Before
const sessionStub = generateSessionStub();
const localWorkPath = path.join(paths.sessionsBase, sessionStub);

// After
const session = new Session();
const localWorkPath = session.localPath;
```

**claude_code_session_id の更新:**

init メッセージ受信時に `claude_code_session_id` を更新するロジックを追加:

```typescript
for await (const event of generator) {
  if (event.type === 'system' && event.subtype === 'init') {
    // Claude Code session ID を取得して更新
    const claudeCodeSessionId = event.session_id;
    session.setClaudeCodeSessionId(claudeCodeSessionId);

    // DBに保存
    await db.update(sessions)
      .set({ claudeCodeSessionId })
      .where(eq(sessions.id, session.id));
  }
  // ...
}
```

### 4.4 ルートパラメータの変更

`sessionId` パラメータの型とバリデーションを変更:

```typescript
// Before
Params: { sessionId: string }  // UUID

// After
Params: { sessionId: string }  // TypeID (session_xxx)

// Validation
if (!Session.isValidId(sessionId)) {
  return reply.status(400).send({ error: 'Invalid session ID format' });
}
```

---

## Phase 5: 共有型の変更

### 5.1 app/shared/types.ts

```typescript
// Session interface updates
export interface Session {
  id: string;  // TypeID format: session_xxx
  claudeCodeSessionId: string | null;  // Claude Code internal session ID
  title: string | null;
  // stub: 削除
  // ...
}

// API response types
export interface CreateSessionResponse {
  sessionId: string;  // TypeID format
}
```

---

## Phase 6: フロントエンドの変更

### 6.1 ルーティング変更: `App.tsx`

```typescript
// Before
<Route path="/sessions/:sessionId" element={<SessionPage />} />

// After
<Route path="/:sessionId" element={<SessionPage />} />
```

### 6.2 SessionPage.tsx の変更

```typescript
// URL validation
const { sessionId } = useParams<{ sessionId: string }>();

// TypeID validation (optional - could also validate on backend only)
if (!sessionId?.startsWith('session_')) {
  return <Navigate to="/" />;
}
```

### 6.3 SessionList.tsx / SessionsContext の変更

セッションクリック時のナビゲーション変更:

```typescript
// Before
navigate(`/sessions/${session.id}`);

// After
navigate(`/${session.id}`);
```

### 6.4 useAgent.ts の変更

WebSocket URL の変更:

```typescript
// Before
const wsUrl = `/api/v1/sessions/${sessionId}/ws`;

// After (変更なし - sessionId のフォーマットが変わるだけ)
const wsUrl = `/api/v1/sessions/${sessionId}/ws`;
```

---

## Phase 7: テストの更新

### 7.1 Session モデルのユニットテスト

```typescript
describe('Session', () => {
  it('should generate valid TypeID', () => {
    const session = new Session();
    expect(session.id).toMatch(/^session_[0-9a-z]{26}$/);
  });

  it('should parse existing TypeID', () => {
    const id = 'session_01h455vb4pex5vsknk084sn02q';
    const session = Session.fromString(id);
    expect(session.id).toBe(id);
  });

  it('should provide shortSuffix for app name', () => {
    const session = new Session();
    expect(session.shortSuffix).toHaveLength(8);
    expect(session.appName).toBe(`app-by-claude-${session.shortSuffix}`);
  });
});
```

---

## 実装順序

1. **typeid-js パッケージのインストール**
2. **Session モデルの作成** (`models/Session.ts`)
3. **データベーススキーマの変更** (`db/schema.ts`)
4. **マイグレーションファイルの作成と実行**
5. **utils/stub.ts の削除**
6. **shared/types.ts の更新**
7. **agent/index.ts の更新**
8. **routes/v1/sessions/ の全ハンドラー更新**
9. **フロントエンドルーティングの変更**
10. **SessionsContext, SessionList, SessionPage の更新**
11. **テストの更新**
12. **動作確認**

---

## 影響を受けるファイル一覧

### Backend
- `app/backend/package.json` - typeid-js 追加
- `app/backend/models/Session.ts` - 新規作成
- `app/backend/db/schema.ts` - スキーマ変更
- `app/backend/db/migrations/` - 新規マイグレーション
- `app/backend/utils/stub.ts` - 削除
- `app/backend/agent/index.ts` - 環境変数・オプション変更
- `app/backend/routes/v1/sessions/handlers.ts` - 全面改修
- `app/backend/routes/v1/sessions/websocket.ts` - 軽微な変更
- `app/backend/services/sessionState.ts` - 型変更

### Shared
- `app/shared/types.ts` - Session インターフェース変更

### Frontend
- `app/frontend/src/App.tsx` - ルーティング変更
- `app/frontend/src/pages/SessionPage.tsx` - URL 変更対応
- `app/frontend/src/components/SessionList.tsx` - ナビゲーション変更
- `app/frontend/src/contexts/SessionsContext.tsx` - 型変更

---

## リスクと注意点

1. **既存セッションの削除**: 本番環境では事前にデータバックアップを推奨
2. **URL変更**: ブックマークやリンクが無効になる
3. **TypeID衝突**: UUIDv7はタイムスタンプベースのため衝突リスクは極めて低い
4. **App名の重複**: shortSuffix（8文字）での衝突可能性は非常に低いが、念のためエラーハンドリングを実装
