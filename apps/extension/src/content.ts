// Content script. As of M-B2 it plays two roles:
//   1. A worker-driven EXECUTOR — it receives typed commands (scan/fill/review/
//      advance) from the run controller and reports results back, closing the
//      state-machine loop. This is the path that will ship.
//   2. The POC panel — manual Scan/Fill/Continue buttons plus a live log, kept
//      as a debugging affordance. M-B5 replaces this with the real review gate.
//
// Reuses the ported automation cores directly (the code-sharing proof):
//   collectFormQuestions — the same DOM scraper Playwright injects
//   makeAutoFillAnswer   — the ordered auto-fill rule engine
//
// Stage-B-specific here (productionized further in M-B4/M-B5):
//   fillFieldDom  — DOM-native fill using React-safe native value setters
//   findAdvanceDom — visible-first Continue/Submit finder
//
// NOTE(M-B4): fills still use DEFAULT_CONFIG; the user's answer template
// replaces it in M-B4. NOTE(M-B5): the review command shows a placeholder
// approve/reject bar, not the real per-page review gate.

import { collectFormQuestions } from "@applyassistui/automation/forms";
import { makeAutoFillAnswer } from "@applyassistui/automation/autofill";
import { DEFAULT_CONFIG } from "@applyassistui/automation/config";
import type { FormField } from "@applyassistui/automation/types";
import { sendToWorker } from "./messages";
import type { ContentBoundMsg, ReviewDecisionMsg } from "./messages";

// Only mount where it makes sense: the top frame, or any child frame that
// actually contains a form (Indeed sometimes iframes the apply flow).
const isTop = window.self === window.top;
const hasForm = !!document.querySelector("form, fieldset, [class*='application']");
if (isTop || hasForm) init();

