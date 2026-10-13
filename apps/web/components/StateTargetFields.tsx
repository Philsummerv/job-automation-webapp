"use client";

import { useState } from "react";
import { STATE_WORK_SEARCH, US_STATES } from "@jobassistui/shared";

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

// State picker + weekly requirement. Picking a state fills in that state's
// usual weekly number (when it has one) and shows where the number comes
// from. The user can always type a different number.
export default function StateTargetFields({
  initialState,
  initialTarget,
  children,
}: {
  initialState: string;
  initialTarget: number;
  /** The reporting-week select, shown next to the target. */
  children: React.ReactNode;
}) {
  const [state, setState] = useState(initialState);
  const [target, setTarget] = useState(String(initialTarget));
  const rule = state ? STATE_WORK_SEARCH[state] : undefined;

  function pickState(code: string) {
    setState(code);
    const n = STATE_WORK_SEARCH[code]?.perWeek;
    if (n != null) setTarget(String(n));
  }

  return (
    <>
      <div>
        <label htmlFor="state" className="block text-sm font-medium">
          State
        </label>
        <select
          id="state"
          name="state"
          value={state}
          onChange={(e) => pickState(e.target.value)}
          className={inputClass}
        >
          <option value="">Select your state…</option>
          {US_STATES.map(([abbr, name]) => (
            <option key={abbr} value={abbr}>
              {name}
            </option>
          ))}
        </select>
        {rule && (
          <div className="mt-2 border-[1.5px] border-brand bg-paper-field px-3 py-2 text-sm">
            <span className="form-label">Your state&apos;s rule</span>
            <p className="mt-0.5 text-slate-800">{rule.note}</p>
            <p className="mt-1 text-xs text-slate-600">
              Rules change, and your state may give you a different number. Check your own
              letters from the state.{" "}
              <a href={rule.source} target="_blank" rel="noopener noreferrer" className="underline">
                Source{rule.secondary ? " (not an official state page)" : ""}
              </a>
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="weekly_target" className="block text-sm font-medium">
            Weekly activity requirement
          </label>
          <input
            id="weekly_target"
            name="weekly_target"
            type="number"
            min={0}
            max={20}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-slate-500">
            {rule?.perWeek != null
              ? `Filled in from your state. Change it if yours is different.`
              : "Most states require 3 to 5 per week."}
          </p>
        </div>
        {children}
      </div>
    </>
  );
}
