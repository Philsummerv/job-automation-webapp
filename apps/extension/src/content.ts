// Content script — the on-page assistant. It is driven by the service-worker
// run controller (scan/fill/review/advance commands), renders the floating
// panel (Start run, the per-page review gate, the answer-template editor, and
// the post-submit log confirmation), and reports results back to advance the
// run's state machine.
//
// Reuses the ported automation cores directly (one implementation, two runtimes):
//   collectFormQuestions — the same DOM scraper the Playwright scout injects
//   makeAutoFillAnswer   — the ordered auto-fill rule engine over the template
//
// Fills use the user's answer template (synced from the web app; local editor is
// the offline fallback), with intent-aware matching for options (scoreOption).

import { collectFormQuestions } from "@applyassistui/automation/forms";
import { buildIndeedSearchUrl, collectIndeedJobs } from "@applyassistui/automation/indeed-search";
import { makeAutoFillAnswer } from "@applyassistui/automation/autofill";
import { DEFAULT_CONFIG } from "@applyassistui/automation/config";
import type { ScoutConfig } from "@applyassistui/automation/config";
import type { FormField } from "@applyassistui/automation/types";
import { sendToWorker as rawSendToWorker } from "./messages";
import type { ContentBoundMsg, ResponseMap, WorkerBoundMsg } from "./messages";
import { getItem, setItem } from "./storage";
import type { AnswerTemplate, CustomRule, JobQueue, QueuedJob, StoredResume } from "./storage";
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
    const p = document.getElementById("aaui-panel");
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

/**
 * True only inside Indeed's application flow.
 *
 * Scanning anywhere else is actively dangerous: on a search or results page the
 * scraper treats Indeed's own search and location comboboxes as application
 * questions, fills them, and then looks for a button to advance with — and
 * "Apply with Indeed" matches, so the assist starts applying to whatever job
 * happens to be on screen. Scanning is therefore gated to the apply form, which
 * is also the only place the answer template means anything.
 */
function isApplyPage(): boolean {
  return location.hostname.includes("smartapply.") ||
    /indeedapply|applystart|\/apply\b/i.test(location.pathname);
}

/**
 * Indeed opens the application EITHER by navigating to smartapply.indeed.com or
 * by dropping a smartapply iframe over the job page — both happen in the wild.
 * The panel lives in the top frame, so on the iframe route the top frame is
 * still /viewjob and an isApplyPage() check alone reports "not applying" even
 * though the form is right there on screen.
 */
function hasApplyFrame(): boolean {
  return Array.from(document.querySelectorAll("iframe")).some((f) => {
    const src = f.getAttribute("src") || "";
    if (!/smartapply|indeedapply/i.test(src)) return false;
    // Every job page carries a hidden <iframe src=".../preloadresumeapply">.
    // Counting that as "the application is open" made a successful press look
    // like it had already finished, so the panel sat on its spinner forever.
    if (/preload/i.test(src)) return false;
    return !f.hasAttribute("hidden");
  });
}

