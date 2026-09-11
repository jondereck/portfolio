import { sectionActionsStyles, sectionHeaderStyles, sectionTitleStyles } from '@/modules/system/admin/settingsShared';

export default function AdminSectionHeader({ title, description, actions = null }) {
  return (
    <div className={sectionHeaderStyles}>
      <div className="min-w-0">
        <h2 className={sectionTitleStyles}>{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className={sectionActionsStyles}>{actions}</div> : null}
    </div>
  );
}
