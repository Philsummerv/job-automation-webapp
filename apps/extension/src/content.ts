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
import type { ScoutConfig } from "@applyassistui/automation/config";
import type { FormField } from "@applyassistui/automation/types";
import { sendToWorker as rawSendToWorker } from "./messages";
import type { ContentBoundMsg, ResponseMap, WorkerBoundMsg } from "./messages";
import { getItem, setItem } from "./storage";
import type { AnswerTemplate, CustomRule } from "./storage";
import type { JobMeta } from "./state/types";

// ─── Extension-context safety ──────────────────────────────────────────────────
// After the extension is reloaded/updated, THIS content script keeps running in
// the already-open tab but its chrome.runtime connection is dead. Any message
// then throws "Extension context invalidated". Guard every worker message: if
// the context is gone, no-op and show a one-time "reload this page" notice
// instead of letting an uncaught error escape.

let extDead = false;

function extAlive(): boolean {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

function markExtDead(): void {
  if (extDead) return;
  extDead = true;
  try {
    const p = document.getElementById("aaui-poc-panel");
    if (p) {
      const n = document.createElement("div");
      n.textContent = "⚠ Extension was updated — reload this page to reconnect.";
      n.style.cssText = "margin:6px 0;padding:6px;background:#7f1d1d;border-radius:6px;color:#fff";
      p.prepend(n);
    }
  } catch {
    /* nothing we can do */
  }
}

/** Guarded worker send: resolves to null (never throws) if the context is dead. */
function sendToWorker<M extends WorkerBoundMsg>(msg: M): Promise<ResponseMap[M["type"]] | null> {
  if (extDead || !extAlive()) {
    markExtDead();
    return Promise.resolve(null);
  }
  return rawSendToWorker(msg).catch((e: unknown) => {
    const m = e instanceof Error ? e.message : String(e);
    if (m.includes("context invalidated") || m.includes("Receiving end does not exist")) {
      markExtDead();
    }
    // Never let a send rejection escape as an uncaught error in the page.
    return null;
  });
}

// Only mount where it makes sense: the top frame, or any child frame that
// actually contains a form (Indeed sometimes iframes the apply flow).
const isTop = window.self === window.top;
const hasForm = !!document.querySelector("form, fieldset, [class*='application']");
if (isTop || hasForm) init();

function init() {
  let template: AnswerTemplate | null = null;
  let usingSynced = false;
  let getAutoFillAnswer = makeAutoFillAnswer(DEFAULT_CONFIG);
  let questions: FormField[] = [];
  // The run this frame is currently serving; learned from the first command.
  let currentRunId: string | null = null;

  // Load the template and rebuild the ruleset resolver. The account template
  // synced from the web app wins; the local editor is an offline fallback.
  async function loadTemplate(): Promise<void> {
    const synced = await getItem("syncedTemplate");
    usingSynced = synced != null;
    template = synced ?? (await getItem("template"));
    getAutoFillAnswer = makeAutoFillAnswer(mergedConfig(template));
  }
  loadTemplate();

  // Resolve an answer for a question: the user's CUSTOM RULES win (first
  // substring match), then the built-in ruleset over the merged config.
  function getAnswer(questionText: string): string | null {
    if (template?.rules?.length) {
      const q = questionText.toLowerCase();
      for (const r of template.rules) {
        const m = r.match.trim().toLowerCase();
        if (m && q.includes(m)) return r.answer;
      }
    }
    return getAutoFillAnswer(questionText);
  }

  // ─── Panel ────────────────────────────────────────────────────────────────

  const panel = document.createElement("div");
  panel.id = "aaui-poc-panel";
  // Mark our whole UI so collectFormQuestions never scrapes our own review-gate
  // controls as if they were form questions.
  panel.setAttribute("data-aaui-ignore", "1");
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
      <span style="display:flex;gap:8px;align-items:center">
        <button id="aaui-template" title="Edit answer template" style="border:0;background:transparent;color:#e2e8f0;cursor:pointer;font-size:14px;padding:0">⚙ Template</button>
        <span style="opacity:.6">${isTop ? "top frame" : "iframe"}</span>
      </span>
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
    <div id="aaui-log" style="margin-top:8px;border-top:1px solid #334155;padding-top:6px;opacity:.85"></div>
  `;
  document.documentElement.appendChild(panel);

  const logEl = panel.querySelector("#aaui-log") as HTMLElement;
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
    if (res?.loadCount) log(`page loads this tab: ${res.loadCount}`);
    if (res?.runActive) log("a run is active on this tab");
  });

  // ─── Reusable executor actions (shared by manual buttons + worker commands) ──

  /** Scan the page. Returns the questions found. */
  function scanPage(): FormField[] {
    questions = collectFormQuestions();
    log(`scanned: ${questions.length} question(s)`);
    return questions;
  }

  /**
   * Best-effort fill: for each question, compute an answer from the (stand-in)
   * template and apply it to the real form. The review gate then shows the
   * result and lets the user correct anything. Answers are derived here, not
   * from any panel UI — the review gate is the only question UI now.
   */
  async function fillPage(): Promise<void> {
    for (const q of questions) {
      const auto = getAnswer(q.text);
      if (!auto || auto === "__SKIP__") continue;
      const result = await fillFieldDom(q, auto);
      log(`${q.text.slice(0, 40)} → ${result.detail}`, result.ok);
      await sleep(200);
    }
    log("fill pass done");
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

  // ─── Review gate ──────────────────────────────────────────────────────────
  // Shows every scanned question in its NATIVE control type, reflecting the real
  // form's current state (i.e. what the assist managed to fill). Editing a
  // control writes straight back to the real Indeed form. The user approves the
  // whole page at once, pauses to edit the page by hand, or stops the run.

  // The gate has two modes over the SAME editable cards:
  //   review — the assist just filled; approve, pause, or stop.
  //   paused — the assist is hands-off; edit here or on the page, then resume.
  // The cards stay live (edits apply to the form) in both modes.
  function renderReviewGate(runId: string, mode: "review" | "paused" = "review"): void {
    reviewEl.innerHTML = "";
    reviewEl.appendChild(
      mode === "paused"
        ? hHeader("Paused — your turn", "Assist is hands-off. Edit below or on the page, then resume.")
        : hHeader("Does this look right?", "Edit anything below — changes apply to the form."),
    );

    for (const q of questions) reviewEl.appendChild(renderQuestionCard(q));

    const footer = mkEl("div", "display:flex;flex-direction:column;gap:6px;margin-top:8px");
    if (mode === "paused") {
      footer.appendChild(mkBtn("Resume assist", "#7c3aed", () => sendToWorker({ type: "resume-run", runId })));
    } else {
      footer.appendChild(mkBtn("Looks right → Continue", "#059669", () => {
        reviewEl.innerHTML = "";
        sendToWorker({ type: "review-decision", runId, decision: "approved" });
      }));
    }
    const row = mkEl("div", "display:flex;gap:6px");
    if (mode !== "paused") {
      row.appendChild(mkBtn("Pause — I'll do it myself", "#475569", () => {
        sendToWorker({ type: "pause-run", runId });
        renderReviewGate(runId, "paused");
      }));
    }
    row.appendChild(mkBtn("Stop", "#b91c1c", () => {
      reviewEl.innerHTML = "";
      sendToWorker({ type: "review-decision", runId, decision: "rejected" });
    }));
    footer.appendChild(row);
    reviewEl.appendChild(footer);
  }

  /** One question card, rendering the control that matches the field type. */
  function renderQuestionCard(q: FormField): HTMLElement {
    const card = mkEl("div", "margin:6px 0;padding:8px;background:#1e293b;border-radius:6px");
    card.appendChild(mkEl("div", "font-weight:600;margin-bottom:2px", q.text.slice(0, 120)));
    const meta = mkEl("div", "opacity:.55;font-size:11px;margin-bottom:6px", q.type + (q.options.length ? ` · ${q.options.length} options` : ""));
    card.appendChild(meta);
    card.appendChild(buildControl(q, (filled) => {
      meta.textContent = q.type + (q.options.length ? ` · ${q.options.length} options` : "") + (filled ? "  ✓ filled" : "  — needs you");
      meta.style.color = filled ? "#4ade80" : "#fbbf24";
    }));
    return card;
  }

  /** Build the editable control for a field, wired to the real form. */
  function buildControl(q: FormField, onState: (filled: boolean) => void): HTMLElement {
    const t = q.type;

    if (t === "checkbox" || t === "radio") {
      const wrap = mkEl("div", "display:flex;flex-direction:column;gap:4px");
      const groupName = `aaui-${Math.random().toString(36).slice(2)}`;
      const syncState = () => onState(q.options.some((o) => realOptionEl(q, o)?.checked));
      for (const opt of q.options) {
        const realEl = realOptionEl(q, opt);
        const lbl = mkEl("label", "display:flex;align-items:center;gap:6px;cursor:pointer");
        const box = document.createElement("input");
        box.type = t === "radio" ? "radio" : "checkbox";
        if (t === "radio") box.name = groupName;
        box.checked = !!realEl?.checked;
        box.addEventListener("change", () => {
          if (realEl && realEl.checked !== box.checked) realEl.click();
          // Re-sync from the real element after React settles.
          setTimeout(() => {
            box.checked = !!realEl?.checked;
            syncState();
          }, 0);
        });
        lbl.appendChild(box);
        lbl.appendChild(mkEl("span", "", opt.label.slice(0, 60)));
        wrap.appendChild(lbl);
      }
      syncState();
      return wrap;
    }

    if (t === "select") {
      const realEl = realSelectEl(q);
      const sel = document.createElement("select");
      sel.style.cssText = "width:100%;padding:4px;border:1px solid #334155;border-radius:4px;background:#0f172a;color:#e2e8f0";
      const blank = document.createElement("option");
      blank.value = ""; blank.textContent = "— select —";
      sel.appendChild(blank);
      for (const opt of q.options) {
        const o = document.createElement("option");
        o.value = opt.value; o.textContent = opt.label.slice(0, 60);
        sel.appendChild(o);
      }
      sel.value = realEl?.value ?? "";
      sel.addEventListener("change", () => {
        if (realEl) setNativeValue(realEl, sel.value);
        setTimeout(() => { sel.value = realEl?.value ?? ""; onState(!!realEl?.value); }, 0);
      });
      onState(!!realEl?.value);
      return sel;
    }

    if (t === "combobox") {
      // Indeed's custom multi-select: options live in a popup that only exists
      // when opened, so we can't render them inline reliably. Surface current
      // selection + a button that opens Indeed's own dialog for the user.
      const realEl = realComboboxEl(q);
      const wrap = mkEl("div", "display:flex;flex-direction:column;gap:4px");
      const current = mkEl("div", "opacity:.8;font-size:11px", `current: ${(realEl?.innerText || "(nothing)").trim().slice(0, 40)}`);
      wrap.appendChild(current);
      wrap.appendChild(mkBtn("Choose on page ▾", "#2563eb", () => {
        realEl?.click();
        (realEl as HTMLElement | null)?.focus?.();
        // Re-read the selection shortly after the user interacts.
        setTimeout(() => {
          current.textContent = `current: ${(realEl?.innerText || "(nothing)").trim().slice(0, 40)}`;
          onState(!!realEl && !/^\s*(select an option|nothing)?\s*$/i.test(realEl.innerText || ""));
        }, 1500);
      }));
      onState(!!realEl && !/select an option/i.test(realEl.innerText || ""));
      return wrap;
    }

    // Text-like (text, textarea, number, email, tel, url, unknown).
    const realEl = realTextEl(q);
    const input = t === "textarea" ? document.createElement("textarea") : document.createElement("input");
    input.style.cssText = "width:100%;padding:4px;border:1px solid #334155;border-radius:4px;background:#0f172a;color:#e2e8f0";
    input.value = realEl?.value ?? "";
    input.addEventListener("input", () => {
      if (realEl) setNativeValue(realEl, input.value);
      onState(!!input.value.trim());
    });
    onState(!!realEl?.value?.trim());
    return input;
  }

  // ─── Template editor ──────────────────────────────────────────────────────────
  // Local answer template (Option A): standard fields + custom question rules.
  // Saved to chrome.storage.local; drives the fill. Later synced from the web app.

  function renderTemplateEditor(): void {
    reviewEl.innerHTML = "";
    reviewEl.appendChild(hHeader("Answer template", "Your saved answers drive the autofill. Blank = sensible default."));

    if (usingSynced) {
      const note = mkEl(
        "div",
        "margin:4px 0 8px;padding:6px;background:#1e293b;border:1px solid #2563eb;border-radius:6px;font-size:11px;line-height:1.4",
        "Showing your web-app template. Edit it at job-automation-webapp-web.vercel.app → Answer Template. Saving here only sets a local fallback used when signed out.",
      );
      reviewEl.appendChild(note);
    }

    const cfg = template?.config ?? {};
    const fieldInputs: Record<string, HTMLInputElement | HTMLSelectElement> = {};
    for (const f of TEMPLATE_FIELDS) {
      const card = mkEl("div", "margin:5px 0");
      card.appendChild(mkEl("div", "font-size:11px;opacity:.8;margin-bottom:2px", f.label));
      let inp: HTMLInputElement | HTMLSelectElement;
      if (f.type === "yesno" || f.type === "select") {
        const sel = document.createElement("select");
        sel.style.cssText = INPUT_CSS;
        const choices = f.type === "yesno"
          ? [{ label: "(default)", value: "" }, { label: "Yes", value: "Yes" }, { label: "No", value: "No" }]
          : [{ label: "(default)", value: "" }, ...(f.options ?? [])];
        for (const c of choices) {
          const opt = document.createElement("option");
          opt.value = c.value; opt.textContent = c.label;
          sel.appendChild(opt);
        }
        // Pre-select the saved value; unknown/legacy values fall back to default.
        sel.value = choices.some((c) => c.value === cfg[f.key]) ? (cfg[f.key] ?? "") : "";
        inp = sel;
      } else {
        const t = document.createElement("input");
        t.style.cssText = INPUT_CSS;
        t.value = cfg[f.key] ?? "";
        if (f.placeholder) t.placeholder = f.placeholder;
        inp = t;
      }
      fieldInputs[f.key] = inp;
      card.appendChild(inp);
      reviewEl.appendChild(card);
    }

    reviewEl.appendChild(mkEl("div", "font-weight:700;margin:12px 0 2px", "Custom question rules"));
    reviewEl.appendChild(mkEl("div", "font-size:11px;opacity:.6;margin-bottom:4px", "If a question contains … answer …  (these win over the built-in rules)"));
    const rulesWrap = mkEl("div", "");
    reviewEl.appendChild(rulesWrap);
    const addRuleRow = (rule?: CustomRule) => {
      const row = mkEl("div", "display:flex;gap:4px;margin:3px 0");
      const m = document.createElement("input");
      m.placeholder = "contains…"; m.style.cssText = INPUT_CSS + ";flex:1"; m.value = rule?.match ?? "";
      const a = document.createElement("input");
      a.placeholder = "answer"; a.style.cssText = INPUT_CSS + ";flex:1"; a.value = rule?.answer ?? "";
      const del = mkBtn("×", "#b91c1c", () => row.remove());
      del.style.flex = "0 0 26px";
      row.append(m, a, del);
      rulesWrap.appendChild(row);
    };
    (template?.rules ?? []).forEach((r) => addRuleRow(r));
    const add = mkBtn("+ Add rule", "#334155", () => addRuleRow());
    add.style.marginTop = "4px";
    reviewEl.appendChild(add);

    const footer = mkEl("div", "display:flex;gap:6px;margin-top:12px");
    footer.appendChild(mkBtn("Save template", "#059669", async () => {
      const config: Record<string, string> = {};
      for (const f of TEMPLATE_FIELDS) {
        const v = fieldInputs[f.key].value.trim();
        if (v) config[f.key] = v;
      }
      const rules: CustomRule[] = [];
      for (const row of Array.from(rulesWrap.children)) {
        const ins = row.querySelectorAll("input");
        const match = ins[0]?.value.trim() ?? "";
        const answer = ins[1]?.value.trim() ?? "";
        if (match && answer) rules.push({ match, answer });
      }
      await setItem("template", { config, rules });
      await loadTemplate();
      reviewEl.innerHTML = "";
      log(`template saved (${Object.keys(config).length} fields, ${rules.length} rules)`, true);
    }));
    footer.appendChild(mkBtn("Cancel", "#475569", () => { reviewEl.innerHTML = ""; }));
    reviewEl.appendChild(footer);
  }

  // ─── Compliance log confirmation ──────────────────────────────────────────────
  // Shown after a guided application completes. The user confirms (and can edit)
  // before anything is written to their activity log — nothing is logged silently.

  function renderLogConfirm(job: JobMeta): void {
    reviewEl.innerHTML = "";
    reviewEl.appendChild(hHeader("Application submitted 🎉", "Log this to your activity record? You confirm every entry."));

    const card = mkEl("div", "margin:6px 0;padding:8px;background:#1e293b;border-radius:6px;display:flex;flex-direction:column;gap:6px");
    const empWrap = mkEl("div", "");
    empWrap.appendChild(mkEl("div", "font-size:11px;opacity:.8;margin-bottom:2px", "Employer"));
    const emp = document.createElement("input");
    emp.style.cssText = INPUT_CSS;
    emp.value = job.company ?? "";
    emp.placeholder = "Employer name";
    empWrap.appendChild(emp);

    const titleWrap = mkEl("div", "");
    titleWrap.appendChild(mkEl("div", "font-size:11px;opacity:.8;margin-bottom:2px", "Job title"));
    const title = document.createElement("input");
    title.style.cssText = INPUT_CSS;
    title.value = job.title ?? "";
    title.placeholder = "Job title";
    titleWrap.appendChild(title);

    card.append(empWrap, titleWrap);

    const row = mkEl("div", "display:flex;gap:6px;margin-top:4px");
    row.appendChild(mkBtn("Log it", "#059669", () => {
      const employer = emp.value.trim();
      if (!employer) { log("employer is required to log", false); return; }
      sendToWorker({
        type: "log-activity",
        employer_name: employer,
        job_title: title.value.trim() || null,
        url: job.url,
      });
      reviewEl.innerHTML = "";
      log("logged — syncs to your activity record next time you open the web app", true);
    }));
    row.appendChild(mkBtn("Skip", "#475569", () => { reviewEl.innerHTML = ""; }));
    card.appendChild(row);
    reviewEl.appendChild(card);
  }

  // ─── Manual buttons (debug) ──────────────────────────────────────────────────

  panel.querySelector("#aaui-template")!.addEventListener("click", () => renderTemplateEditor());

  panel.querySelector("#aaui-start")!.addEventListener("click", () => {
    sendToWorker({ type: "start-run" }).then((res) => {
      if (res?.ok) { log("run started", true); return; }
      if (res?.reason === "not-signed-in") {
        log("Sign in at applyassistui (job-automation-webapp-web.vercel.app) to use the assist", false);
      } else if (res?.reason === "not-entitled") {
        log("Account not active — start your trial / subscribe on the web app, then reload here", false);
      } else {
        log("couldn't start run", false);
      }
    });
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
    if (msg?.type === "confirm-log") {
      renderLogConfirm(msg.job);
      sendResponse({ ok: true });
      return false;
    }
    if (msg?.type !== "command") return false;
    currentRunId = msg.runId;

    switch (msg.command) {
      case "scan": {
        const found = scanPage();
        // Stay silent when this frame has no form so a sibling frame — or the
        // controller's no-form timeout — decides. An empty reply would be read
        // as "flow complete".
        if (found.length > 0) {
          sendToWorker({ type: "scan-result", runId: msg.runId, questions: found, job: captureJobMeta() });
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
        renderReviewGate(msg.runId);
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

// ─── Template helpers ──────────────────────────────────────────────────────────

const INPUT_CSS = "width:100%;padding:4px;border:1px solid #334155;border-radius:4px;background:#0f172a;color:#e2e8f0;font:inherit;box-sizing:border-box";

/** Standard template fields exposed in the editor (curated subset of ScoutConfig). */
type TemplateField = {
  key: string;
  label: string;
  type?: "yesno" | "select";
  placeholder?: string;
  /** For type "select": the choices. `value` is the keyword string used to
   * match the real form's option label (via the __RADIO: mechanism). */
  options?: { label: string; value: string }[];
};

const TEMPLATE_FIELDS: TemplateField[] = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "phone", label: "Phone" },
  { key: "zipCode", label: "ZIP code" },
  { key: "city", label: "City" },
  { key: "educationLevel", label: "Education", placeholder: "keywords to match the option, e.g. Bachelor" },
  { key: "salary", label: "Desired salary" },
  { key: "yearsExperience", label: "Years of experience" },
  { key: "willingToRelocate", label: "Willing to relocate", type: "yesno" },
  { key: "authorizedToWork", label: "Authorized to work in the US", type: "yesno" },
  { key: "needsSponsorship", label: "Need visa sponsorship", type: "yesno" },
  { key: "usCitizen", label: "US citizen", type: "yesno" },
  { key: "is18OrOlder", label: "18 or older", type: "yesno" },
  { key: "hasDiploma", label: "Have HS diploma / GED", type: "yesno" },
  { key: "drivingLicense", label: "Have driver's license", type: "yesno" },
  {
    key: "veteranStatus",
    label: "Veteran status",
    type: "select",
    options: [
      { label: "Not a protected veteran", value: "not a protected veteran" },
      { label: "I am a protected veteran", value: "i identify as a protected veteran" },
      { label: "Prefer not to answer", value: "prefer not to answer" },
    ],
  },
  {
    key: "disabilityStatus",
    label: "Disability status",
    type: "select",
    options: [
      { label: "No, I don't have a disability", value: "no i do not have a disability" },
      { label: "Yes, I have a disability", value: "yes i have a disability" },
      { label: "Prefer not to answer", value: "prefer not to answer" },
    ],
  },
  { key: "linkedin", label: "LinkedIn URL" },
];

/** Merge the user's template overrides onto DEFAULT_CONFIG (blanks ignored). */
function mergedConfig(template: AnswerTemplate | null): ScoutConfig {
  const cfg = { ...DEFAULT_CONFIG } as Record<string, unknown>;
  for (const [k, v] of Object.entries(template?.config ?? {})) {
    if (v != null && String(v).trim() !== "") cfg[k] = v;
  }
  return cfg as unknown as ScoutConfig;
}

// ─── Job-identity capture (compliance log) ────────────────────────────────────
// Best-effort extraction of the job's title/company/url from the current page.
// Site markup varies, so these only PREFILL the confirmation card — the user
// edits and confirms before anything is logged.

function captureJobMeta(): JobMeta {
  const pick = (sel: string): string | null => {
    const el = document.querySelector<HTMLElement>(sel);
    const t = el?.innerText?.trim();
    return t && t.length > 0 && t.length < 200 ? t : null;
  };
  const title =
    pick('[data-testid*="jobTitle" i]') ||
    pick('[data-testid*="job-title" i]') ||
    pick('[class*="jobTitle" i]') ||
    null;
  const company =
    pick('[data-testid*="companyName" i]') ||
    pick('[data-testid*="company-name" i]') ||
    pick('[data-testid*="employerName" i]') ||
    pick('[class*="companyName" i]') ||
    null;
  const jobLink = document.querySelector<HTMLAnchorElement>('a[href*="/viewjob"], a[href*="/rc/clk"]');
  const url = jobLink?.href || location.href;
  return { title, company, url };
}

// ─── Review-gate helpers ──────────────────────────────────────────────────────
// UI builders + finders that map a scanned FormField back to its live element(s)
// on the page, so the review controls can read and write the real form.

function mkEl(tag: string, css: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (text != null) e.textContent = text;
  return e;
}

function mkBtn(label: string, bg: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = label;
  b.style.cssText = `flex:1;padding:6px;border:0;border-radius:6px;background:${bg};color:#fff;cursor:pointer;font:inherit`;
  b.addEventListener("click", onClick);
  return b;
}

function hHeader(title: string, sub: string): HTMLElement {
  const box = mkEl("div", "margin:4px 0 6px");
  box.appendChild(mkEl("div", "font-weight:700", title));
  box.appendChild(mkEl("div", "opacity:.6;font-size:11px", sub));
  return box;
}

function realTextEl(q: FormField): HTMLInputElement | HTMLTextAreaElement | null {
  if (q.inputId) return document.getElementById(q.inputId) as HTMLInputElement | HTMLTextAreaElement | null;
  if (q.inputName) {
    return document.querySelector(
      `input[name="${CSS.escape(q.inputName)}"], textarea[name="${CSS.escape(q.inputName)}"]`,
    );
  }
  return null;
}

function realOptionEl(q: FormField, opt: { value: string; id?: string }): HTMLInputElement | null {
  if (opt.id) return document.getElementById(opt.id) as HTMLInputElement | null;
  if (q.inputName) {
    return document.querySelector<HTMLInputElement>(
      `input[name="${CSS.escape(q.inputName)}"][value="${CSS.escape(opt.value)}"]`,
    );
  }
  return null;
}

function realSelectEl(q: FormField): HTMLSelectElement | null {
  return q.inputId ? (document.getElementById(q.inputId) as HTMLSelectElement | null) : null;
}

function realComboboxEl(q: FormField): HTMLElement | null {
  return q.inputId ? document.getElementById(q.inputId) : null;
}

// ─── Option matching ────────────────────────────────────────────────────────
// Score how well an option label answers a given answer word. Combines direct
// text overlap with light INTENT awareness so plain answers like "none",
// "prefer not to answer", or "yes" pick the right option even when the option's
// wording doesn't literally contain the answer (common on veteran/disability
// self-ID and Yes/No screeners). Used by every option-type field.

/** Classify a label/answer's yes-no-ish intent (decline > negative > affirmative). */
function classifyIntent(text: string): "decline" | "negative" | "affirmative" | "neutral" {
  const s = text.toLowerCase();
  if (/\b(decline|prefer not|choose not|no answer|not to answer|no response|wish to answer|want to answer|not to self.?identify|skip|n\/?a)\b/.test(s)) return "decline";
  if (/\b(none|no|not|nope|never|am not|do not|without)\b/.test(s)) return "negative";
  if (/\b(yes|i am|i have|identify|affirm|yeah|yep)\b/.test(s)) return "affirmative";
  return "neutral";
}

function scoreOption(label: string, answer: string): number {
  const o = label.toLowerCase().trim();
  const a = answer.toLowerCase().trim();
  if (!o || !a) return 0;
  if (o === a) return 1000;

  // Text overlap (shared tokens + phrase containment) as the base signal.
  const oTokens = new Set(o.split(/[^a-z0-9]+/).filter(Boolean));
  let score = 0;
  for (const t of a.split(/[^a-z0-9]+/)) if (t.length > 2 && oTokens.has(t)) score += 10;
  if (o.length >= 4 && a.includes(o)) score += 20;
  if (a.length >= 4 && o.includes(a)) score += 20;

  // Intent alignment DOMINATES: a negative answer must not match an affirmative
  // option just because it's a substring ("protected veteran" ⊂ "not a protected
  // veteran"), and "prefer not to answer" must beat a bare "No". Mismatched
  // intents are penalised so a correctly-aligned option wins.
  const ai = classifyIntent(a);
  const oi = classifyIntent(o);
  if (ai !== "neutral" && oi !== "neutral") score += ai === oi ? 100 : -100;
  return score;
}

/**
 * Resolve an answer (a numeric index, a __RADIO: keyword list, or plain text)
 * to an option index, using scoreOption. Returns -1 if nothing scores.
 */
function resolveOptionIndex(options: { label: string }[], answer: string): number {
  const trimmed = answer.trim();
  if (!answer.startsWith("__RADIO:") && /^\d+$/.test(trimmed)) {
    const i = parseInt(trimmed, 10);
    if (i >= 1 && i <= options.length) return i - 1;
  }
  const raw = answer.startsWith("__RADIO:") ? answer.slice(8) : answer;
  const keywords = raw.split(",").map((k) => k.trim()).filter(Boolean);
  let bestIdx = -1;
  let bestScore = 0;
  for (const kw of keywords) {
    for (let i = 0; i < options.length; i++) {
      const s = scoreOption(options[i].label, kw);
      if (s > bestScore) { bestScore = s; bestIdx = i; }
    }
  }
  return bestScore > 0 ? bestIdx : -1;
}

/** Poll until `fn` returns something truthy, or give up after `timeoutMs`. */
async function waitFor<T>(fn: () => T | null | undefined, timeoutMs: number, stepMs = 60): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() >= deadline) return null;
    await sleep(stepMs);
  }
}