function init() {
  const getAutoFillAnswer = makeAutoFillAnswer(DEFAULT_CONFIG);
  let questions: FormField[] = [];
  // The run this frame is currently serving; learned from the first command.
  let currentRunId: string | null = null;

  // ─── Panel ────────────────────────────────────────────────────────────────

  const panel = document.createElement("div");
  panel.id = "aaui-poc-panel";
  panel.style.cssText = [
    "position:fixed", "top:12px", "right:12px", "z-index:2147483647",
    "width:340px", "max-height:80vh", "overflow:auto",
    "background:#0f172a", "color:#e2e8f0", "border-radius:10px",
    "font:12px/1.45 system-ui,sans-serif", "padding:10px",
    "box-shadow:0 8px 30px rgba(0,0,0,.45)",
  ].join(";");
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <strong style="font-size:13px">ApplyAssistUI</strong>
      <span style="opacity:.6">${isTop ? "top frame" : "iframe"}</span>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:6px">
      <button id="aaui-start" style="flex:1;padding:6px;border:0;border-radius:6px;background:#7c3aed;color:#fff;cursor:pointer">Start run</button>
      <button id="aaui-cancel" style="flex:1;padding:6px;border:0;border-radius:6px;background:#475569;color:#fff;cursor:pointer">Cancel</button>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:8px">
      <button id="aaui-scan"  style="flex:1;padding:6px;border:0;border-radius:6px;background:#2563eb;color:#fff;cursor:pointer">Scan</button>
      <button id="aaui-fill"  style="flex:1;padding:6px;border:0;border-radius:6px;background:#059669;color:#fff;cursor:pointer">Fill</button>
      <button id="aaui-next"  style="flex:1;padding:6px;border:0;border-radius:6px;background:#d97706;color:#fff;cursor:pointer">Continue</button>
    </div>
    <div id="aaui-review"></div>
    <div id="aaui-fields"></div>
    <div id="aaui-log" style="margin-top:8px;border-top:1px solid #334155;padding-top:6px;opacity:.85"></div>
  `;
  document.documentElement.appendChild(panel);

  const logEl = panel.querySelector("#aaui-log") as HTMLElement;
  const fieldsEl = panel.querySelector("#aaui-fields") as HTMLElement;
  const reviewEl = panel.querySelector("#aaui-review") as HTMLElement;
  const log = (msg: string, ok?: boolean) => {
    const line = document.createElement("div");
    line.textContent = (ok === undefined ? "· " : ok ? "✓ " : "✗ ") + msg;
    if (ok === false) line.style.color = "#f87171";
    if (ok === true) line.style.color = "#4ade80";
    logEl.prepend(line);
  };

  // Announce readiness over the typed protocol. The persisted per-tab load
  // count (chrome.storage.local — survives worker death) seeds the Stage B
  // "state survives navigation" pattern.
  sendToWorker({
    type: "page-ready",
    frame: { url: location.href, isTopFrame: isTop, hasForm },
  }).then((res) => {
    if (res.loadCount) log(`page loads this tab: ${res.loadCount}`);
    if (res.runActive) log("a run is active on this tab");
  });

  // ─── Reusable executor actions (shared by manual buttons + worker commands) ──

  /** Scan the page and render rows. Returns the questions found. */
  function scanPage(): FormField[] {
    questions = collectFormQuestions();
    fieldsEl.innerHTML = "";
    log(`scanned: ${questions.length} question(s)`);

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const auto = getAutoFillAnswer(q.text);
      const row = document.createElement("div");
      row.style.cssText = "margin:6px 0;padding:6px;background:#1e293b;border-radius:6px";
      const answerHint = auto === "__SKIP__" ? "(auto-skip)" : auto || "";
      row.innerHTML = `
        <div style="font-weight:600">${escapeHtml(q.text.slice(0, 80))}</div>
        <div style="opacity:.6">${q.type}${q.options.length ? ` · ${q.options.length} options` : ""}</div>
        <input data-aaui-idx="${i}" value="${escapeHtml(answerHint)}"
               placeholder="answer (# for option, blank = skip)"
               style="width:100%;margin-top:4px;padding:4px;border:1px solid #334155;border-radius:4px;background:#0f172a;color:#e2e8f0"/>
      `;
      fieldsEl.appendChild(row);

      const el = q.inputId
        ? document.getElementById(q.inputId)
        : q.inputName
          ? document.querySelector(`[name="${CSS.escape(q.inputName)}"]`)
          : null;
      if (el) (el as HTMLElement).style.outline = "2px dashed #2563eb";
    }
    return questions;
  }

  /** Fill every scanned field from its (auto-filled or edited) answer. */
  async function fillPage(): Promise<void> {
    const inputs = fieldsEl.querySelectorAll<HTMLInputElement>("input[data-aaui-idx]");
    for (const inp of inputs) {
      const q = questions[Number(inp.dataset.aauiIdx)];
      const answer = inp.value.trim();
      if (!answer || answer === "__SKIP__" || answer === "(auto-skip)") continue;
      const result = fillFieldDom(q, answer);
      log(`${q.text.slice(0, 40)} → ${result.detail}`, result.ok);
      await sleep(250);
    }
    log("fill pass done — check whether values STUCK (React can revert them)");
  }

  /** Click the visible Continue/Submit button. Returns whether one was found. */
  function advancePage(): boolean {
    const btn = findAdvanceDom();
    if (!btn) {
      log("no visible Continue/Submit button found", false);
      return false;
    }
    log(`clicking "${(btn.textContent || "").trim().slice(0, 40)}"`);
    btn.click();
    return true;
  }

  /** Temporary review bar (M-B5 replaces with the real gate). */
  function showReviewGate(runId: string): void {
    reviewEl.innerHTML = `
      <div style="margin:4px 0 8px;padding:8px;background:#422006;border:1px solid #d97706;border-radius:6px">
        <div style="margin-bottom:6px">Does this page look right? <span style="opacity:.6">(placeholder gate)</span></div>
        <div style="display:flex;gap:6px">
          <button id="aaui-approve" style="flex:1;padding:5px;border:0;border-radius:5px;background:#059669;color:#fff;cursor:pointer">Looks right</button>
          <button id="aaui-reject" style="flex:1;padding:5px;border:0;border-radius:5px;background:#b91c1c;color:#fff;cursor:pointer">Stop</button>
        </div>
      </div>`;
    const decide = (decision: ReviewDecisionMsg["decision"]) => {
      reviewEl.innerHTML = "";
      sendToWorker({ type: "review-decision", runId, decision });
    };
    reviewEl.querySelector("#aaui-approve")!.addEventListener("click", () => decide("approved"));
    reviewEl.querySelector("#aaui-reject")!.addEventListener("click", () => decide("rejected"));
  }

  // ─── Manual buttons (debug) ──────────────────────────────────────────────────

  panel.querySelector("#aaui-start")!.addEventListener("click", () => {
    sendToWorker({ type: "start-run" }).then((res) => log(`start-run → ${res.ok ? "ok" : "failed"}`, res.ok));
  });
  panel.querySelector("#aaui-cancel")!.addEventListener("click", () => {
    sendToWorker({ type: "cancel-run" }).then(() => log("run cancelled"));
  });
  panel.querySelector("#aaui-scan")!.addEventListener("click", () => scanPage());
  panel.querySelector("#aaui-fill")!.addEventListener("click", () => fillPage());
  panel.querySelector("#aaui-next")!.addEventListener("click", () => advancePage());

  // ─── Worker command loop ─────────────────────────────────────────────────────
  // The controller (background.ts) drives the run by sending CommandMsg to this
  // frame. We execute and report back so the state machine can advance.

  chrome.runtime.onMessage.addListener((msg: ContentBoundMsg, _sender, sendResponse) => {
    if (msg?.type !== "command") return false;
    currentRunId = msg.runId;

    switch (msg.command) {
      case "scan": {
        const found = scanPage();
        // Stay silent when this frame has no form so a sibling frame — or the
        // controller's no-form timeout — decides. An empty reply would be read
        // as "flow complete".
        if (found.length > 0) {
          sendToWorker({ type: "scan-result", runId: msg.runId, questions: found });
        }
        sendResponse({ ok: true });
        return false;
      }
      case "fill": {
        fillPage()
          .then(() => sendToWorker({ type: "fill-result", runId: msg.runId }))
          .catch((err) => sendToWorker({ type: "run-error", runId: msg.runId, reason: String(err) }));
        sendResponse({ ok: true });
        return false;
      }
      case "review": {
        showReviewGate(msg.runId);
        sendResponse({ ok: true });
        return false;
      }
      case "advance": {
        const ok = advancePage();
        if (!ok) sendToWorker({ type: "run-error", runId: msg.runId, reason: "no advance button" });
        sendResponse({ ok });
        return false;
      }
    }
  });

  void currentRunId; // reserved for M-B5 (review edits reference the live run)
}

// ─── DOM fill (POC version of fillFormField) ──────────────────────────────────
// The critical difference from the desktop force-set path: React-controlled
// inputs ignore plain `el.value = x`. You must call the NATIVE value setter
// (bypassing React's instrumented property) and then dispatch `input` so
// React's onChange fires and commits the value to its own state.

function setNativeValue(el: HTMLElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : el instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function fillFieldDom(field: FormField, answer: string): { ok: boolean; detail: string } {
  try {
    if (field.type === "radio" || field.type === "checkbox") {
      let opt = null;
      if (answer.startsWith("__RADIO:")) {
        const keywords = answer.slice(8).split(",").map((k) => k.trim().toLowerCase());
        for (const kw of keywords) {
          opt = field.options.find((o) => o.label.toLowerCase().includes(kw));
          if (opt) break;
        }
        if (!opt) opt = field.options.find((o) => o.label.toLowerCase().trim() === answer.slice(8).split(",")[0].toLowerCase());
      } else {
        const idx = parseInt(answer, 10);
        if (!isNaN(idx) && idx >= 1 && idx <= field.options.length) opt = field.options[idx - 1];
      }
      if (!opt) return { ok: false, detail: "no matching option" };
      const el = opt.id
        ? document.getElementById(opt.id)
        : field.inputName
          ? document.querySelector<HTMLInputElement>(`input[name="${CSS.escape(field.inputName)}"][value="${CSS.escape(opt.value)}"]`)
          : null;
      if (!el) return { ok: false, detail: "option element not found" };
      (el as HTMLElement).click();
      const checked = (el as HTMLInputElement).checked;
      return { ok: checked, detail: checked ? `selected "${opt.label}"` : `clicked "${opt.label}" but NOT checked` };
    }

    if (field.type === "select") {
      let match = null;
      if (answer.startsWith("__RADIO:")) {
        const keywords = answer.slice(8).split(",").map((k) => k.trim().toLowerCase());
        for (const kw of keywords) {
          match = field.options.find((o) => o.label.toLowerCase().includes(kw));
          if (match) break;
        }
      } else {
        const idx = parseInt(answer, 10);
        match = !isNaN(idx) && idx >= 1 && idx <= field.options.length
          ? field.options[idx - 1]
          : field.options.find((o) => o.label.toLowerCase().includes(answer.toLowerCase()));
      }
      if (!match || !field.inputId) return { ok: false, detail: "no matching option" };
      const el = document.getElementById(field.inputId) as HTMLSelectElement | null;
      if (!el) return { ok: false, detail: "select not found" };
      setNativeValue(el, match.value);
      return { ok: el.value === match.value, detail: `selected "${match.label}"` };
    }

    // Text-like fields.
    const el = (field.inputId
      ? document.getElementById(field.inputId)
      : field.inputName
        ? document.querySelector(`input[name="${CSS.escape(field.inputName)}"], textarea[name="${CSS.escape(field.inputName)}"]`)
        : null) as HTMLInputElement | HTMLTextAreaElement | null;
    if (!el) return { ok: false, detail: "input not found" };
    el.focus();
    setNativeValue(el, answer);
    el.dispatchEvent(new Event("blur", { bubbles: true }));
    const stuck = el.value === answer;
    return { ok: stuck, detail: stuck ? `filled "${answer}"` : "value did NOT stick (React reverted it)" };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}

// ─── Advance-button finder (POC version) ──────────────────────────────────────

const POSITIVE_RE = /\b(review|continue|submit|next|apply|proceed|advance|finish|send)\b/i;
const NEGATIVE_RE = /\b(back|cancel|withdraw|close|skip|dismiss|report|feedback|help|sign in|sign out|log in|log out|delete|remove|edit|undo)\b/i;

function isVisibleEnabled(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  return rect.width > 0 && rect.height > 0
    && style.visibility !== "hidden" && style.display !== "none"
    && !(el as HTMLButtonElement).disabled
    && el.getAttribute("aria-disabled") !== "true";
}

function findAdvanceDom(): HTMLElement | null {
  // Visible-first on the exact selector — Indeed's hidden-duplicate gotcha.
  for (const el of document.querySelectorAll<HTMLElement>('button[data-testid="continue-button"]')) {
    if (isVisibleEnabled(el)) return el;
  }
  let best: { el: HTMLElement; score: number } | null = null;
  for (const el of document.querySelectorAll<HTMLElement>('button, [role="button"]')) {
    if (!isVisibleEnabled(el)) continue;
    const text = (el.innerText || el.getAttribute("aria-label") || "").trim();
    if (!text || text.length >= 80 || NEGATIVE_RE.test(text) || !POSITIVE_RE.test(text)) continue;
    const rect = el.getBoundingClientRect();
    const score = 1000 + Math.min(rect.width * rect.height, 50000) / 1000;
    if (!best || score > best.score) best = { el, score };
  }
  return best?.el ?? null;
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
