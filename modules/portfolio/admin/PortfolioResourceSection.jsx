'use client';

import DataTable from '@/components/DataTable';
import FormDialog from '@/components/FormDialog';
import { useAdminData } from '@/hooks/useAdminData';
import AdminSectionHeader from '@/components/admin/shared/AdminSectionHeader';
import PortfolioProjectsArrangeTable from '@/modules/portfolio/admin/PortfolioProjectsArrangeTable';
import { cardStyles, contentPadStyles } from '@/modules/system/admin/settingsShared';
import { cn } from '@/lib/utils';

const newestFirst = (items) => {
  const list = Array.isArray(items) ? [...items] : [];

  list.sort((left, right) => {
    const leftDate = Date.parse(left?.createdAt ?? left?.updatedAt ?? '');
    const rightDate = Date.parse(right?.createdAt ?? right?.updatedAt ?? '');
    const leftTime = Number.isFinite(leftDate) ? leftDate : -1;
    const rightTime = Number.isFinite(rightDate) ? rightDate : -1;

    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }

    return Number(right?.id ?? 0) - Number(left?.id ?? 0);
  });

  return list;
};

export default function PortfolioResourceSection({ resource }) {
  const { title, key, fields, listColumns } = resource;
  const {
    items,
    loading,
    saving,
    deletingId,
    editingId,
    editingItem,
    dialogOpen,
    formState,
    setFormState,
    loadItems,
    setDialogOpen,
    openCreate,
    openEdit,
    resetForm,
    handleSubmit,
    handleDelete,
    error,
    fieldErrors,
    clearFieldError,
  } = useAdminData({
    endpoint: resource.endpoint,
    title,
    fields,
  });

  const updateField = (fieldName, value) => {
    setFormState((previous) => ({ ...previous, [fieldName]: value }));
    clearFieldError(fieldName);
  };

  const patchFields = (patch) => {
    if (!patch || typeof patch !== 'object') {
      return;
    }

    setFormState((previous) => ({ ...previous, ...patch }));
    for (const key of Object.keys(patch)) {
      clearFieldError(key);
    }
  };

  const displayItems = ['certificates', 'portfolio', 'skills', 'experience'].includes(key) ? newestFirst(items) : items;

  return (
    <section className={cardStyles}>
      <AdminSectionHeader
        title={title}
        description={`Manage ${title.toLowerCase()} entries, publish state, and metadata.`}
        actions={(
          <>
            <button
              type="button"
              className="h-8 rounded-md px-3 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
              onClick={loadItems}
              disabled={loading}
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
            <button
              type="button"
              className="h-8 rounded-md bg-slate-900 px-3 text-sm text-white dark:bg-slate-100 dark:text-slate-900"
              onClick={openCreate}
            >
              Add {title}
            </button>
            <FormDialog
              title={title}
              resourceKey={key}
              fields={fields}
              formState={formState}
              editingId={editingId}
              editingItem={editingItem}
              saving={saving}
              open={dialogOpen}
              onOpenChange={setDialogOpen}
              onChange={updateField}
              onPatch={patchFields}
              onSubmit={handleSubmit}
              onReset={resetForm}
              error={error}
              fieldErrors={fieldErrors}
            />
          </>
        )}
      />
      <div className={cn(contentPadStyles, 'min-w-0')}>
        {error ? <div className="mb-4 rounded bg-red-100 p-3 text-red-700">{error}</div> : null}
        {key === 'portfolio' ? (
          <PortfolioProjectsArrangeTable
            items={items}
            loading={loading}
            saving={saving}
            deletingId={deletingId}
            onEdit={openEdit}
            onDelete={handleDelete}
            onRefresh={loadItems}
          />
        ) : (
          <DataTable
            title={title}
            listColumns={listColumns}
            items={displayItems}
            loading={loading}
            deletingId={deletingId}
            onEdit={openEdit}
            onDelete={handleDelete}
          />
        )}
      </div>
    </section>
  );
}