/**
 * Fill an Indeed "mosaic" combobox — a <div role="combobox"> whose options live
 * in an on-demand popup dialog (a search box + one checkbox per option). Open
 * it, match an option by keyword against its label, click it, close. Best-effort:
 * the review gate's "Choose on page" button stays as a manual fallback if this
 * can't resolve a match.
 */
async function fillComboboxDom(field: FormField, answer: string): Promise<{ ok: boolean; detail: string }> {
  const combo = field.inputId ? document.getElementById(field.inputId) : null;
  if (!combo) return { ok: false, detail: "combobox not found" };

  const keywords = (answer.startsWith("__RADIO:") ? answer.slice(8) : answer)
    .split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
  if (!keywords.length) return { ok: false, detail: "no answer to match" };

  const popupId = combo.getAttribute("aria-controls");
  if (combo.getAttribute("aria-expanded") !== "true") combo.click();

  // Wait for the popup (with option inputs) to render.
  const popup = await waitFor(() => {
    const p = popupId ? document.getElementById(popupId) : null;
    const scope = p || document.querySelector('[role="dialog"], [role="listbox"]');
    return scope && scope.querySelector('input[type="checkbox"], input[type="radio"], [role="option"]')
      ? (scope as HTMLElement)
      : null;
  }, 1500);
  if (!popup) return { ok: false, detail: "options popup did not open" };

  // Best-match an option against the live popup labels using the shared scorer.
  const optionEls = Array.from(popup.querySelectorAll<HTMLElement>('label, [role="option"]'));
  let picked: HTMLElement | null = null;
  let pickedLabel = "";
  let bestScore = 0;
  for (const el of optionEls) {
    const txt = (el.innerText || "").trim();
    if (!txt) continue;
    let s = 0;
    for (const kw of keywords) s = Math.max(s, scoreOption(txt, kw));
    if (s > bestScore) { bestScore = s; picked = el; pickedLabel = txt; }
  }
  if (!picked || bestScore <= 0) {
    closeCombo(combo);
    return { ok: false, detail: `no dropdown option matched "${keywords[0]}"` };
  }

  const control = picked.querySelector<HTMLInputElement>('input[type="checkbox"], input[type="radio"]');
  if (control) {
    if (!control.checked) control.click();
  } else {
    picked.click();
  }

  closeCombo(combo);
  await sleep(150);

  const display = (combo.innerText || "").trim();
  const stuck = (control ? control.checked : true)
    || /selected/i.test(display)
    || (display.length > 0 && !/select an option/i.test(display));
  return {
    ok: stuck,
    detail: stuck ? `selected "${pickedLabel.slice(0, 40)}"` : `clicked "${pickedLabel.slice(0, 40)}" — may not have stuck`,
  };
}

