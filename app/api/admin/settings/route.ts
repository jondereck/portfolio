import { NextResponse } from 'next/server';
import { isSuperAdmin } from '@/lib/auth/roles';
import { canAccessAdminModuleAction } from '@/lib/auth/module-access';
import { resolveRequestActor } from '@/lib/auth/session';
import { bumpSessionVersion, getAdminSettings, getAdminSettingsDashboardData, logAdminAuditEvent, updateAdminSettings } from '@/lib/server/admin-settings';
import {
  CloudflareUnclothyWorkerSyncError,
  syncUnclothyWorkerEnabledToCloudflare,
} from '@/lib/server/cloudflare-unclothy-worker';
import { isRateLimited } from '@/lib/server/rate-limit';
import { syncPrimaryProfileContactEmail } from '@/lib/profile/site-data';
import { getNeonAuth } from '@/lib/auth/neon-server';
import { clearAdminSessionCookie } from '@/lib/server/admin-session';
import { integrationsSettingsSchema, securitySettingsSchema } from '@/lib/validators';
import { createFormErrorResponse, createZodFormErrorResponse, mergeFieldErrors } from '@/lib/server/form-responses';
import { formatZodFieldErrors } from '@/lib/server/request-parsing';

type SettingsPayload = {
  integrations?: unknown;
  security?: unknown;
  forceSignOutAllSessions?: unknown;
};

export async function GET(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor) {
    return createFormErrorResponse({ error: 'Unauthorized', errorCode: 'UNAUTHENTICATED' }, 401);
  }
  if (
    !(await canAccessAdminModuleAction(actor.user.role, 'integrations', 'configure')) &&
    !(await canAccessAdminModuleAction(actor.user.role, 'security', 'configure'))
  ) {
    return createFormErrorResponse({ error: 'Forbidden', errorCode: 'FORBIDDEN' }, 403);
  }

  const data = await getAdminSettingsDashboardData();
  if (!isSuperAdmin(actor.user.role)) {
    data.settings.security.roleModuleAccess = undefined as never;
  }
  return NextResponse.json(data);
}

