import { requireAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";

// Owner-only product-health dashboard: who signed up and whether they are
// actually using the thing. Reads through the service-role client (bypasses
// RLS) because every other query in the app is deliberately scoped to one user.
export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;
const CHART_DAYS = 14;
// Safety rail so one huge account can't turn this page into a full table scan.
const ROW_CAP = 5000;

type AuthUser = {
  id: string;
  email?: string;
  created_at: string;
  last_sign_in_at?: string | null;
};
type ProfileRow = {
  user_id: string;
  state: string | null;
  disclaimer_accepted_at: string | null;
  subscription_status: string;
};
type EntryRow = { user_id: string; created_at: string; source: string };

function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function relative(iso: string | null | undefined): string {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

export default async function AdminPage() {
  await requireAdmin();
  const svc = createServiceClient();

  const [usersRes, profilesRes, entriesRes] = await Promise.all([
    svc.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    svc
      .from("profiles")
      .select("user_id,state,disclaimer_accepted_at,subscription_status"),
    svc
      .from("activity_log")
      .select("user_id,created_at,source")
      .order("created_at", { ascending: false })
      .limit(ROW_CAP),
  ]);

  const users = (usersRes.data?.users ?? []) as unknown as AuthUser[];
  const profiles = (profilesRes.data ?? []) as ProfileRow[];
  const entries = (entriesRes.data ?? []) as EntryRow[];

  const profileByUser = new Map(profiles.map((p) => [p.user_id, p]));

  // Per-user rollup of the activity log, so the table below is one pass.
  const entryCount = new Map<string, number>();
  const lastEntryAt = new Map<string, string>();
  for (const e of entries) {
    entryCount.set(e.user_id, (entryCount.get(e.user_id) ?? 0) + 1);
    const prev = lastEntryAt.get(e.user_id);
    if (!prev || e.created_at > prev) lastEntryAt.set(e.user_id, e.created_at);
  }

  const now = Date.now();
  const since = (days: number) => now - days * DAY;

  const signups7 = users.filter(
    (u) => new Date(u.created_at).getTime() >= since(7),
  ).length;
  const signups30 = users.filter(
    (u) => new Date(u.created_at).getTime() >= since(30),
  ).length;
  const onboarded = users.filter(
    (u) => profileByUser.get(u.id)?.disclaimer_accepted_at,
  ).length;
  const activated = users.filter((u) => (entryCount.get(u.id) ?? 0) > 0).length;
  const active7 = users.filter((u) => {
    const last = lastEntryAt.get(u.id);
    return last ? new Date(last).getTime() >= since(7) : false;
  }).length;
  const guided = entries.filter((e) => e.source === "guided").length;

  // Signups per day, oldest → newest, for the last CHART_DAYS days (UTC).
  const days: { key: string; count: number }[] = [];
  for (let i = CHART_DAYS - 1; i >= 0; i--) {
    const key = new Date(now - i * DAY).toISOString().slice(0, 10);
    days.push({ key, count: 0 });
  }
  const dayIndex = new Map(days.map((d, i) => [d.key, i]));
  for (const u of users) {
    const i = dayIndex.get(dayKey(u.created_at));
    if (i !== undefined) days[i].count++;
  }

  const rows = [...users]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map((u) => ({
      id: u.id,
      email: u.email ?? "—",
      joined: u.created_at,
      lastSeen: u.last_sign_in_at ?? null,
      entries: entryCount.get(u.id) ?? 0,
      lastEntry: lastEntryAt.get(u.id) ?? null,
      state: profileByUser.get(u.id)?.state ?? null,
      onboarded: Boolean(profileByUser.get(u.id)?.disclaimer_accepted_at),
    }));

  const total = users.length;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="text-xs text-slate-500">
          Live · {new Date().toLocaleString("en-US")}
        </p>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        Who has signed up and whether they&apos;re actually using it. Only you
        can see this page.
      </p>

      {/* Headline numbers. These are counts, not trends — stat tiles, not charts. */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Signups" value={total} sub={`+${signups7} this week`} />
        <Stat label="Onboarded" value={onboarded} sub={pct(onboarded, total)} />
        <Stat label="Logged ≥1" value={activated} sub={pct(activated, total)} />
        <Stat label="Active (7d)" value={active7} sub={pct(active7, total)} />
        <Stat
          label="Activities"
          value={entries.length}
          sub={guided > 0 ? `${guided} guided` : "all self-directed"}
        />
      </div>

      {/* Funnel: one measure across four stages → single hue, magnitude. */}
      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Signup funnel</h2>
        <p className="mt-1 text-xs text-slate-500">
          Where people stop. The gap between &ldquo;Onboarded&rdquo; and
          &ldquo;Logged ≥1&rdquo; is the one that matters — it means they set up
          an account but never got value out of it.
        </p>
        <div className="mt-4 space-y-3">
          <FunnelBar label="Signed up" value={total} max={total} />
          <FunnelBar label="Onboarded" value={onboarded} max={total} />
          <FunnelBar label="Logged ≥1 activity" value={activated} max={total} />
          <FunnelBar label="Active last 7 days" value={active7} max={total} />
        </div>
      </section>

      {/* Change over time → bars, one per day. */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            Signups per day
          </h2>
          <span className="text-xs text-slate-500">
            last {CHART_DAYS} days · {signups30} in 30d
          </span>
        </div>
        <DayChart days={days} />
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white">
        <div className="flex items-baseline justify-between px-5 pt-5">
          <h2 className="text-sm font-semibold text-slate-900">Users</h2>
          <span className="text-xs text-slate-500">newest first</span>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-y border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <Th>Email</Th>
                <Th>Joined</Th>
                <Th>Last sign-in</Th>
                <Th className="text-right">Entries</Th>
                <Th>Last entry</Th>
                <Th>State</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-5 py-2.5 font-medium text-slate-900">
                    {r.email}
                    {!r.onboarded && (
                      <span
                        className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800"
                        title="Signed up but never finished the disclaimer step"
                      >
                        setup incomplete
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">
                    {formatDate(r.joined)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">
                    {relative(r.lastSeen)}
                  </td>
                  <td
                    className={`px-5 py-2.5 text-right tabular-nums ${
                      r.entries === 0 ? "text-slate-400" : "text-slate-900"
                    }`}
                  >
                    {r.entries}
                  </td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">
                    {relative(r.lastEntry)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">
                    {r.state ?? "—"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-slate-500">
                    No signups yet. This fills in as people join.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="px-5 py-3 text-xs text-slate-400">
          Dates are UTC. Activity counts read the most recent {ROW_CAP} log
          entries.
        </p>
      </section>
    </div>
  );
}

function pct(n: number, total: number): string {
  if (!total) return "—";
  return `${Math.round((n / total) * 100)}% of signups`;
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">
        {value}
      </div>
      <div className="mt-0.5 text-xs text-slate-500">{sub}</div>
    </div>
  );
}

function FunnelBar({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const width = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-40 shrink-0 text-xs text-slate-600">{label}</div>
      <div className="h-5 flex-1 rounded bg-slate-100">
        <div
          className="h-5 rounded bg-brand"
          style={{ width: `${width}%` }}
          title={`${label}: ${value}`}
        />
      </div>
      <div className="w-20 shrink-0 text-right text-xs tabular-nums text-slate-900">
        {value}
        {max > 0 && value !== max && (
          <span className="ml-1 text-slate-400">
            {Math.round((value / max) * 100)}%
          </span>
        )}
      </div>
    </div>
  );
}

function DayChart({ days }: { days: { key: string; count: number }[] }) {
  const peak = Math.max(1, ...days.map((d) => d.count));

  return (
    <div className="mt-4">
      <div className="flex h-28 items-end gap-1">
        {days.map((d) => {
          const h = (d.count / peak) * 100;
          return (
            <div
              key={d.key}
              className="group flex flex-1 flex-col items-center justify-end"
              title={`${d.key}: ${d.count} signup${d.count === 1 ? "" : "s"}`}
            >
              {d.count > 0 && (
                <span className="mb-1 text-[11px] tabular-nums text-slate-500">
                  {d.count}
                </span>
              )}
              <div
                className={`w-full rounded-t ${
                  d.count > 0 ? "bg-brand" : "bg-slate-100"
                }`}
                style={{ height: d.count > 0 ? `${Math.max(h, 6)}%` : "3px" }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-slate-400">
        <span>{days[0]?.key.slice(5)}</span>
        <span>{days[days.length - 1]?.key.slice(5)}</span>
      </div>
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <th className={`px-5 py-2 font-medium ${className}`}>{children}</th>;
}
