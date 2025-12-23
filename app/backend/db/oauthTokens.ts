import { and, eq, sql } from 'drizzle-orm';
import { db } from './index.js';
import { oauthTokens, type OAuthToken, type NewOAuthToken } from './schema.js';

// Provider constants
export const PROVIDER_DATABRICKS = 'databricks';
export const AUTH_TYPE_PAT = 'pat';

// Helper to execute queries with RLS user context
async function withUserContext<T>(
  userId: string,
  fn: () => Promise<T>
): Promise<T> {
  await db.execute(
    sql`SELECT set_config('app.current_user_id', ${userId}, true)`
  );
  return fn();
}

// Get token by user and provider (with RLS)
export async function getToken(
  userId: string,
  provider: string
): Promise<OAuthToken | null> {
  return withUserContext(userId, async () => {
    const result = await db
      .select()
      .from(oauthTokens)
      .where(
        and(eq(oauthTokens.userId, userId), eq(oauthTokens.provider, provider))
      )
      .limit(1);

    return result[0] ?? null;
  });
}

// Get token without RLS (for internal use when user context is already verified)
export async function getTokenDirect(
  userId: string,
  provider: string
): Promise<OAuthToken | null> {
  const result = await db
    .select()
    .from(oauthTokens)
    .where(
      and(eq(oauthTokens.userId, userId), eq(oauthTokens.provider, provider))
    )
    .limit(1);

  return result[0] ?? null;
}

// Check if token exists for user and provider (with RLS)
export async function hasToken(
  userId: string,
  provider: string
): Promise<boolean> {
  return withUserContext(userId, async () => {
    const result = await db
      .select({ userId: oauthTokens.userId })
      .from(oauthTokens)
      .where(
        and(eq(oauthTokens.userId, userId), eq(oauthTokens.provider, provider))
      )
      .limit(1);

    return result.length > 0;
  });
}

// Upsert token (create or update) with RLS
export async function upsertToken(
  userId: string,
  provider: string,
  authType: string,
  encryptedToken: string
): Promise<void> {
  return withUserContext(userId, async () => {
    const existing = await db
      .select()
      .from(oauthTokens)
      .where(
        and(eq(oauthTokens.userId, userId), eq(oauthTokens.provider, provider))
      )
      .limit(1);

    if (existing.length > 0) {
      // Update existing token
      await db
        .update(oauthTokens)
        .set({
          authType,
          accessToken: encryptedToken,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(oauthTokens.userId, userId),
            eq(oauthTokens.provider, provider)
          )
        );
    } else {
      // Create new token
      const newToken: NewOAuthToken = {
        userId,
        provider,
        authType,
        accessToken: encryptedToken,
      };
      await db.insert(oauthTokens).values(newToken);
    }
  });
}

// Delete token (with RLS)
export async function deleteToken(
  userId: string,
  provider: string
): Promise<void> {
  return withUserContext(userId, async () => {
    await db
      .delete(oauthTokens)
      .where(
        and(eq(oauthTokens.userId, userId), eq(oauthTokens.provider, provider))
      );
  });
}

// Convenience functions for Databricks PAT

// Get encrypted Databricks PAT (without RLS - for internal use)
export async function getEncryptedDatabricksPat(
  userId: string
): Promise<string | null> {
  const token = await getTokenDirect(userId, PROVIDER_DATABRICKS);
  return token?.accessToken ?? null;
}

// Check if Databricks PAT is set (with RLS)
export async function hasDatabricksPat(userId: string): Promise<boolean> {
  return hasToken(userId, PROVIDER_DATABRICKS);
}

// Set Databricks PAT (with RLS)
export async function setDatabricksPat(
  userId: string,
  encryptedPat: string
): Promise<void> {
  return upsertToken(userId, PROVIDER_DATABRICKS, AUTH_TYPE_PAT, encryptedPat);
}

// Delete Databricks PAT (with RLS)
export async function deleteDatabricksPat(userId: string): Promise<void> {
  return deleteToken(userId, PROVIDER_DATABRICKS);
}
