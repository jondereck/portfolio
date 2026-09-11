import type { Profile, UserRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { writeAuditEvent } from '@/lib/audit/audit';
import { syncPasswordToNeonAuth } from '@/lib/auth/neon-password-sync';
import { ensureUserProfile } from '@/lib/auth/user-profiles';
import { hashPassword } from '@/lib/password/password';
import {
  UNCLOTHY_CONCURRENT_LIMIT_MAX,
  UNCLOTHY_MONTHLY_LIMIT_MAX,
  buildUnclothyUsageSummary,
  getUnclothyQuotaPeriod,
  getUnclothyUsageCountsByUserIds,
  normalizeUnclothyConcurrentLimit,
  normalizeUnclothyMonthlyLimit,
} from '@/lib/server/unclothy-limits';

export const MANAGEABLE_ROLES: UserRole[] = ['admin', 'editor', 'viewer'];
export const REGISTRATION_DEFAULT_ROLE: UserRole = 'viewer';

export type ManagedUserStatus = 'pending' | 'active' | 'suspended';

type ManagedUserRecord = {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
  isActive: boolean;
  unclothyMonthlyGenerationLimit: number;
  unclothyConcurrentGenerationLimit: number;
  emailVerified: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  profile: Pick<Profile, 'id' | 'slug' | 'displayName'> | null;
};

function deriveManagedStatus(user: Pick<ManagedUserRecord, 'isActive' | 'emailVerified' | 'role'>): ManagedUserStatus {
  if (user.role === 'super_admin') {
    return user.isActive ? 'active' : 'suspended';
  }
  if (!user.emailVerified) return 'pending';
  return user.isActive ? 'active' : 'suspended';
}

function assertManageableRole(role: string): asserts role is UserRole {
  if (!MANAGEABLE_ROLES.includes(role as UserRole)) {
    throw new Error('INVALID_ROLE');
  }
}

function mapManagedUser(
  user: ManagedUserRecord,
  unclothyUsage?: ReturnType<typeof buildUnclothyUsageSummary>,
) {
  const status = deriveManagedStatus(user);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status,
    isActive: user.isActive,
    emailVerified: user.emailVerified,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    profile: user.profile,
    unclothyMonthlyGenerationLimit: normalizeUnclothyMonthlyLimit(user.unclothyMonthlyGenerationLimit),
    unclothyConcurrentGenerationLimit: normalizeUnclothyConcurrentLimit(user.unclothyConcurrentGenerationLimit),
    unclothyUsage: unclothyUsage ?? buildUnclothyUsageSummary(user, undefined),
    canTransferSuperAdmin: status === 'active' && user.role !== 'super_admin',
  };
}

async function getManagedUserOrThrow(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: {
        select: {
          id: true,
          slug: true,
          displayName: true,
        },
      },
    },
  });

  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }

  return user;
}

export async function listManagedUsers() {
  const users = await prisma.user.findMany({
    orderBy: [{ createdAt: 'asc' }],
    include: {
      profile: {
        select: {
          id: true,
          slug: true,
          displayName: true,
        },
      },
    },
  });

  const period = getUnclothyQuotaPeriod();
  const usage = await getUnclothyUsageCountsByUserIds(users.map((user) => user.id), period);

  return users.map((user) => mapManagedUser(user, buildUnclothyUsageSummary(user, usage.get(user.id), period)));
}

export async function registerPendingUser(input: {
  name: string;
  email: string;
  password: string;
}) {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (!name || !email || !password) {
    throw new Error('INVALID_INPUT');
  }

  const passwordHash = hashPassword(password);
  const existing = await prisma.user.findUnique({
    where: { email },
    include: { profile: true },
  });

  if (existing?.role === 'super_admin' || existing?.emailVerified || existing?.isActive) {
    throw new Error('ACCOUNT_EXISTS');
  }

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          name,
          role: REGISTRATION_DEFAULT_ROLE,
          isActive: false,
          emailVerified: null,
          passwordHash,
        },
      })
    : await prisma.user.create({
        data: {
          name,
          email,
          role: REGISTRATION_DEFAULT_ROLE,
          isActive: false,
          emailVerified: null,
          passwordHash,
        },
      });

  const profile = await ensureUserProfile(prisma, user.id, name, name || email.split('@')[0] || email);

  await writeAuditEvent({
    actorUserId: user.id,
    targetProfileId: profile.id,
    action: existing ? 'signup_request_updated' : 'signup_requested',
    targetType: 'user',
    targetId: user.id,
    metadata: { email, role: REGISTRATION_DEFAULT_ROLE },
  });

  return mapManagedUser({
    ...user,
    profile,
  });
}

