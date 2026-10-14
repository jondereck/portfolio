import { collectErrorMessages } from '@/lib/form-client';

export default function FormErrorSummary({ error, fieldErrors, className = '' }) {
  const hasFieldErrors =
    fieldErrors &&
    typeof fieldErrors === 'object' &&
    Object.values(fieldErrors).some((messages) => Array.isArray(messages) && messages.length > 0);
  const messages = collectErrorMessages(error, fieldErrors);

  if (messages.length === 0) {
    return null;
  }

  return (
    <div className={`rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200 ${className}`}>
      <p className="text-sm font-semibold">
        {hasFieldErrors ? 'Please fix the highlighted fields.' : 'Unable to save.'}
      </p>
      <ul className="mt-2 space-y-1 text-sm">
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  );
}
