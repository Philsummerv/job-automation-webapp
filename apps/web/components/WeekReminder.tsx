import Link from "next/link";
import { weekEndShort, type WeekProgress } from "@/lib/week";

// The weekly-requirement reminder shown at the top of every app page. Turns
// red when the week is nearly over and the user is still short.
export default function WeekReminder({ week }: { week: WeekProgress }) {
  if (week.target <= 0) return null;

  const urgent = !week.met && week.daysLeft <= 2;
  const ends = weekEndShort(week.weekEnd);
  const left =
    week.daysLeft === 1 ? "Last day of your week" : `${week.daysLeft} days left (ends ${ends})`;

  return (
    <div
      className={`border-b ${
        urgent ? "border-stamp bg-stamp text-paper" : "border-brand/30 bg-paper-field text-brand"
      }`}
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-sm sm:px-6">
        <span className="font-display text-xs font-bold uppercase tracking-[0.1em]">This week</span>
        <span className="font-mono">
          {week.count} of {week.target} logged
        </span>
        {week.met ? (
          <span className="font-semibold">Target met. You&apos;re set for this week.</span>
        ) : (
          <>
            <span className="font-semibold">
              {week.needed} more needed · {left}
            </span>
            <Link
              href="/jobs"
              className={`ml-auto font-display text-xs font-bold uppercase tracking-wide underline ${
                urgent ? "text-paper" : "text-brand"
              }`}
            >
              Find jobs →
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