function isApplyContext(): boolean {
  return isApplyPage() || hasApplyFrame();
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
  /** Employer being applied to, resolved at fill time; drives referral answers. */
  let currentCompany: string | null = null;

  // Load the template and rebuild the ruleset resolver. The account template
  // synced from the web app wins; the local editor is an offline fallback.
  async function loadTemplate(): Promise<void> {
    const synced = await getItem("syncedTemplate");
    usingSynced = synced != null;
    template = synced ?? (await getItem("template"));
    getAutoFillAnswer = makeAutoFillAnswer(mergedConfig(template));
  }
  loadTemplate();

  // Landing on a results page that Find jobs sent us to: scrape and show the
  // listings without a second press. Indeed renders its cards after load, so
  // wait for the first one rather than scraping an empty page.
  if (isTop && /^\/jobs\b/.test(location.pathname)) {
    void (async () => {
      if (!(await getItem("autoBrowse"))) return;
      await setItem("autoBrowse", false);
      await loadTemplate();
      await waitFor(() => document.querySelector('[class*="job_seen_beacon"]'), 6000);
      await findJobs();
    })();
  }

  // Resolve an answer for a question: the user's CUSTOM RULES win (first
  // substring match), then the built-in ruleset over the merged config.
  function getAnswer(field: FormField): string | null {
    const questionText = field.text;
    if (template?.rules?.length) {
      const q = questionText.toLowerCase();
      for (const r of template.rules) {
        const m = r.match.trim().toLowerCase();
        if (m && q.includes(m)) return r.answer;
      }
    }
    // Employer-dependent answers beat the built-in rules, which can only ever
    // answer "no" because they don't know who you're applying to.
    const referral = referralAnswer(field);
    if (referral !== null) return referral;
    return getAutoFillAnswer(questionText);
  }

  /**
   * Answer a referral / "do you know anyone here" question against the employer
   * being applied to. Yes only when this listing's company matches one the user
   * listed in their template; free-text variants get the contact's name, which
   * is what "if yes, please list their name" is actually asking for.
   */
  function referralAnswer(field: FormField): string | null {
    const lower = field.text.toLowerCase();
    const isReferral = lower.includes("referred") || lower.includes("referral");
    const isRelative = lower.includes("acquaintance") || lower.includes("relative") ||
      lower.includes("friends or family") || lower.includes("know anyone") ||
      lower.includes("know someone");
    if (!isReferral && !isRelative) return null;

    const raw = (template?.config ?? {})[isReferral ? "referralCompanies" : "relativeCompanies"];
    const hit = matchContact(parseContacts(raw), currentCompany);

    if (!hit) return lower.includes("n/a") ? "N/A" : "__RADIO:No";
    if (field.type === "radio" || field.type === "checkbox" ||
        field.type === "select" || field.type === "combobox") {
      return "__RADIO:Yes";
    }
    return hit.name || "Yes";
  }

  // ─── Panel ────────────────────────────────────────────────────────────────

  const panel = document.createElement("div");
  panel.id = "aaui-panel";
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
      <strong style="font-size:13px">JobAssistUI</strong>
      <span style="display:flex;gap:8px;align-items:center">
        <button id="aaui-template" title="Edit answer template" style="border:0;background:transparent;color:#e2e8f0;cursor:pointer;font-size:14px;padding:0">⚙ Template</button>
        <button id="aaui-resume" title="Choose the resume to attach on applications" style="border:0;background:transparent;color:#e2e8f0;cursor:pointer;font-size:14px;padding:0">📄 Resume</button>
        <span style="opacity:.6">${isTop ? "top frame" : "iframe"}</span>
      </span>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:8px">
      <button id="aaui-start" style="flex:1;padding:10px 8px;font-size:13px;border:0;border-radius:6px;background:#7c3aed;color:#fff;cursor:pointer">Scan Indeed page</button>
      <button id="aaui-cancel" style="flex:1;padding:10px 8px;font-size:13px;border:0;border-radius:6px;background:#475569;color:#fff;cursor:pointer">Cancel</button>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:8px">
      <button id="aaui-find" style="flex:1;padding:10px 8px;font-size:13px;border:0;border-radius:6px;background:#2563eb;color:#fff;cursor:pointer">🔎 Find jobs</button>
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

  // ─── Executor actions (driven by worker commands) ────────────────────────────

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
    // Read the employer off the run, not this document: the form usually lives
    // in an iframe that has no job card, while the worker has accumulated the
    // company from whichever frame did see it.
    const run = await getItem("activeRun");
    currentCompany = run?.job?.company ?? captureJobMeta().company;

    for (const q of questions) {
      const auto = getAnswer(q);
      if (!auto || auto === "__SKIP__") continue;
      const result = await fillFieldDom(q, auto);
      log(`${q.text.slice(0, 40)} → ${result.detail}`, result.ok);
      await sleep(200);
    }
    // Resume upload is a separate pass: file inputs aren't scraped as questions,
    // and most pages in a flow have none. attachResumeDom returns null when
    // there's nothing to attach to, which is the normal case.
    const resume = await getItem("resume");
    if (resume) {
      const r = await attachResumeDom(resume);
      if (r) log(`resume → ${r.detail}`, r.ok);
    }
    log("fill pass done");
  }

  // ─── Busy indicator ───────────────────────────────────────────────────────────
  // Auto-apply spans two page loads and a scan, which is several silent seconds.
  // Without something moving, a stall and normal progress look identical.

  let busyTimer: ReturnType<typeof setInterval> | null = null;

  function showBusy(text: string): void {
    stopBusy();
    reviewEl.innerHTML = "";
    const box = mkEl(
      "div",
      "margin:6px 0;padding:14px;background:#1e293b;border-radius:6px;font-size:14px;font-weight:600;text-align:center",
    );
    reviewEl.appendChild(box);
    let n = 0;
    const paint = () => { box.textContent = `${text}${".".repeat(n++ % 4)}`; };
    paint();
    busyTimer = setInterval(paint, 400);
  }

  function stopBusy(): void {
    if (busyTimer) { clearInterval(busyTimer); busyTimer = null; }
  }

  /** Replace the spinner with a reason it stopped, so a stall is never silent. */
  function failBusy(message: string): void {
    stopBusy();
    reviewEl.innerHTML = "";
    const box = mkEl(
      "div",
      "margin:6px 0;padding:10px;background:#7f1d1d;border-radius:6px;font-size:12px;line-height:1.45",
      message,
    );
    reviewEl.appendChild(box);
    log(message, false);
  }

  // ─── Job search ───────────────────────────────────────────────────────────────
  // Off the results page, this types the search for you — building Indeed's URL
  // from the template so the query and location don't get retyped every session.
  // On the results page it lists what it found, so you pick without hunting.

  async function findJobs(): Promise<void> {
    const cfg = template?.config ?? {};
    const query = (cfg.searchQuery ?? "").trim();
    const loc = (cfg.searchLocation ?? "").trim();

    if (!/^\/jobs\b/.test(location.pathname)) {
      if (!query) {
        // A reinstall clears chrome.storage, so the account template is simply
        // absent until the bridge re-syncs it — which needs a jobassistui.com
        // tab open. Telling the user to go fill in a template they already
        // filled in sends them the wrong way entirely.
        log(
          template
            ? "add “Search: job title” to your template first"
            : "open jobassistui.com in a tab (or reload it) to sync your template",
          false,
        );
        return;
      }
      // Flag the hand-off so the results page browses itself on arrival —
      // otherwise Find jobs has to be pressed twice, once to search and again
      // to read what came back.
      await setItem("autoBrowse", true);
      // Blank location is deliberate: an empty &l= sends Indeed to a "specify
      // location" page with zero results, so buildIndeedSearchUrl omits it.
      window.location.assign(buildIndeedSearchUrl(query, loc));
      return;
    }

    // ALWAYS re-scrape the page in front of us. Replaying a stored list meant a
    // queue captured under an older build could never refresh itself — the
    // panel just kept showing that stale list forever. Progress is carried by
    // the `seen` links instead, so returning from an application still resumes
    // past the jobs already dealt with.
    const saved = await getItem("jobQueue");
    const sameSearch = saved != null && saved.query === query && saved.location === loc;
    // Never trust the SHAPE of stored data: a queue written by an earlier build
    // has no `seen` array, and reading straight through threw on every load.
    // chrome.storage has no migrations, so validate each field on the way in.
    const seen = sameSearch && Array.isArray(saved.seen) ? saved.seen : [];

    const jobs = scrapeFilteredJobs();
    const firstUnseen = jobs.findIndex((j) => !seen.includes(j.link));
    const queue: JobQueue = {
      query,
      location: loc,
      start: currentStart(),
      cursor: firstUnseen >= 0 ? firstUnseen : jobs.length,
      seen,
      jobs,
    };
    await setItem("jobQueue", queue);
    renderJobBrowser(queue);
  }

  /** Indeed's paging offset for the results page we're on. */
  function currentStart(): number {
    return parseInt(new URLSearchParams(location.search).get("start") ?? "0", 10) || 0;
  }

  /**
   * Scrape this results page and drop skipped titles, easy-apply first.
   * Deliberately NOT limited by "max applications per session": that caps how
   * many jobs you APPLY to, not how many you're allowed to look at. Slicing the
   * browse list by it meant a cap of 1 showed exactly one job.
   */
  function scrapeFilteredJobs(): QueuedJob[] {
    const cfg = template?.config ?? {};
    let jobs: QueuedJob[] = collectIndeedJobs().filter((j) => j.link !== "N/A");
    const scraped = jobs.length;

    const pattern = (cfg.exclusionTitleRegex ?? "").trim();
    if (pattern) {
      try {
        const re = new RegExp(pattern, "i");
        jobs = jobs.filter((j) => !re.test(j.title));
      } catch {
        log("“Skip titles matching” isn't a valid pattern — ignoring it", false);
      }
    }
    jobs.sort((a, b) => Number(b.isIndeedApply) - Number(a.isIndeedApply));

    const dropped = scraped - jobs.length;
    log(`found ${scraped} listing(s)${dropped > 0 ? `, skipped ${dropped} by title` : ""}`);
    return jobs;
  }

  /** Show ONE job at a time: a short summary, then Apply or Next. */
  function renderJobBrowser(queue: JobQueue): void {
    reviewEl.innerHTML = "";
    // Same defensiveness as the read above — render must not assume shape.
    if (!Array.isArray(queue.jobs)) queue = { ...queue, jobs: [] };
    if (!Array.isArray(queue.seen)) queue = { ...queue, seen: [] };

    if (!queue.jobs.length) {
      reviewEl.appendChild(hHeader(
        "No jobs found",
        "Nothing scraped from this results page — it may still be loading, or everything was filtered out by “Skip titles matching”.",
      ));
      return;
    }

    // Walking off the end of a page continues into Indeed's next 10 results
    // rather than dead-ending.
    const goNextPage = async () => {
      // Keep `seen`; the jobs themselves get re-scraped on arrival.
      await setItem("jobQueue", { ...queue, start: queue.start + 10 });
      window.location.assign(buildIndeedSearchUrl(queue.query, queue.location, queue.start + 10));
    };

    const job = queue.jobs[queue.cursor];
    if (!job) {
      reviewEl.appendChild(hHeader(
        "That's all on this page",
        `You've been through all ${queue.jobs.length}.`,
      ));
      reviewEl.appendChild(makePrimary(mkBtn("Next page of results →", "#2563eb", goNextPage)));
      return;
    }

    reviewEl.appendChild(hHeader(
      `Job ${queue.cursor + 1} of ${queue.jobs.length}`,
      job.isIndeedApply
        ? "Easy apply — the assist can complete this one."
        : "This one applies on the employer's own site.",
    ));

    const card = mkEl("div", "margin:6px 0;padding:12px;background:#1e293b;border-radius:6px;display:flex;flex-direction:column;gap:6px");
    card.appendChild(mkEl("div", "font-weight:700;font-size:16px;line-height:1.3", job.title));
    card.appendChild(mkEl("div", "font-size:14px;opacity:.9", job.company));
    card.appendChild(mkEl("div", "font-size:13px;opacity:.8", job.location));
    if (job.pay) {
      card.appendChild(mkEl("div", "font-size:16px;font-weight:800;color:#4ade80", job.pay));
    }
    if (job.snippet && job.snippet !== "N/A") {
      const brief = job.snippet.length > 220 ? `${job.snippet.slice(0, 220)}…` : job.snippet;
      card.appendChild(mkEl("div", "font-size:13px;opacity:.8;line-height:1.5", brief));
    }
    reviewEl.appendChild(card);

    // Advance the cursor BEFORE navigating away, so returning to the results
    // lands on the next job rather than the one just applied to.
    const advance = async () => {
      const next: JobQueue = {
        ...queue,
        cursor: queue.cursor + 1,
        // Capped so a long session can't grow this without bound.
        seen: [...queue.seen.filter((l) => l !== job.link), job.link].slice(-200),
      };
      await setItem("jobQueue", next);
      return next;
    };

    const isLast = queue.cursor >= queue.jobs.length - 1;
    const row = mkEl("div", "display:flex;flex-direction:column;gap:6px;margin-top:6px");
    row.appendChild(makePrimary(mkBtn("Apply to this job", "#059669", async () => {
      await advance();
      await setItem("autoApply", { at: Date.now(), link: job.link });
      window.location.assign(job.link);
    })));
    row.appendChild(makePrimary(
      isLast
        ? mkBtn("Next page of results →", "#2563eb", goNextPage)
        : mkBtn("Next job →", "#475569", async () => renderJobBrowser(await advance())),
    ));
    reviewEl.appendChild(row);
  }

  /**
   * Pick a resume and keep it. Runs from the panel button's click handler, which
   * is the user gesture a file picker requires.
   */
  function pickResume(): void {
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = ".pdf,.doc,.docx,.rtf,.txt";
    picker.style.display = "none";
    picker.setAttribute("data-aaui-ignore", "1");
    picker.addEventListener("change", async () => {
      const f = picker.files?.[0];
      picker.remove();
      if (!f) return;
      if (f.size > MAX_RESUME_BYTES) {
        log(`resume too large (${(f.size / 1024 / 1024).toFixed(1)}MB, 4MB max)`, false);
        return;
      }
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        await setItem("resume", {
          name: f.name,
          type: f.type,
          data: toBase64(bytes),
          size: f.size,
          savedAt: Date.now(),
        });
        log(`resume saved: ${f.name}`, true);
      } catch (err) {
        log(`couldn't save resume: ${(err as Error).message}`, false);
      }
    });
    document.documentElement.appendChild(picker);
    picker.click();
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
    stopBusy();
    reviewEl.innerHTML = "";
    reviewEl.appendChild(
      mode === "paused"
        ? hHeader("Paused — your turn", "Assist is hands-off. Edit below or on the page, then resume.")
        : hHeader("Does this look right?", "Edit anything below — changes apply to the form."),
    );

    const cards = questions.map((q) => {
      const card = renderQuestionCard(q);
      reviewEl.appendChild(card);
      return { q, card };
    });

    // Single, reused red banner for the required-field guard below.
    const notice = (text: string) => {
      let n = reviewEl.querySelector<HTMLElement>("#aaui-gate-notice");
      if (!n) {
        n = mkEl("div", "margin:6px 0;padding:6px 8px;background:#7f1d1d;border-radius:6px;color:#fff;font-size:11px");
        n.id = "aaui-gate-notice";
        reviewEl.insertBefore(n, reviewEl.firstChild);
      }
      n.textContent = text;
    };

    const footer = mkEl("div", "display:flex;flex-direction:column;gap:6px;margin-top:8px");
    if (mode === "paused") {
      footer.appendChild(makePrimary(mkBtn("Resume assist", "#7c3aed", () => sendToWorker({ type: "resume-run", runId }))));
    } else {
      footer.appendChild(makePrimary(mkBtn("Looks right → Continue", "#059669", () => {
        // Guard: don't advance while a REQUIRED question is still unanswered —
        // Indeed just rejects the page ("Choose an option to continue.") and the
        // run stalls. Point the user at the exact cards (still editable inline),
        // or they can use "Pause" to answer on the page.
        const missing = cards.filter(({ q }) => isFieldRequired(q) && !isFieldAnswered(q));
        if (missing.length) {
          for (const { card } of cards) card.style.outline = "";
          for (const { card } of missing) card.style.outline = "2px solid #f87171";
          const plural = missing.length > 1;
          notice(
            `${missing.length} required question${plural ? "s" : ""} still ` +
              `need${plural ? "" : "s"} an answer — fill the highlighted card${plural ? "s" : ""} ` +
              `below (or use “Pause” to answer on the page), then Continue.`,
          );
          missing[0].card.scrollIntoView({ block: "nearest" });
          return;
        }
        reviewEl.innerHTML = "";
        sendToWorker({ type: "review-decision", runId, decision: "approved" });
      })));
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

    // ── Auto-advance ──────────────────────────────────────────────────────────
    // Clicking Continue on a page that needed no corrections is pure friction,
    // so advance on a short timer instead. Two hard conditions: nothing is
    // unanswered, and this is not the page that submits. Advancing a form page
    // is reversible; sending the application to an employer is not, so that one
    // always waits for a person. The countdown is cancellable — cancelling
    // leaves the gate exactly as it was.
    if (mode === "paused") return;
    if (cards.some(({ q }) => isFieldRequired(q) && !isFieldAnswered(q))) return;
    const advanceLabel = (findAdvanceDom()?.innerText || "").trim();
    if (/\b(submit|send)\b/i.test(advanceLabel)) {
      notice(`Ready to submit — press “${advanceLabel || "Continue"}” yourself when you've checked it.`);
      return;
    }

    const bar = mkEl("div", "display:flex;align-items:center;gap:6px;margin-top:6px;font-size:11px;opacity:.9");
    const label = mkEl("span", "flex:1");
    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    cancel.style.cssText = "border:0;border-radius:4px;padding:4px 8px;background:#475569;color:#fff;cursor:pointer;font:inherit";
    bar.append(label, cancel);
    reviewEl.appendChild(bar);

    let left = 4;
    label.textContent = `Everything answered — continuing in ${left}…`;
    const tick = setInterval(() => {
      left -= 1;
      if (left > 0) {
        label.textContent = `Everything answered — continuing in ${left}…`;
        return;
      }
      clearInterval(tick);
      reviewEl.innerHTML = "";
      sendToWorker({ type: "review-decision", runId, decision: "approved" });
    }, 1000);
    cancel.addEventListener("click", () => {
      clearInterval(tick);
      bar.remove();
    });
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

  // ─── Template editor (offline fallback) ───────────────────────────────────────
  // The account template synced from the web app is the source of truth; this
  // local editor (saved to chrome.storage.local) is used only when signed out.

  function renderTemplateEditor(): void {
    reviewEl.innerHTML = "";
    reviewEl.appendChild(hHeader("Answer template", "Your saved answers drive the autofill. Blank = sensible default."));

    if (usingSynced) {
      const note = mkEl(
        "div",
        "margin:4px 0 8px;padding:6px;background:#1e293b;border:1px solid #2563eb;border-radius:6px;font-size:11px;line-height:1.4",
        "Showing your web-app template. Edit it at jobassistui.com → Answer Template. Saving here only sets a local fallback used when signed out.",
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

  /** Queue a completed application for the web app's activity log. */
  function submitLog(employer: string, jobTitle: string | null, url: string | null): void {
    sendToWorker({ type: "log-activity", employer_name: employer, job_title: jobTitle, url });
  }

  function renderLogConfirm(job: JobMeta): void {
    reviewEl.innerHTML = "";

    // The point of the assist is that the log fills itself in. When we captured
    // an employer we log it straight away and just report what happened; the
    // form below is the fallback for when the page didn't name the employer.
    if (job.company) {
      submitLog(job.company, job.title, job.url);
      const done = mkEl("div", "margin:6px 0;padding:8px;background:#064e3b;border:1px solid #059669;border-radius:6px");
      done.appendChild(mkEl("div", "font-weight:700;margin-bottom:2px", "Logged ✓"));
      done.appendChild(mkEl(
        "div",
        "font-size:11px;line-height:1.4",
        `${job.company}${job.title ? ` — ${job.title}` : ""}. Syncs to your activity record next time you open the web app. Wrong? Remove it on your dashboard.`,
      ));
      reviewEl.appendChild(done);
      log(`logged: ${job.company}`, true);
      return;
    }

    reviewEl.appendChild(hHeader("Application submitted 🎉", "We couldn't read the employer from this page — add it and we'll log it."));

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
      submitLog(employer, title.value.trim() || null, job.url);
      reviewEl.innerHTML = "";
      log("logged — syncs to your activity record next time you open the web app", true);
    }));
    row.appendChild(mkBtn("Skip", "#475569", () => { reviewEl.innerHTML = ""; }));
    card.appendChild(row);
    reviewEl.appendChild(card);
  }

  // ─── Panel buttons ────────────────────────────────────────────────────────────

  panel.querySelector("#aaui-template")!.addEventListener("click", () => renderTemplateEditor());

  panel.querySelector("#aaui-find")!.addEventListener("click", () => findJobs());

  panel.querySelector("#aaui-resume")!.addEventListener("click", () => pickResume());
  getItem("resume").then((r) => {
    if (r) log(`resume ready: ${r.name}`);
  });

  // Scanning only makes sense inside an application. Off it, the button stays
  // visible but greyed and explains itself rather than silently doing nothing.
  const startBtn = panel.querySelector<HTMLButtonElement>("#aaui-start")!;
  // Re-checked on a timer, not just at load: the application often arrives as an
  // iframe dropped onto the job page some seconds later, and the button has to
  // come alive when it does.
  const refreshScanEnabled = () => {
    const on = isApplyContext();
    startBtn.style.opacity = on ? "1" : "0.45";
    startBtn.style.cursor = on ? "pointer" : "not-allowed";
    startBtn.title = on ? "" : "Available once you're inside an application form";
    if (on) clearInterval(scanWatch);
  };
  const scanWatch = setInterval(refreshScanEnabled, 1500);
  refreshScanEnabled();

  let startPending = false;

  /** Begin a guided run on this application. Shared by the button and auto-apply. */
  async function startRun(): Promise<void> {
    // Guard against stacked runs: ignore re-clicks while a start is in flight or
    // a run is already active for this tab (re-clicking used to spawn overlapping
    // scans, producing the inconsistent scanned-count noise in the log).
    if (startPending) return;
    startPending = true;
    try {
      const active = await getItem("activeRun");
      if (active && active.status !== "done" && active.status !== "error") {
        log("a run is already active — press Cancel to stop it before restarting", false);
        return;
      }
      const res = await sendToWorker({ type: "start-run" });
      if (res?.ok) { log("run started", true); return; }
      if (res?.reason === "not-signed-in") {
        log("Sign in at jobassistui.com to use the assist", false);
      } else if (res?.reason === "not-entitled") {
        log("Account not active — start your trial / subscribe on the web app, then reload here", false);
      } else {
        log("couldn't start run", false);
      }
    } finally {
      startPending = false;
    }
  }

  startBtn.addEventListener("click", () => {
    if (!isApplyContext()) {
      log("use “Find jobs” here — Scan works once you're in an application", false);
      return;
    }
    void startRun();
  });

  // ── Auto-apply hand-off ───────────────────────────────────────────────────────
  // "Apply to this job" sets a short-lived stamp, which carries the intent across
  // the two navigations that follow: the job page (where Indeed's own Apply
  // button has to be pressed) and the application form (where the run starts).
  // It's time-limited so a stale stamp can never make a later page apply by
  // itself — the same failure the search-page guard exists to prevent.
  void (async () => {
    const stamp = await getItem("autoApply");
    if (!stamp || typeof stamp.at !== "number" || Date.now() - stamp.at > AUTO_APPLY_TTL_MS) {
      if (stamp) await setItem("autoApply", null);
      return;
    }
    // The intent belongs to ONE listing, so an unrelated Indeed page must not
    // adopt it (closing the tab mid-apply used to leave a fresh page sitting on
    // "Opening the application…"). Match on the job key appearing ANYWHERE in
    // the URL: Indeed rewrites /rc/clk → /viewjob → /?vjk= as it goes, so
    // comparing one specific query param dropped the intent on the normal path.
    const wantKey = jobKeyOf(stamp.link);
    if (!isApplyContext() && wantKey && !location.href.includes(wantKey)) {
      await setItem("autoApply", null);
      // Never bail silently — an invisible drop looks exactly like a hang.
      log("this isn't the job you picked — apply intent dropped");
      return;
    }

    if (isApplyPage()) {
      await setItem("autoApply", null);
      await loadTemplate();
      showBusy("Reading the application");
      log("starting the application automatically");
      await startRun();
      return;
    }

    // Still on the job page: press Indeed's Apply button, which either navigates
    // to the form or drops it in as an iframe — this block re-runs there.
    if (/^\/jobs\b/.test(location.pathname)) return; // results page, not a job
    showBusy("Opening the application");
    // Let the page settle before reaching for the button: it renders before
    // Indeed's script wires it up, and pressing in that gap does nothing.
    await sleep(1200);
    const btn = await waitFor(findIndeedApplyDom, 8000);
    if (!btn) {
      await setItem("autoApply", null);
      failBusy("Couldn't find Indeed's Apply button on this page — press it yourself, then Scan Indeed page.");
      return;
    }

    // The button renders before React wires its handler, so the first press can
    // land on a button that does nothing yet. Press again a few times rather
    // than declaring failure on one attempt; a real click is verified to work.
    for (let attempt = 1; attempt <= 4; attempt++) {
      if (isApplyContext()) return;
      log(attempt === 1 ? "clicking Apply with Indeed" : `Apply didn't take — retry ${attempt - 1}`);
      // Ask the worker to press it inside the page's own JS world; a content
      // script's dispatched events don't move this button. Fall back to the
      // DOM press if that route is unavailable.
      const res = await sendToWorker({ type: "click-apply" });
      // Always report the outcome. Silently falling back hid WHY the press
      // failed — whether the in-page route ran at all, or found no button.
      log(res ? `in-page press: ${res.ok ? res.how : `failed (${res.how ?? "no result"})`}` : "in-page press: worker unavailable", res?.ok === true);
      if (!res?.ok) realClick(btn);
      await sleep(1800);
      if (isApplyContext()) return;
    }

    // KEEP the intent rather than clearing it. The message below tells the user
    // to press Apply themselves, and the assist can only honour that promise if
    // the intent is still there when the form opens. The clock restarts so they
    // get the full window; the listing is already pinned to this job.
    await setItem("autoApply", { at: Date.now(), link: stamp.link });
    failBusy("Couldn't press Apply for you. Press “Apply with Indeed” yourself — the assist takes over as soon as the form opens.");
  })();
  panel.querySelector("#aaui-cancel")!.addEventListener("click", () => {
    sendToWorker({ type: "cancel-run" }).then(() => log("run cancelled"));
  });

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

    switch (msg.command) {
      case "scan": {
        const found = scanPage();
        // Report job identity from EVERY page, form or not. The step naming the
        // employer is often one with no questions on it (the listing pane, or
        // the post-submit page), and that data used to be thrown away because it
        // could only ride along with a scan-result.
        const job = captureJobMeta();
        if (job.title || job.company) {
          sendToWorker({ type: "job-meta", runId: msg.runId, job });
        }
        // Stay silent when this frame has no form so a sibling frame — or the
        // controller's no-form timeout — decides. An empty reply would be read
        // as "flow complete".
        if (found.length > 0) {
          sendToWorker({ type: "scan-result", runId: msg.runId, questions: found, job });
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
}

// ─── DOM fill ─────────────────────────────────────────────────────────────────
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

/** Resolve once the browser has painted and React has had a chance to commit. */
function settled(): Promise<void> {
  return new Promise((r) =>
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 40))),
  );
}