/** Close an open ARIA dialog/listbox combobox (Escape is the reliable path). */
function closeCombo(combo: HTMLElement): void {
  const esc = () => new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true });
  (document.activeElement || combo).dispatchEvent(esc());
  combo.dispatchEvent(esc());
}

async function fillFieldDom(field: FormField, answer: string): Promise<{ ok: boolean; detail: string }> {
  try {
    if (field.type === "combobox") {
      return await fillComboboxDom(field, answer);
    }

    if (field.type === "radio" || field.type === "checkbox") {
      const oi = resolveOptionIndex(field.options, answer);
      if (oi < 0) return { ok: false, detail: "no matching option" };
      const opt = field.options[oi];
      const el = opt.id
        ? document.getElementById(opt.id)
        : field.inputName
          ? document.querySelector<HTMLInputElement>(`input[name="${CSS.escape(field.inputName)}"][value="${CSS.escape(opt.value)}"]`)
          : null;
      if (!el) return { ok: false, detail: "option element not found" };
      const cbEl = el as HTMLInputElement;
      // Idempotency guard: only click to SELECT. Clicking an already-checked
      // box would toggle it OFF, so re-running fill (or clicking Start twice)
      // must not flip it. A native click also fires React's onChange, so we
      // don't dispatch extra events (that would double-fire and revert).
      if (!cbEl.checked) cbEl.click();
      const checked = cbEl.checked;
      return { ok: checked, detail: checked ? `selected "${opt.label}"` : `could not check "${opt.label}"` };
    }

    if (field.type === "select") {
      const oi = resolveOptionIndex(field.options, answer);
      const match = oi >= 0 ? field.options[oi] : null;
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
