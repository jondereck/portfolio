'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import FormErrorSummary from '@/components/forms/FormErrorSummary';
import { normalizeFormError } from '@/lib/form-client';
import { handleRequest } from '@/lib/handleRequest';
import {
  ADMIN_MODULES,
  CONFIGURABLE_ACCESS_ROLES,
  MODULE_ACCESS_ACTIONS,
  defaultRoleModuleAccess,
  normalizeRoleModuleAccess,
} from '@/lib/auth/module-access-config';

const roleLabels = {
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
};

const actionLabels = {
  view: 'View',
  createUpdate: 'Create/Edit',
  delete: 'Delete',
  configure: 'Configure',
};

const cloneAccess = (value) => JSON.parse(JSON.stringify(normalizeRoleModuleAccess(value)));

export default function RoleModuleAccessMatrix() {
  const [activeRole, setActiveRole] = useState('admin');
  const [access, setAccess] = useState(() => cloneAccess(defaultRoleModuleAccess));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canManage, setCanManage] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      setLoading(true);
      setError('');

      try {
        const response = await fetch('/api/admin/settings', {
          cache: 'no-store',
          signal: controller.signal,
        });

        if (response.status === 403 || response.status === 401) {
          setCanManage(false);
          return;
        }

        if (!response.ok) {
          throw new Error('Unable to load role module access.');
        }

        const payload = await response.json().catch(() => ({}));
        if (!payload?.settings?.security?.roleModuleAccess) {
          setCanManage(false);
          return;
        }

        setAccess(cloneAccess(payload.settings.security.roleModuleAccess));
      } catch (requestError) {
        if (requestError?.name === 'AbortError') return;
        const message = requestError instanceof Error ? requestError.message : 'Unable to load role module access.';
        setError(message);
        toast.error('Unable to load role module access', { description: message });
      } finally {
        setLoading(false);
      }
    };

    void load();

    return () => controller.abort();
  }, []);

  const activeAccess = useMemo(() => access[activeRole] ?? {}, [access, activeRole]);

  const toggleAccess = (moduleId, action) => {
    setAccess((current) => {
      const next = cloneAccess(current);
      next[activeRole][moduleId][action] = !next[activeRole][moduleId][action];

      if (action !== 'view' && next[activeRole][moduleId][action]) {
        next[activeRole][moduleId].view = true;
      }

      if (action === 'view' && !next[activeRole][moduleId].view) {
        MODULE_ACCESS_ACTIONS.forEach((permission) => {
          next[activeRole][moduleId][permission] = false;
        });
      }

      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    setError('');

    try {
      const updatePromise = handleRequest(() =>
        fetch('/api/admin/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            security: {
              roleModuleAccess: access,
            },
          }),
        }),
      );

      toast.promise(updatePromise, {
        loading: 'Saving role access...',
        success: 'Role access updated.',
        error: (requestError) => (requestError instanceof Error ? requestError.message : 'Unable to update role access.'),
      });

      const payload = await updatePromise;
      setAccess(cloneAccess(payload?.settings?.security?.roleModuleAccess));
    } catch (requestError) {
      const nextError = normalizeFormError(requestError, 'Unable to update role access.');
      setError(nextError.formError);
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) {
    return null;
  }

  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Access Control</p>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Role module access</h3>
          <p className="max-w-3xl text-sm text-slate-500 dark:text-slate-400">
            Choose which admin modules each role can view, edit, delete from, or configure. Super admin always keeps full access.
          </p>
        </div>

        <button
          type="button"
          onClick={save}
          disabled={loading || saving}
          className="h-10 rounded-md bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {saving ? 'Saving...' : 'Save access'}
        </button>
      </div>

      <div className="mt-5">
        <FormErrorSummary error={error} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {CONFIGURABLE_ACCESS_ROLES.map((role) => (
          <button
            key={role}
            type="button"
            onClick={() => setActiveRole(role)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              activeRole === role
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {roleLabels[role]}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-5 text-sm text-slate-500">Loading role access...</p>
      ) : (
        <div className="mt-4 min-w-0 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-slate-800">
            <thead>
              <tr className="text-slate-500 dark:text-slate-400">
                <th className="py-3 pr-4 font-medium">Module</th>
                {MODULE_ACCESS_ACTIONS.map((action) => (
                  <th key={action} className="py-3 px-3 text-center font-medium">
                    {actionLabels[action]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {ADMIN_MODULES.map((module) => (
                <tr key={module.id}>
                  <td className="py-3 pr-4">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{module.label}</p>
                    <p className="mt-1 max-w-xl text-xs leading-5 text-slate-500 dark:text-slate-400">{module.description}</p>
                  </td>
                  {MODULE_ACCESS_ACTIONS.map((action) => (
                    <td key={`${module.id}-${action}`} className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={Boolean(activeAccess[module.id]?.[action])}
                        onChange={() => toggleAccess(module.id, action)}
                        className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                        aria-label={`${roleLabels[activeRole]} ${module.label} ${actionLabels[action]}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
