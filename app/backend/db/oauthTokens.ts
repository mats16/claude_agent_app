import { and, eq } from 'drizzle-orm';
import { db } from './index.js';
import {
  oauthTokens,
  type SelectOAuthToken,
  type InsertOAuthToken,
} from './schema.js';
import { withUserContext } from './rls.util.js';

// Provider constants
export const PROVIDER_DATABRICKS = 'databricks';
export const AUTH_TYPE_PAT = 'pat';

/**
 * Get token by user and provider (with RLS).
 * The token is automatically decrypted by the encryptedText custom type.
 */
export async function getToken(
  userId: string,
  provider: string
): Promise<SelectOAuthToken | null> {
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

/**
 * Get token without RLS (for internal use when user context is already verified).
 * The token is automatically decrypted by the encryptedText custom type.
 */
export async function getTokenDirect(
  userId: string,
  provider: string
): Promise<SelectOAuthToken | null> {
  const result = await db
    .select()
    .from(oauthTokens)
    .where(
      and(eq(oauthTokens.userId, userId), eq(oauthTokens.provider, provider))
    )
    .limit(1);

  return result[0] ?? null;
}

/**
 * Check if token exists for user and provider (with RLS).
 */
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

/**
 * Upsert token (create or update) with RLS.
 * The token is automatically encrypted by the encryptedText custom type.
 *
 * @param userId - User ID
 * @param provider - Provider name (e.g., 'databricks')
 * @param authType - Auth type (e.g., 'pat')
 * @param token - Plaintext token (will be encrypted automatically)
 * @param expiresAt - Optional expiration date
 */
export async function upsertToken(
  userId: string,
  provider: string,
  authType: string,
  token: string,
  expiresAt?: Date | null
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
          accessToken: token, // Encrypted automatically by customType
          expiresAt: expiresAt ?? null,
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
      const newToken: InsertOAuthToken = {
        userId,
        provider,
        authType,
        accessToken: token, // Encrypted automatically by customType
        expiresAt: expiresAt ?? null,
      };
      await db.insert(oauthTokens).values(newToken);
    }
  });
}

/**
 * Delete token (with RLS).
 */
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

// ============================================================================
// Convenience functions for Databricks PAT
// ============================================================================

/**
 * Get Databricks PAT (without RLS - for internal use).
 * Returns the decrypted plaintext token.
 */
export async function getDatabricksPat(userId: string): Promise<string | null> {
  const token = await getTokenDirect(userId, PROVIDER_DATABRICKS);
  return token?.accessToken ?? null;
}

/**
 * Check if Databricks PAT is set (with RLS).
 */
export async function hasDatabricksPat(userId: string): Promise<boolean> {
  return hasToken(userId, PROVIDER_DATABRICKS);
}

/**
 * Set Databricks PAT (with RLS).
 * The PAT is automatically encrypted by the encryptedText custom type.
 *
 * @param userId - User ID
 * @param pat - Plaintext PAT (will be encrypted automatically)
 * @param expiresAt - Optional expiration date
 */
export async function setDatabricksPat(
  userId: string,
  pat: string,
  expiresAt?: Date | null
): Promise<void> {
  return upsertToken(
    userId,
    PROVIDER_DATABRICKS,
    AUTH_TYPE_PAT,
    pat,
    expiresAt
  );
}

/**
 * Delete Databricks PAT (with RLS).
 */
export async function deleteDatabricksPat(userId: string): Promise<void> {
  return deleteToken(userId, PROVIDER_DATABRICKS);
}