export async function createManagedUser(input: {
  actorUserId: string;
  name: string;
  email: string;
  password: string;
  role: string;
  activateNow?: boolean;
}) {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const activateNow = input.activateNow !== false;

  if (!name || !email || !password) {
    throw new Error('INVALID_INPUT');
  }

  assertManageableRole(input.role.trim());
  const role = input.role.trim() as UserRole;

  const existing = await prisma.user.findUnique({
    where: { email },
  });

  if (existing) {
    throw new Error('ACCOUNT_EXISTS');
  }

  const passwordHash = hashPassword(password);
  const now = activateNow ? new Date() : null;

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role,
      isActive: activateNow,
      emailVerified: now,
    },
  });

  const profile = await ensureUserProfile(prisma, user.id, name, name || email.split('@')[0] || email);

  // If this email already exists in Neon Auth (e.g. Google signup), keep credential password synced.
  await syncPasswordToNeonAuth(email, password);

  await writeAuditEvent({
    actorUserId: input.actorUserId,
    targetProfileId: profile.id,
    action: activateNow ? 'user_created' : 'user_created_pending',
    targetType: 'user',
    targetId: user.id,
    metadata: { email, role },
  });

  return mapManagedUser({
    ...user,
    profile,
  });
}

export async function approveManagedUser(input: {
  actorUserId: string;
  userId: string;
  role?: string;
}) {
  const user = await getManagedUserOrThrow(input.userId);
  if (user.role === 'super_admin') {
    throw new Error('SUPER_ADMIN_LOCKED');
  }

  const nextRole = input.role?.trim();
  if (nextRole) {
    assertManageableRole(nextRole);
  }

  const approved = await prisma.user.update({
    where: { id: user.id },
    data: {
      role: (nextRole as UserRole | undefined) ?? user.role,
      isActive: true,
      emailVerified: user.emailVerified ?? new Date(),
    },
    include: {
      profile: {
        select: {
          id: true,
          slug: true,
          displayName: true,
        },
      },
    },
  });

  await writeAuditEvent({
    actorUserId: input.actorUserId,
    targetProfileId: approved.profile?.id ?? null,
    action: 'user_approved',
    targetType: 'user',
    targetId: approved.id,
    metadata: { role: approved.role },
  });

  return mapManagedUser(approved);
}

export async function rejectManagedUser(input: {
  actorUserId: string;
  userId: string;
}) {
  const user = await getManagedUserOrThrow(input.userId);
  if (user.role === 'super_admin') {
    throw new Error('SUPER_ADMIN_LOCKED');
  }
  if (deriveManagedStatus(user) !== 'pending') {
    throw new Error('NOT_PENDING');
  }

  await prisma.user.delete({
    where: { id: user.id },
  });

  await writeAuditEvent({
    actorUserId: input.actorUserId,
    targetProfileId: user.profile?.id ?? null,
    action: 'user_rejected',
    targetType: 'user',
    targetId: user.id,
    metadata: { email: user.email },
  });
}

export async function setManagedUserActive(input: {
  actorUserId: string;
  userId: string;
  isActive: boolean;
}) {
  const user = await getManagedUserOrThrow(input.userId);
  if (user.role === 'super_admin') {
    throw new Error('SUPER_ADMIN_LOCKED');
  }
  if (!user.emailVerified) {
    throw new Error('NOT_APPROVED');
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      isActive: input.isActive,
    },
    include: {
      profile: {
        select: {
          id: true,
          slug: true,
          displayName: true,
        },
      },
    },
  });

  await writeAuditEvent({
    actorUserId: input.actorUserId,
    targetProfileId: updated.profile?.id ?? null,
    action: input.isActive ? 'user_reactivated' : 'user_suspended',
    targetType: 'user',
    targetId: updated.id,
    metadata: { email: updated.email },
  });

  return mapManagedUser(updated);
}

