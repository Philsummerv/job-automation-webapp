// The answer bubble. Read the constraints before changing anything here.
//
// WHY THIS COMPONENT IS FUSSY: answers get screenshotted and pasted into
// Facebook groups. The person looking at that screenshot never saw the gate,
// never saw the disclaimer bar, and cannot click anything. So everything that
// makes the answer honest has to be *pixels inside this card*.
//
// That means, and each of these has bitten someone somewhere:
//   - No hover:, no title=, no <details>, no tooltip. A screenshot has no cursor.
//   - No line-clamp, no truncate, no "show more". A cut-off source is no source.
//   - The URL renders as PLAIN TEXT, not an <a>. Screenshots keep words and lose
//     links. The clickable link is a separate button, outside the citation line.
//   - text-slate-500, not slate-400. Facebook recompresses images hard and thin
//     grey text turns to mush. Legibility beats subtlety here.
//   - The footer is inside the same card as the quote. If it's a sibling below
//     the card, a crop drops it.
//
// If you are here to "tidy this up", the tidying is the bug.

import type { Answer } from "@/lib/assistant";
import { WATERMARK_HEADER } from "@/lib/assistant";
import type { Source } from "@jobassistui/shared";

function monthYear(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The citation footer. `source` is a REQUIRED, non-nullable prop — that is the
 * invariant "no answer renders without a citation", enforced by the compiler.
 * Callers holding a `Source | null` must narrow before they can render this.
 */
function Citation({ source, phone }: { source: Source; phone: string }) {
  return (
    <div className="mt-3 border-t border-slate-200 pt-2 text-[11px] leading-relaxed text-slate-500">
      <div>
        Source: {source.name} — checked {monthYear(source.verified_on)}
      </div>
      {/* Plain text, deliberately not a link. See the header comment. */}
      <div className="break-all">{source.display}</div>
      {phone ? <div>Confirm at {phone}</div> : null}
    </div>
  );
}

export default function AnswerBubble({ answer }: { answer: Answer }) {
  const isRefusal = answer.kind === "refusal";

  return (
    <div
      className={
        isRefusal
          ? "rounded-xl border border-amber-300 bg-amber-50 p-5"
          : "rounded-xl border border-slate-200 bg-white p-6"
      }
    >
      {/* Watermark line 1 — inside the card, so it lands in the screenshot. */}
      <div className="text-[11px] text-slate-500">{WATERMARK_HEADER}</div>

      <p className="mt-2 whitespace-pre-line text-sm text-slate-800">
        {answer.lead}
      </p>

      {answer.body ? (
        <blockquote className="mt-3 border-l-2 border-slate-300 pl-3 text-sm text-slate-700">
          {answer.body}
        </blockquote>
      ) : null}

      {answer.stale && answer.source ? (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          I last checked this on {monthYear(answer.source.verified_on)}. That&apos;s
          over six months ago and these pages change — confirm it on the source
          page below.
        </p>
      ) : null}

      {/* Narrowing `Source | null` here is what makes the citation guarantee real. */}
      {answer.source ? (
        <Citation source={answer.source} phone={answer.contact.phone} />
      ) : null}

      {answer.contact.url || answer.lookup ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {answer.lookup ? (
            <a
              href={answer.lookup.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-dark"
            >
              {answer.lookup.label} →
            </a>
          ) : answer.contact.url ? (
            <a
              href={answer.contact.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Open the source page →
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