/**
 * Verify a fill AFTER React settles rather than same-tick. React commits state
 * asynchronously, so reading `el.value` immediately can report a value that a
 * re-render then throws away — the fill looks successful and silently isn't.
 * Re-read once the frame has settled and, if the value is gone, re-apply a
 * single time before reporting failure.
 */
async function stickValue(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  want: string,
): Promise<boolean> {
  await settled();
  if (el.value === want) return true;
  setNativeValue(el, want);
  await settled();
  return el.value === want;
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
  { key: "priorJobTitle", label: "Most recent job title" },
  { key: "priorJobCompany", label: "Most recent employer" },
  { key: "priorJobDuration", label: "Time at most recent job", placeholder: "e.g. 3 years" },
  { key: "timeZone", label: "Time zone", placeholder: "e.g. Eastern" },
  { key: "preferredDay", label: "Preferred interview day", placeholder: "e.g. Monday" },
  { key: "preferredTime", label: "Preferred interview time", placeholder: "e.g. Morning" },
  { key: "searchQuery", label: "Search: job title or keywords", placeholder: "e.g. production technician" },
  { key: "searchLocation", label: "Search: location", placeholder: "blank searches everywhere" },
  { key: "maxApplications", label: "Max applications per session", placeholder: "e.g. 5" },
  { key: "exclusionTitleRegex", label: "Skip titles matching", placeholder: "e.g. senior|manager" },
  { key: "referralCompanies", label: "Employers who referred you", placeholder: "Byrne Dairy: Bob Jones; Acme: Sue Lee" },
  { key: "relativeCompanies", label: "Employers where you know someone", placeholder: "Byrne Dairy: Jane Smith" },
];

