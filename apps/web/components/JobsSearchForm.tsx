// Plain GET form: the search lives in the URL, so results can be bookmarked
// and the back button works. No client JS needed.
export default function JobsSearchForm({
  query,
  location,
  remoteOnly,
  action = "/jobs",
}: {
  query: string;
  location: string;
  remoteOnly: boolean;
  /** Where the form submits. The public page uses /find-jobs. */
  action?: string;
}) {
  return (
    <form
      action={action}
      method="get"
      className="border-[1.5px] border-brand bg-paper-field p-4"
    >
      <input type="hidden" name="s" value="1" />
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Job title or keywords</span>
          <input
            type="text"
            name="q"
            defaultValue={query}
            maxLength={200}
            placeholder="e.g. customer service, warehouse"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Location</span>
          <input
            type="text"
            name="l"
            defaultValue={location}
            maxLength={100}
            placeholder="e.g. Buffalo, NY"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-brand px-4 py-2 text-sm font-display font-bold uppercase tracking-wide text-paper hover:opacity-90"
        >
          Search
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" name="remote" value="1" defaultChecked={remoteOnly} />
          Remote only
        </label>
        <span className="text-xs text-slate-500">
          Separate different titles with commas. Remote jobs always show.
        </span>
      </div>
    </form>
  );
}
