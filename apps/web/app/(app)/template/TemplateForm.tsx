"use client";

import { useState } from "react";
import { TEMPLATE_FIELDS, type AnswerTemplate, type CustomRule } from "@applyassistui/shared";
import { saveTemplate } from "./actions";

const INPUT =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

export function TemplateForm({ template }: { template: AnswerTemplate | null }) {
  const cfg = template?.config ?? {};
  const [rules, setRules] = useState<CustomRule[]>(template?.rules ?? []);

  const setRule = (i: number, key: keyof CustomRule, value: string) =>
    setRules((rs) => rs.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
  const addRule = () => setRules((rs) => [...rs, { match: "", answer: "" }]);
  const removeRule = (i: number) => setRules((rs) => rs.filter((_, j) => j !== i));

  return (
    <form action={saveTemplate} className="mt-6 space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {TEMPLATE_FIELDS.map((f) => (
          <div key={f.key} className={f.type ? "" : "sm:col-span-1"}>
            <label htmlFor={f.key} className="block text-sm font-medium">
              {f.label}
            </label>
            {f.type === "yesno" ? (
              <select id={f.key} name={f.key} defaultValue={cfg[f.key] ?? ""} className={INPUT}>
                <option value="">(default)</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            ) : f.type === "select" ? (
              <select id={f.key} name={f.key} defaultValue={cfg[f.key] ?? ""} className={INPUT}>
                <option value="">(default)</option>
                {(f.options ?? []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={f.key}
                name={f.key}
                defaultValue={cfg[f.key] ?? ""}
                placeholder={f.placeholder}
                className={INPUT}
              />
            )}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-900">Custom question rules</h2>
        <p className="mt-1 text-xs text-slate-500">
          If a question contains … answer … (these take priority over the built-in rules).
        </p>
        <div className="mt-3 space-y-2">
          {rules.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={r.match}
                onChange={(e) => setRule(i, "match", e.target.value)}
                placeholder="if question contains…"
                className={INPUT + " mt-0 flex-1"}
              />
              <input
                value={r.answer}
                onChange={(e) => setRule(i, "answer", e.target.value)}
                placeholder="answer"
                className={INPUT + " mt-0 flex-1"}
              />
              <button
                type="button"
                onClick={() => removeRule(i)}
                aria-label="Remove rule"
                className="rounded-md border border-slate-300 px-2.5 py-2 text-slate-500 hover:bg-slate-50"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addRule}
          className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          + Add rule
        </button>
      </div>

      {/* Rules travel to the server action as a JSON blob maintained by state. */}
      <input type="hidden" name="rules" value={JSON.stringify(rules)} />

      <button
        type="submit"
        className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
      >
        Save template
      </button>
    </form>
  );
}