/** Merge the user's template overrides onto DEFAULT_CONFIG (blanks ignored). */
function mergedConfig(template: AnswerTemplate | null): ScoutConfig {
  const cfg = { ...DEFAULT_CONFIG } as Record<string, unknown>;
  for (const [k, v] of Object.entries(template?.config ?? {})) {
    if (v != null && String(v).trim() !== "") cfg[k] = v;
  }
  return cfg as unknown as ScoutConfig;
}

// ─── Referral matching ────────────────────────────────────────────────────────
// "Were you referred?" and "do you have relatives here?" depend on WHICH
// employer you're applying to, so the user lists their contacts once in the
// template and we match the current listing's company against that list.

interface Contact {
  company: string;
  name: string;
}

/** Parse "Employer: Person" entries, one per line (";" also separates). */
function parseContacts(raw: string | undefined): Contact[] {
  if (!raw) return [];
  return raw
    .split(/[\n;]+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // ":" first — company names contain hyphens, so only a SPACED hyphen
      // counts as a separator ("Byrne-Dairy - Bob Jones").
      const m = /^([^:]+):\s*(.*)$/.exec(line) ?? /^(.+?)\s+[-–]\s+(.*)$/.exec(line);
      return m ? { company: m[1].trim(), name: m[2].trim() } : { company: line, name: "" };
    })
    .filter((c) => c.company.length > 0);
}

