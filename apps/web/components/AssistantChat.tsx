"use client";

// The guided funnel: gate -> state -> situation -> exemptions -> topic -> answer.
//
// Client state machine rather than the repo's usual server-action-and-redirect,
// because this is a thread and a redirect would lose it. Plain useState, no
// reducer and no library, following LoginForm.tsx.
//
// Disclaimer placements 1 and 2 live here (the gate and the persistent bar).
// Placement 3 — the in-bubble watermark — is in AnswerBubble.tsx.

import { useEffect, useState } from "react";
import AnswerBubble from "./AnswerBubble";
import { DISCLAIMER_BAR, type Answer } from "@/lib/assistant";
import { TOPICS, type TopicKey } from "@jobassistui/shared";

type Step = "gate" | "state" | "situation" | "exemptions" | "topic" | "answer";

const SITUATIONS = [
  { value: "filing_weekly", label: "I'm filing weekly and looking for work" },
  { value: "part_time", label: "I'm working part-time or reduced hours" },
  { value: "recall_date", label: "I have a date to return to my old job" },
  { value: "union_hall", label: "I get work through a union hiring hall" },
  { value: "approved_training", label: "I'm in a training program the state approved" },
  { value: "just_filed", label: "I just filed and haven't certified yet" },
  { value: "unsure", label: "I'm not sure" },
] as const;

// Each of these can change or remove the work-search requirement in many states.
// Checking one never produces a number — see ExemptionCaution below.
const EXEMPTIONS = [
  { value: "recall", label: "I have a definite return-to-work date from my employer" },
  { value: "union", label: "I get all my work through a union hiring hall and I'm in good standing" },
  { value: "training", label: "I'm enrolled in training the state approved" },
  { value: "shared_work", label: "I'm in a shared-work or work-share program" },
  { value: "temp_layoff", label: "I'm on a temporary layoff my employer reported to the state" },
] as const;

const GATE_KEY = "jaui.assistantGate";