export async function changeManagedUserRole(input: {
  actorUserId: string;
  userId: string;
  role: string;
}) {
  const user = await getManagedUserOrThrow(input.userId);
  if (user.role === 'super_admin') {
    throw new Error('SUPER_ADMIN_LOCKED');
  }

  assertManageableRole(input.role.trim());
  const role = input.role.trim() as UserRole;

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { role },
    include: {
      profile: {
        select: {
          id: true,
          slug: true,
          displayName: true,
        },
      },
    },
  });

  await writeAuditEvent({
    actorUserId: input.actorUserId,
    targetProfileId: updated.profile?.id ?? null,
    action: 'user_role_changed',
    targetType: 'user',
    targetId: updated.id,
    metadata: { role },
  });

  return mapManagedUser(updated);
}

export async function updateManagedUserUnclothyLimits(input: {
  actorUserId: string;
  userId: string;
  monthlyGenerationLimit: number;
  concurrentGenerationLimit: number;
}) {
  const user = await getManagedUserOrThrow(input.userId);
  if (user.role === 'super_admin') {
    throw new Error('SUPER_ADMIN_LOCKED');
  }

  if (
    !Number.isInteger(input.monthlyGenerationLimit) ||
    input.monthlyGenerationLimit < 0 ||
    input.monthlyGenerationLimit > UNCLOTHY_MONTHLY_LIMIT_MAX ||
    !Number.isInteger(input.concurrentGenerationLimit) ||
    input.concurrentGenerationLimit < 1 ||
    input.concurrentGenerationLimit > UNCLOTHY_CONCURRENT_LIMIT_MAX
  ) {
    throw new Error('UNCLOTHY_INVALID_LIMITS');
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      unclothyMonthlyGenerationLimit: input.monthlyGenerationLimit,
      unclothyConcurrentGenerationLimit: input.concurrentGenerationLimit,
    },
    include: {
      profile: {
        select: {
          id: true,
          slug: true,
          displayName: true,
        },
      },
    },
  });

  await writeAuditEvent({
    actorUserId: input.actorUserId,
    targetProfileId: updated.profile?.id ?? null,
    action: 'user_unclothy_limits_changed',
    targetType: 'user',
    targetId: updated.id,
    metadata: {
      monthlyGenerationLimit: input.monthlyGenerationLimit,
      concurrentGenerationLimit: input.concurrentGenerationLimit,
    },
  });

  return mapManagedUser(updated);
}

export async function resetManagedUserPassword(input: {
  actorUserId: string;
  userId: string;
  password: string;
}) {
  const user = await getManagedUserOrThrow(input.userId);
  const passwordHash = hashPassword(input.password);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
    },
    include: {
      profile: {
        select: {
          id: true,
          slug: true,
          displayName: true,
        },
      },
    },
  });

  // Admin login uses Neon Auth email/password, not the local NextAuth hash.
  // Keep neon_auth.account.credential in sync so email sign-in works immediately.
  const neonSync = await syncPasswordToNeonAuth(updated.email, input.password);

  await prisma.session.deleteMany({
    where: { userId: user.id },
  });

  await writeAuditEvent({
    actorUserId: input.actorUserId,
    targetProfileId: updated.profile?.id ?? null,
    action: 'user_password_reset',
    targetType: 'user',
    targetId: updated.id,
    metadata: {
      email: updated.email,
      neonPasswordSynced: neonSync.synced,
      neonPasswordSyncReason: neonSync.synced ? undefined : neonSync.reason,
    },
  });

  return mapManagedUser(updated);
}

export async function transferSuperAdmin(input: {
  actorUserId: string;
  targetUserId: string;
}) {
  if (input.actorUserId === input.targetUserId) {
    throw new Error('ALREADY_SUPER_ADMIN');
  }

  const target = await getManagedUserOrThrow(input.targetUserId);
  if (deriveManagedStatus(target) !== 'active') {
    throw new Error('TARGET_NOT_ACTIVE');
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: input.actorUserId },
      data: { role: 'admin' },
    });

    const promoted = await tx.user.update({
      where: { id: input.targetUserId },
      data: {
        role: 'super_admin',
        isActive: true,
        emailVerified: target.emailVerified ?? new Date(),
      },
      include: {
        profile: {
          select: {
            id: true,
            slug: true,
            displayName: true,
          },
        },
      },
    });

    await tx.session.deleteMany({
      where: { userId: input.actorUserId },
    });

    return promoted;
  });

  await writeAuditEvent({
    actorUserId: input.actorUserId,
    targetProfileId: result.profile?.id ?? null,
    action: 'super_admin_transferred',
    targetType: 'user',
    targetId: result.id,
    metadata: { email: result.email },
  });

  return mapManagedUser(result);
}
