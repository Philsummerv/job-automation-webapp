"use client";

// Wraps the delete server action in a native confirm() so a stray click
// can't silently remove a compliance-log entry.
export function DeleteEntryForm({
  entryId,
  action,
}: {
  entryId: string;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !window.confirm(
            "Are you sure you want to delete this activity? This can't be undone, and deleted activities no longer count toward your weekly requirement.",
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={entryId} />
      <button type="submit" className="text-xs text-slate-400 hover:text-red-600">
        Delete
      </button>
    </form>
  );
}