export default function AssistantChat({
  defaultState,
  states,
  checkedStates,
}: {
  defaultState: string | null;
  states: readonly (readonly [string, string])[];
  checkedStates: string[];
}) {
  // Defaults to NOT accepted, and only the effect can flip it true. So the
  // server HTML always contains the gate: the failure mode is "shown twice",
  // never "skipped". This is BetaBar's hydration trick, inverted on purpose.
  const [gateAccepted, setGateAccepted] = useState(false);
  const [step, setStep] = useState<Step>("gate");
  const [state, setState] = useState(defaultState ?? "");
  const [situation, setSituation] = useState<string>("");
  const [exemptions, setExemptions] = useState<string[]>([]);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(GATE_KEY) === "1") {
        setGateAccepted(true);
        setStep("state");
      }
    } catch {
      // Private mode / storage blocked. Showing the gate again is the safe miss.
    }
  }, []);

  function acceptGate() {
    try {
      sessionStorage.setItem(GATE_KEY, "1");
    } catch {
      /* non-fatal */
    }
    setGateAccepted(true);
    setStep("state");
  }

  async function ask(topic: TopicKey) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/assistant/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state, topic, situation, exemptions }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError("Something went wrong on my end. Try again in a moment.");
      } else {
        setAnswer(json.answer as Answer);
        setStep("answer");
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  const stateIsChecked = checkedStates.includes(state);
  const stateName = states.find((s) => s[0] === state)?.[1] ?? state;

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="space-y-4 p-6">
        {/* ─── Disclaimer placement 1: the gate ─── */}
        {!gateAccepted || step === "gate" ? (
          <div className="space-y-3">
            <h2 className="text-base font-semibold text-slate-900">Read this first.</h2>
            <div className="space-y-2 text-sm text-slate-700">
              <p>
                I&apos;m a helper for finding your state&apos;s job-search rules.
                I&apos;m not a lawyer and I&apos;m not the unemployment office.
              </p>
              <p>
                Everything I tell you comes from your state&apos;s own published
                pages, and I&apos;ll always show you the link so you can check it
                yourself. Rules change, and I might be out of date.
              </p>
              <p>
                For anything about your own claim — whether you qualify, how much
                you get, a letter you were sent — call your state office. I
                can&apos;t help with that and I won&apos;t try.
              </p>
            </div>
            <button
              type="button"
              onClick={acceptGate}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
            >
              Got it
            </button>
          </div>
        ) : null}

        {/* ─── Step 1: state ─── */}
        {gateAccepted && step === "state" ? (
          <div className="space-y-3">
            <label htmlFor="assistant-state" className="block text-sm font-medium text-slate-900">
              Which state are you filing in?
            </label>
            <select
              id="assistant-state"
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="">Choose your state…</option>
              {states.map(([abbr, name]) => (
                <option key={abbr} value={abbr}>
                  {name}
                </option>
              ))}
            </select>
            {state ? (
              <p className="text-xs text-slate-600">
                {stateIsChecked
                  ? `I've read ${stateName}'s work search page and can quote it.`
                  : `I haven't checked ${stateName} yet — I can still give you their official page and phone number.`}
              </p>
            ) : null}
            <button
              type="button"
              disabled={!state}
              onClick={() => setStep("situation")}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-40"
            >
              Next
            </button>
          </div>
        ) : null}

        {/* ─── Step 2: situation ─── */}
        {step === "situation" ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-900">
              Where are you in the process?
            </p>
            <div className="space-y-2">
              {SITUATIONS.map((s) => (
                <label
                  key={s.value}
                  className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <input
                    type="radio"
                    name="situation"
                    value={s.value}
                    checked={situation === s.value}
                    onChange={() => setSituation(s.value)}
                    className="mt-0.5"
                  />
                  <span>{s.label}</span>
                </label>
              ))}
            </div>
            <button
              type="button"
              disabled={!situation}
              onClick={() => setStep("exemptions")}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-40"
            >
              Next
            </button>
          </div>
        ) : null}

        {/* ─── Step 3: exemptions ─── */}
        {step === "exemptions" ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-900">
              Does any of this apply to you?
            </p>
            <p className="text-xs text-slate-600">
              Some states change or remove the work search requirement in these
              cases. Tick anything that&apos;s true — or none of them.
            </p>
            <div className="space-y-2">
              {EXEMPTIONS.map((e) => (
                <label
                  key={e.value}
                  className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={exemptions.includes(e.value)}
                    onChange={(ev) =>
                      setExemptions((prev) =>
                        ev.target.checked
                          ? [...prev, e.value]
                          : prev.filter((x) => x !== e.value),
                      )
                    }
                    className="mt-0.5"
                  />
                  <span>{e.label}</span>
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setStep("topic")}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
            >
              {exemptions.length ? "Next" : "None of these"}
            </button>
          </div>
        ) : null}

        {/* ─── Step 4: topic ─── */}
        {step === "topic" ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-900">
              What do you want to know?
            </p>
            <div className="space-y-2">
              {TOPICS.filter((t) => t.lane === "official").map((t) => (
                <button
                  key={t.value}
                  type="button"
                  disabled={loading}
                  onClick={() => ask(t.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-left text-sm text-slate-700 hover:border-brand hover:bg-slate-50 disabled:opacity-40"
                >
                  {t.label}
                </button>
              ))}
            </div>
            {loading ? <p className="text-xs text-slate-500">Looking that up…</p> : null}
            {error ? <p className="text-xs text-red-600">{error}</p> : null}
          </div>
        ) : null}

        {/* ─── Step 5: the answer ─── */}
        {step === "answer" && answer ? (
          <div className="space-y-4">
            {exemptions.length > 0 ? <ExemptionCaution /> : null}
            <AnswerBubble answer={answer} />
            <button
              type="button"
              onClick={() => {
                setAnswer(null);
                setStep("topic");
              }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Ask something else
            </button>
          </div>
        ) : null}
      </div>

      {/* ─── Disclaimer placement 2: the persistent bar ─── */}
      {/* Static, never dismissible, no state. Do not make this collapsible. */}
      <div className="border-t border-slate-200 bg-slate-50 px-6 py-2 text-xs text-slate-600">
        {DISCLAIMER_BAR}
      </div>
    </div>
  );
}

/**
 * Shown whenever the user ticked an exemption box. The rule this enforces: the
 * assistant NEVER tells someone they are exempt. Telling a non-exempt person
 * they can skip a week costs them a week of benefits.
 */
function ExemptionCaution() {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-medium">Only your state can confirm an exemption applies to you.</p>
      <p className="mt-1">
        You ticked something that changes the work search rule in some states. I
        can&apos;t tell you whether it applies to your claim — call your state
        office and ask before you skip a week.
      </p>
    </div>
  );
}
