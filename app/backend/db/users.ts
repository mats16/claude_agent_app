import { eq } from 'drizzle-orm';
import { db } from './index.js';
import { users, type User, type NewUser } from './schema.js';

// Create or update a user (upsert)
export async function upsertUser(id: string, email: string): Promise<User> {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (existing.length > 0) {
    // Update email if different
    if (existing[0].email !== email) {
      await db
        .update(users)
        .set({ email, updatedAt: new Date() })
        .where(eq(users.id, id));
      return { ...existing[0], email, updatedAt: new Date() };
    }
    return existing[0];
  }

  // Create new user
  const newUser: NewUser = {
    id,
    email,
  };
  await db.insert(users).values(newUser);

  const created = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  return created[0];
}

// Get user by ID
export async function getUserById(id: string): Promise<User | null> {
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);

  return result[0] ?? null;
}

// Get user by email
export async function getUserByEmail(email: string): Promise<User | null> {
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  return result[0] ?? null;
}
