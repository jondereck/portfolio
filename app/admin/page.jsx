import AdminDashboardShortcuts from '@/components/admin/dashboard/AdminDashboardShortcuts';
import { ADMIN_ROLES } from '@/lib/auth/roles';
import { requirePageRole } from '@/lib/auth/session';
import { getEffectiveRoleModuleAccess } from '@/lib/auth/module-access';

export default async function AdminDashboardPage() {
  const actor = await requirePageRole(ADMIN_ROLES);
  const moduleAccess = await getEffectiveRoleModuleAccess(actor.user.role);

  return (
    <div className="space-y-4">
      <AdminDashboardShortcuts moduleAccess={moduleAccess} />

      <section id="future-modules" className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
        <h3 className="text-lg font-semibold">Future Modules</h3>
        <p className="mt-1.5 text-sm text-slate-500">
          This structure is ready for additional domains such as blog, testimonials, services, and bookings.
        </p>
      </section>
    </div>
  );
}