const COMPANY_NOISE = /\b(inc|llc|ltd|limited|corp|corporation|company|co|group|holdings|plc|the)\b/g;

/** Strip case, punctuation and legal suffixes so "Byrne Dairy, Inc." == "byrne dairy". */
function normalizeCompany(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(COMPANY_NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Find the user's contact at this employer, if any. */
function matchContact(list: Contact[], company: string | null): Contact | null {
  const target = normalizeCompany(company ?? "");
  if (!target) return null;
  for (const c of list) {
    const n = normalizeCompany(c.company);
    if (!n) continue;
    if (n === target) return c;
    // Loose containment only for names long enough that a partial hit isn't a
    // coincidence — "co" or "abc" would otherwise match half the internet.
    if (n.length >= 4 && (target.includes(n) || n.includes(target))) return c;
  }
  return null;
}

// ─── Resume attachment ────────────────────────────────────────────────────────
// `input.files` is read-only, so a resume can't be assigned directly. The only
// programmatic path is to build a DataTransfer, add a File to it, and hand the
// page its FileList — then fire change so the site's own handler runs.

const MAX_RESUME_BYTES = 4 * 1024 * 1024;

/** Rebuild a File from the base64 bytes held in chrome.storage. */
function resumeToFile(r: StoredResume): File {
  const bin = atob(r.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], r.name, { type: r.type || "application/octet-stream" });
}

/** base64-encode in chunks — spreading megabytes into fromCharCode blows the stack. */
function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/**
 * Attach the saved resume to a file input on this page. Returns null when the
 * page has no eligible input — that's the common case, not a failure, so the
 * caller stays quiet about it. Hidden inputs are fair game: sites routinely
 * hide the real input behind a styled label.
 */
async function attachResumeDom(resume: StoredResume): Promise<{ ok: boolean; detail: string } | null> {
  const target = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]')).find((el) => {
    if (el.disabled) return false;
    if ((el.files?.length ?? 0) > 0) return false; // already carries a file
    const accept = (el.accept || "").toLowerCase();
    // An `accept` naming only images is a photo upload, not a resume slot.
    return !accept || !/^[\s,]*image\//.test(accept);
  });
  if (!target) return null;

  try {
    const dt = new DataTransfer();
    dt.items.add(resumeToFile(resume));
    target.files = dt.files;
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    await settled();
    const ok = (target.files?.length ?? 0) > 0;
    return { ok, detail: ok ? `attached ${resume.name}` : "the file input rejected the attachment" };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
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
  const meta = (name: string): string | null => {
    const el = document.querySelector<HTMLMetaElement>(
      `meta[property="${name}"], meta[name="${name}"]`,
    );
    const c = el?.content?.trim();
    return c && c.length > 0 && c.length < 200 ? c : null;
  };
  let title =
    pick('[data-testid*="jobTitle" i]') ||
    pick('[data-testid*="job-title" i]') ||
    pick('[data-testid="jobsearch-JobInfoHeader-title"]') ||
    pick('[class*="JobInfoHeader-title" i]') ||
    pick('[class*="jobTitle" i]') ||
    pick("h1") ||
    meta("og:title");
  let company =
    pick('[data-testid*="companyName" i]') ||
    pick('[data-testid*="company-name" i]') ||
    pick('[data-testid*="employerName" i]') ||
    pick('[data-testid="inlineHeader-companyName"]') ||
    pick('[data-company-name]') ||
    pick('[class*="CompanyInfoContainer" i] a') ||
    pick('[class*="companyName" i]') ||
    // Indeed links an employer's profile at /cmp/<company>; on the apply flow's
    // job card that link is often the only place the name is marked up at all.
    pick('a[href*="/cmp/"]');

  // Last resort: Indeed's document.title reads "<job> - <company> - Indeed.com",
  // and the smartapply flow keeps that shape even where the header markup is
  // gone. Anything still missing is filled in by the user on the log card.
  if (!title || !company) {
    const parts = document.title
      .split(/\s+[-–|]\s+/)
      .map((s) => s.trim())
      .filter((s) => s && !/^indeed(\.com)?$/i.test(s) && !/^(apply|job application)\b/i.test(s));
    if (!title && parts[0]) title = parts[0];
    if (!company && parts[1]) company = parts[1];
  }

  const jobLink = document.querySelector<HTMLAnchorElement>('a[href*="/viewjob"], a[href*="/rc/clk"]');
  const url = jobLink?.href || location.href;
  return { title: title ?? null, company: company ?? null, url };
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

/**
 * Promote a button to the panel's primary action. Continue is pressed on every
 * page of every application, so it gets a large target rather than sharing the
 * secondary buttons' 6px padding.
 */
function makePrimary(b: HTMLButtonElement): HTMLButtonElement {
  b.style.padding = "14px 10px";
  b.style.fontSize = "15px";
  b.style.fontWeight = "700";
  b.style.borderRadius = "8px";
  return b;
}

function mkBtn(label: string, bg: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = label;
  b.style.cssText = `flex:1;padding:10px 8px;font-size:13px;border:0;border-radius:6px;background:${bg};color:#fff;cursor:pointer;font-family:inherit`;
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

/** Does the live form mark this question as required? Indeed appends a trailing
 * "*" to the label; native `required` / `aria-required` are the stronger signal
 * when present. Best-effort — a false negative just restores today's behaviour. */
function isFieldRequired(q: FormField): boolean {
  if (q.text.trim().endsWith("*")) return true;
  const els: (Element | null)[] =
    q.type === "radio" || q.type === "checkbox"
      ? q.options.map((o) => realOptionEl(q, o))
      : q.type === "select"
        ? [realSelectEl(q)]
        : q.type === "combobox"
          ? [realComboboxEl(q)]
          : [realTextEl(q)];
  return els.some(
    (el) => !!el && ((el as HTMLInputElement).required === true || el.getAttribute("aria-required") === "true"),
  );
}

/** Is this question currently answered on the real form? */
function isFieldAnswered(q: FormField): boolean {
  switch (q.type) {
    case "radio":
    case "checkbox":
      return q.options.some((o) => realOptionEl(q, o)?.checked);
    case "select":
      return !!realSelectEl(q)?.value;
    case "combobox": {
      const t = (realComboboxEl(q)?.innerText || "").trim();
      return !!t && !/select an option/i.test(t);
    }
    default:
      return !!realTextEl(q)?.value?.trim();
  }
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
      // Re-read after the frame settles — a controlled checkbox can be reverted
      // by a re-render. Never re-click to fix it: a second click would toggle
      // it back off.
      await settled();
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
      const held = await stickValue(el, match.value);
      return {
        ok: held,
        detail: held ? `selected "${match.label}"` : `selection did NOT stick for "${match.label}"`,
      };
    }

    // Text-like fields.
    const el = (field.inputId
      ? document.getElementById(field.inputId)
      : field.inputName
        ? document.querySelector(`input[name="${CSS.escape(field.inputName)}"], textarea[name="${CSS.escape(field.inputName)}"]`)
        : null) as HTMLInputElement | HTMLTextAreaElement | null;
    if (!el) return { ok: false, detail: "input not found" };
    // A Yes/No rule can land on a free-text box — employers ask the same
    // question as radios on one form and a textarea on the next. Type the
    // keyword rather than the raw `__RADIO:No` marker.
    const text = answer.startsWith("__RADIO:")
      ? (answer.slice(8).split(",")[0] ?? "").trim()
      : answer;
    if (!text) return { ok: false, detail: "no answer to fill" };
    el.focus();
    setNativeValue(el, text);
    el.dispatchEvent(new Event("blur", { bubbles: true }));
    const stuck = await stickValue(el, text);
    return { ok: stuck, detail: stuck ? `filled "${text}"` : "value did NOT stick (React reverted it)" };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}

// ─── Advance-button finder ─────────────────────────────────────────────────────

/** How long an "Apply to this job" intent stays good for, across 2 navigations. */
const AUTO_APPLY_TTL_MS = 120_000;

/** Indeed's per-listing id, used to check a pending apply belongs to THIS page. */
function jobKeyOf(url: string): string | null {
  try {
    return new URL(url, location.href).searchParams.get("jk");
  } catch {
    return null;
  }
}

/**
 * Click, with the pointer and mouse sequence a real press produces around it.
 * Indeed's "Apply with Indeed" ignores a bare `.click()` — it listens further
 * down the event sequence — so the assist appeared to click and nothing moved.
 */
function realClick(el: HTMLElement): void {
  const init: MouseEventInit = { bubbles: true, cancelable: true, view: window };
  const press = (t: HTMLElement) => {
    t.dispatchEvent(new PointerEvent("pointerdown", init));
    t.dispatchEvent(new MouseEvent("mousedown", init));
    t.dispatchEvent(new PointerEvent("pointerup", init));
    t.dispatchEvent(new MouseEvent("mouseup", init));
    t.click();
  };
  press(el);
  // Indeed's listener sits on a wrapper while the visible control is a nested
  // <button>; press both so it doesn't matter which one owns the handler.
  const inner = el.querySelector<HTMLElement>('button, [role="button"]');
  if (inner && inner !== el) press(inner);
}

/**
 * Indeed's own "Apply with Indeed" button — the one that OPENS an application.
 * Deliberately separate from findAdvanceDom: this is only ever pressed when the
 * user explicitly chose a job, never while hunting for a way to advance a page.
 */
function findIndeedApplyDom(): HTMLElement | null {
  // Indeed attaches its click handler to a WRAPPER SPAN, not to the button:
  //   <span class="… indeed-apply-status-not-applied" data-click-handler="attached">
  //     <button aria-label="Apply with Indeed"> … </button>
  //   </span>
  // Those two hooks are stable, while the button's id and its css-* classes are
  // hashed per build. Prefer the wrapper so the press lands on the listener.
  const wrapper = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[class*="indeed-apply-status-not-applied"], [data-click-handler="attached"]',
    ),
  ).find((el) => isVisibleEnabled(el) && /apply with indeed/i.test(el.innerText || ""));
  if (wrapper) return wrapper;

  // Fallback: the button itself, matched on its text/aria-label.
  for (const el of document.querySelectorAll<HTMLElement>('button, a[role="button"], [role="button"]')) {
    if (!isVisibleEnabled(el)) continue;
    const text = (el.innerText || el.getAttribute("aria-label") || "").trim();
    if (!text || text.length > 40) continue;
    if (/\bapplied\b/i.test(text)) continue;
    if (/^apply\b|\bapply with indeed\b|\bapply now\b/i.test(text)) return el;
  }
  return null;
}

// "apply" deliberately absent: inside the application flow the advance buttons
// say Continue / Review / Submit, while "Apply with Indeed" is the button that
// STARTS an application. Matching it meant a stray scan could begin applying to
// whatever job was on screen.
const POSITIVE_RE = /\b(review|continue|submit|next|proceed|advance|finish|send)\b/i;
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
