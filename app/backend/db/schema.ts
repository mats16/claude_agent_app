import {
  pgTable,
  text,
  timestamp,
  jsonb,
  index,
  integer,
  boolean,
  primaryKey,
} from 'drizzle-orm/pg-core';

// Users table
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// Sessions table
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  title: text('title'),
  model: text('model').notNull(),
  workspacePath: text('workspace_path'),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  workspaceAutoPush: boolean('auto_workspace_push').default(false).notNull(),
  appAutoDeploy: boolean('app_auto_deploy').default(false).notNull(),
  cwd: text('cwd'),
  isArchived: boolean('is_archived').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

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
export const settings = pgTable('settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  claudeConfigAutoPush: boolean('claude_config_sync').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type Settings = typeof settings.$inferSelect;
export type NewSettings = typeof settings.$inferInsert;

// OAuth tokens table for storing encrypted access tokens
// Primary key is composite (user_id, provider) to allow one token per provider per user
export const oauthTokens = pgTable(
  'oauth_tokens',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    authType: text('auth_type').notNull(), // 'pat' for personal access token
    provider: text('provider').notNull(), // 'databricks'
    accessToken: text('access_token').notNull(), // Encrypted token value
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.provider] })]
);

export type OAuthToken = typeof oauthTokens.$inferSelect;
export type NewOAuthToken = typeof oauthTokens.$inferInsert;
