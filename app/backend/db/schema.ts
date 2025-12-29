import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgPolicy,
  text,
  timestamp,
  jsonb,
  index,
  integer,
  boolean,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { encryptedText } from './customTypes.js';

// Users table
export const users = pgTable('users', {
  id: text('id').primaryKey(), // primary key is implicitly NOT NULL
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// Sessions table (with RLS by user_id)
// id is TypeID format: session_ + UUIDv7 Base32 (e.g., session_01h455vb4pex5vsknk084sn02q)
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(), // TypeID format: session_xxx
    claudeCodeSessionId: text('claude_code_session_id'), // Claude Code internal session ID (set after init)
    title: text('title'),
    summary: text('summary'), // Auto-generated session summary from structured output
    model: text('model').notNull(),
    workspacePath: text('workspace_path'),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workspaceAutoPush: boolean('workspace_auto_push').default(false).notNull(),
    appAutoDeploy: boolean('app_auto_deploy').default(false).notNull(),
    isArchived: boolean('is_archived').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_sessions_user_id').on(table.userId),
    pgPolicy('sessions_user_policy', {
      as: 'permissive',
      for: 'all',
      using: sql`user_id = current_setting('app.current_user_id', true)`,
      withCheck: sql`user_id = current_setting('app.current_user_id', true)`,
    }),
  ]
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

// Events table
export const events = pgTable(
  'events',
  {
    uuid: text('uuid').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    type: text('type').notNull(),
    subtype: text('subtype'),
    message: jsonb('message').notNull(), // SDKMessage全体を保存
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_events_session_id').on(table.sessionId),
    index('idx_events_session_seq').on(table.sessionId, table.seq),
  ]
);

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;

// Settings table (with RLS by user_id)
export const settings = pgTable(
  'settings',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    claudeConfigAutoPush: boolean('claude_config_auto_push')
      .default(true)
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  () => [
    pgPolicy('settings_user_policy', {
      as: 'permissive',
      for: 'all',
      using: sql`user_id = current_setting('app.current_user_id', true)`,
      withCheck: sql`user_id = current_setting('app.current_user_id', true)`,
    }),
  ]
);

export type Settings = typeof settings.$inferSelect;
export type NewSettings = typeof settings.$inferInsert;

// OAuth tokens table for storing encrypted access tokens (with RLS by user_id)
// Primary key is composite (user_id, provider) to allow one token per provider per user
// Note: accessToken uses encryptedText custom type - automatically encrypts on write, decrypts on read
export const oauthTokens = pgTable(
  'oauth_tokens',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    authType: text('auth_type').notNull(), // 'pat' for personal access token
    provider: text('provider').notNull(), // 'databricks'
    accessToken: encryptedText('access_token').notNull(), // Auto-encrypted via AES-256-GCM
    expiresAt: timestamp('expires_at'), // Token expiration time (null = no expiry)
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.provider] }),
    pgPolicy('oauth_tokens_user_policy', {
      as: 'permissive',
      for: 'all',
      using: sql`user_id = current_setting('app.current_user_id', true)`,
      withCheck: sql`user_id = current_setting('app.current_user_id', true)`,
    }),
  ]
);

export type OAuthToken = typeof oauthTokens.$inferSelect;
export type NewOAuthToken = typeof oauthTokens.$inferInsert;
