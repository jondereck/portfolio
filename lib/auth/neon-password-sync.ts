import { hashPassword as hashNeonPassword } from 'better-auth/crypto';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/password/password';

type NeonUserRow = { id: string };
type NeonAccountRow = { id: string };

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

/**
 * Writes a Better Auth–compatible credential password into neon_auth.account.
 * Local admin password resets historically only updated public."User".passwordHash,
 * which Neon Auth email/password login does not read.
 */
export async function syncPasswordToNeonAuth(email: string, password: string) {
  const normalized = normalizeEmail(email);
  if (!normalized || !password) {
    return { synced: false as const, reason: 'INVALID_INPUT' as const };
  }

  const neonUsers = await prisma.$queryRaw<NeonUserRow[]>`
    SELECT id::text AS id
    FROM neon_auth."user"
    WHERE lower(email) = ${normalized}
    LIMIT 1
  `;

  const neonUser = neonUsers[0];
  if (!neonUser?.id) {
    return { synced: false as const, reason: 'NEON_USER_MISSING' as const };
  }

  const hashed = await hashNeonPassword(password);

  const accounts = await prisma.$queryRaw<NeonAccountRow[]>`
    SELECT id::text AS id
    FROM neon_auth.account
    WHERE "userId" = ${neonUser.id}::uuid
      AND "providerId" = 'credential'
    LIMIT 1
  `;

  if (accounts[0]?.id) {
    await prisma.$executeRaw`
      UPDATE neon_auth.account
      SET password = ${hashed},
          "updatedAt" = NOW()
      WHERE id = ${accounts[0].id}::uuid
    `;
  } else {
    await prisma.$executeRaw`
      INSERT INTO neon_auth.account (
        id,
        "accountId",
        "providerId",
        "userId",
        password,
        "createdAt",
        "updatedAt"
      )
      VALUES (
        gen_random_uuid(),
        ${neonUser.id},
        'credential',
        ${neonUser.id}::uuid,
        ${hashed},
        NOW(),
        NOW()
      )
    `;
  }

  return { synced: true as const, neonAuthUserId: neonUser.id };
}

/**
 * If the submitted password matches the legacy local hash, copy it into Neon Auth.
 * Used as a one-time bridge so email/password login works after admin password resets.
 */
export async function migrateLocalPasswordToNeonAuth(email: string, password: string) {
  const normalized = normalizeEmail(email);
  const localUser = await prisma.user.findUnique({
    where: { email: normalized },
    select: {
      passwordHash: true,
    },
  });

  if (!localUser?.passwordHash || !verifyPassword(password, localUser.passwordHash)) {
    return { migrated: false as const, reason: 'LOCAL_PASSWORD_MISMATCH' as const };
  }

  const synced = await syncPasswordToNeonAuth(normalized, password);
  if (!synced.synced) {
    return { migrated: false as const, reason: synced.reason };
  }

  return { migrated: true as const, neonAuthUserId: synced.neonAuthUserId };
}
