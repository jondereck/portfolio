'use client';

import FieldErrorText from '@/components/forms/FieldErrorText';
import FormErrorSummary from '@/components/forms/FormErrorSummary';
import AdminBusyButton from '@/components/admin/shared/AdminBusyButton';
import CertificateAssetUpload from '@/components/CertificateAssetUpload';
import ImageUpload from '@/components/ImageUpload';

function FieldInput({ resourceKey, field, value, onChange, onPatch, fieldError }) {
  const hasError = Boolean(fieldError);
  const inputClassName = `h-10 rounded-md border bg-white px-3 text-sm dark:bg-slate-950 ${
    hasError ? 'border-rose-400 focus:border-rose-500 dark:border-rose-500' : 'border-slate-300 dark:border-slate-700'
  }`;

  if (field.type === 'string-array') {
    const items = Array.isArray(value) ? value : [];

    const updateItem = (index, nextValue) => {
      onChange(items.map((item, idx) => (idx === index ? nextValue : item)));
    };

    const addItem = () => {
      onChange([...items, '']);
    };

    const removeItem = (index) => {
      onChange(items.filter((_, idx) => idx !== index));
    };

    return (
      <div
        className={`md:col-span-2 space-y-3 rounded-xl border bg-slate-50 p-4 dark:bg-slate-900/40 ${
          hasError ? 'border-rose-300 dark:border-rose-500/40' : 'border-slate-200 dark:border-slate-800'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{field.label}</span>
          <button
            type="button"
            onClick={addItem}
            className="h-8 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Add Description
          </button>
        </div>

        <div className="space-y-2">
          {items.length === 0 ? <p className="text-xs text-slate-500">No description bullets yet.</p> : null}
          {items.map((item, index) => (
            <div key={`${field.name}-${index}`} className="flex items-center gap-2">
              <input
                id={`${resourceKey}-${field.name}-${index}`}
                type="text"
                value={item ?? ''}
                onChange={(event) => updateItem(index, event.target.value)}
                placeholder={`Description ${index + 1}`}
                aria-invalid={hasError}
                className={`h-10 flex-1 rounded-md border bg-white px-3 text-sm dark:bg-slate-950 ${
                  hasError ? 'border-rose-400 dark:border-rose-500' : 'border-slate-300 dark:border-slate-700'
                }`}
              />
              <button
                type="button"
                onClick={() => removeItem(index)}
                className="h-10 rounded-md border border-rose-200 px-3 text-xs font-medium text-rose-600 transition hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-500/10"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
        <FieldErrorText error={fieldError} />
        {field.helperText ? <span className="block text-xs text-slate-500">{field.helperText}</span> : null}
      </div>
    );
  }

  if (field.type === 'checkbox') {
    return (
      <div className="md:col-span-2 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/40">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{field.label}</span>
        <input
          id={`${resourceKey}-${field.name}`}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          aria-invalid={hasError}
        />
      </div>
    );
  }

  const colSpan = field.type === 'textarea' ? 'md:col-span-2' : '';

  if (field.type === 'image') {
    if (resourceKey === 'certificates' && field.name === 'image') {
      return (
        <div
          className={`md:col-span-2 rounded-xl border bg-slate-50 p-4 dark:bg-slate-900/50 ${
            hasError ? 'border-rose-300 dark:border-rose-500/40' : 'border-slate-200 dark:border-slate-800'
          }`}
        >
          <CertificateAssetUpload
            id={`${resourceKey}-${field.name}`}
            label={field.label}
            value={typeof value === 'string' ? value : ''}
            onApply={(patch) => onPatch?.(patch)}
          />
          <FieldErrorText error={fieldError} />
          {field.helperText ? <span className="mt-2 block text-xs text-slate-500">{field.helperText}</span> : null}
        </div>
      );
    }

    return (
      <div
        className={`md:col-span-2 rounded-xl border bg-slate-50 p-4 dark:bg-slate-900/50 ${
          hasError ? 'border-rose-300 dark:border-rose-500/40' : 'border-slate-200 dark:border-slate-800'
        }`}
      >
        <ImageUpload
          id={`${resourceKey}-${field.name}`}
          label={field.label}
          value={typeof value === 'string' ? value : ''}
          onChange={(url) => onChange(url)}
        />
        <FieldErrorText error={fieldError} />
        {field.helperText ? <span className="mt-2 block text-xs text-slate-500">{field.helperText}</span> : null}
      </div>
    );
  }

  return (
    <label className={`flex flex-col space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200 ${colSpan}`}>
      {field.label}
      {field.type === 'textarea' ? (
        <textarea
          id={`${resourceKey}-${field.name}`}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          required={field.required !== false}
          rows={field.rows || 3}
          aria-invalid={hasError}
          className={`rounded-md border bg-white px-3 py-2 text-sm dark:bg-slate-950 ${
            hasError ? 'border-rose-400 dark:border-rose-500' : 'border-slate-300 dark:border-slate-700'
          }`}
        />
      ) : (
        <input
          id={`${resourceKey}-${field.name}`}
          type={field.type}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          required={field.required !== false}
          aria-invalid={hasError}
          className={inputClassName}
        />
      )}
      <FieldErrorText error={fieldError} />
      {field.helperText ? <span className="text-xs text-slate-500">{field.helperText}</span> : null}
    </label>
  );
}

export default function FormDialog({
  title,
  resourceKey,
  fields,
  formState,
  editingId,
  saving,
  open,
  onOpenChange,
  onChange,
  onPatch,
  onSubmit,
  onReset,
  error = '',
  fieldErrors = {},
}) {
  const isEditing = editingId !== null;

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:items-center sm:p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white p-6 dark:bg-slate-900">
            <h3 className="text-lg font-semibold">{isEditing ? `Edit ${title}` : `Create ${title}`}</h3>
            <p className="mt-1 text-sm text-slate-500">Update fields and save to publish changes in the admin API.</p>
            <form onSubmit={onSubmit} className="mt-4 flex min-h-0 flex-1 flex-col">
              <FormErrorSummary error={error} fieldErrors={fieldErrors} />
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="grid gap-4 md:grid-cols-2">
                  {fields.map((field) => (
                    <FieldInput
                      key={field.name}
                      resourceKey={resourceKey}
                      field={field}
                      value={formState[field.name]}
                      onChange={(value) => onChange(field.name, value)}
                      onPatch={onPatch}
                      fieldError={fieldErrors[field.name]?.[0]}
                    />
                  ))}
                </div>
              </div>
              <div className="mt-4 flex shrink-0 justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  className="h-9 rounded-md px-3 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                  onClick={() => {
                    onReset();
                    onOpenChange(false);
                  }}
                >
                  Cancel
                </button>
                <AdminBusyButton
                  type="submit"
                  loading={saving}
                  label={isEditing ? 'Update Entry' : 'Create Entry'}
                  busyLabel="Saving…"
                />
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