export async function PUT(request: Request) {
  if (await isRateLimited(request, 'admin-mutation', 120, 60_000)) {
    return createFormErrorResponse({ error: 'Too many requests. Try again later.', errorCode: 'RATE_LIMITED' }, 429);
  }

  const actor = await resolveRequestActor(request);
  if (!actor) {
    return createFormErrorResponse({ error: 'Unauthorized', errorCode: 'UNAUTHENTICATED' }, 401);
  }

  try {
    const body = (await request.json()) as SettingsPayload;
    const nextIntegrations = body.integrations
      ? integrationsSettingsSchema.partial().safeParse(body.integrations)
      : null;
    const nextSecurity = body.security ? securitySettingsSchema.partial().safeParse(body.security) : null;
    const forceSignOut = body.forceSignOutAllSessions === true;

    if ((nextIntegrations && !nextIntegrations.success) || (nextSecurity && !nextSecurity.success)) {
      const fieldErrors = mergeFieldErrors(
        nextIntegrations?.success ? undefined : formatZodFieldErrors(nextIntegrations.error, 'integrations'),
        nextSecurity?.success ? undefined : formatZodFieldErrors(nextSecurity.error, 'security'),
      );

      return createFormErrorResponse(
        {
          error: Object.values(fieldErrors)[0]?.[0] || 'Validation failed.',
          errorCode: 'INVALID_SETTINGS_PAYLOAD',
          fieldErrors,
        },
        400,
      );
    }

    if (!nextIntegrations && !nextSecurity && !forceSignOut) {
      return createFormErrorResponse(
        {
          error: 'Choose at least one settings section to update.',
          errorCode: 'EMPTY_SETTINGS_UPDATE',
        },
        400,
      );
    }

    if (nextIntegrations?.data && !(await canAccessAdminModuleAction(actor.user.role, 'integrations', 'configure'))) {
      return createFormErrorResponse({ error: 'Forbidden', errorCode: 'FORBIDDEN' }, 403);
    }

    if (
      nextIntegrations?.data &&
      Object.prototype.hasOwnProperty.call(nextIntegrations.data, 'unclothyGlobalConcurrentGenerationLimit') &&
      !isSuperAdmin(actor.user.role)
    ) {
      return createFormErrorResponse({ error: 'Forbidden', errorCode: 'FORBIDDEN' }, 403);
    }

    if (forceSignOut && !(await canAccessAdminModuleAction(actor.user.role, 'security', 'configure'))) {
      return createFormErrorResponse({ error: 'Forbidden', errorCode: 'FORBIDDEN' }, 403);
    }

    if (nextSecurity?.data) {
      const updatesRoleAccess = Object.prototype.hasOwnProperty.call(nextSecurity.data, 'roleModuleAccess');
      if (updatesRoleAccess && !isSuperAdmin(actor.user.role)) {
        return createFormErrorResponse({ error: 'Forbidden', errorCode: 'FORBIDDEN' }, 403);
      }
      if (!updatesRoleAccess && !(await canAccessAdminModuleAction(actor.user.role, 'security', 'configure'))) {
        return createFormErrorResponse({ error: 'Forbidden', errorCode: 'FORBIDDEN' }, 403);
      }
    }

    if (nextIntegrations?.data && Object.prototype.hasOwnProperty.call(nextIntegrations.data, 'unclothyWorkerEnabled')) {
      const currentSettings = await getAdminSettings({ fresh: true });
      const nextWorkerEnabled = nextIntegrations.data.unclothyWorkerEnabled === true;
      if (currentSettings.integrations.unclothyWorkerEnabled !== nextWorkerEnabled) {
        try {
          const syncResult = await syncUnclothyWorkerEnabledToCloudflare(nextWorkerEnabled);
          console.info(
            JSON.stringify({
              tag: 'unclothy-worker-control',
              event: 'admin-toggle-sync',
              at: new Date().toISOString(),
              actorUserId: actor.user.id,
              previousEnabled: currentSettings.integrations.unclothyWorkerEnabled === true,
              nextEnabled: nextWorkerEnabled,
              scriptName: syncResult.scriptName,
              schedules: syncResult.schedules,
            }),
          );
        } catch (error) {
          if (error instanceof CloudflareUnclothyWorkerSyncError) {
            return createFormErrorResponse(
              {
                error: error.message,
                errorCode: error.errorCode,
                fieldErrors: {
                  'integrations.unclothyWorkerEnabled': [error.message],
                },
              },
              502,
            );
          }
          throw error;
        }
      }
    }

    if (nextIntegrations?.data || nextSecurity?.data) {
      await updateAdminSettings({
        integrations: nextIntegrations?.data,
        security: nextSecurity?.data,
      });

      if (
        nextIntegrations?.data &&
        Object.prototype.hasOwnProperty.call(nextIntegrations.data, 'contactRecipientEmail') &&
        nextIntegrations.data.contactRecipientEmail
      ) {
        await syncPrimaryProfileContactEmail(nextIntegrations.data.contactRecipientEmail);
      }

      await logAdminAuditEvent({
        actorUserId: actor.user.id,
        type: 'settings_updated',
        details: {
          scope: [
            nextIntegrations?.data ? 'integrations' : null,
            nextSecurity?.data ? 'security' : null,
          ].filter(Boolean),
        },
      });
    }

    if (forceSignOut) {
      await bumpSessionVersion({ scope: 'security' });
    }

    const data = await getAdminSettingsDashboardData();
    const response = NextResponse.json(data);

    if (forceSignOut) {
      clearAdminSessionCookie(response);
      const neonAuth = getNeonAuth();
      if (neonAuth) {
        try {
          await neonAuth.signOut();
        } catch {
          // Policy cookie + sessionVersion already invalidate admin access.
        }
      }
    }

    return response;
  } catch (error) {
    console.error('Failed to update admin settings', error);
    if (error instanceof SyntaxError) {
      return createFormErrorResponse({ error: 'Malformed JSON request body.', errorCode: 'MALFORMED_JSON' }, 400);
    }

    if (error instanceof Error && 'issues' in error) {
      return createZodFormErrorResponse(error as never, { errorCode: 'INVALID_SETTINGS_PAYLOAD' });
    }

    return createFormErrorResponse({ error: 'Unable to update admin settings.', errorCode: 'SETTINGS_UPDATE_FAILED' }, 500);
  }
}
