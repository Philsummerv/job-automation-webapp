// Reads an application form into a flat list of questions. Server-only, but
// scanFormInPage itself runs INSIDE the browser page (page.evaluate), so it
// must stay self-contained: no imports, no closures over module scope.
//
// Each question's element gets a data-ja attribute ("f0", "f1", ...) so the
// filler can find it again without re-deriving labels. Old tags are wiped
// first, so scanning twice is safe.
//
// Boards handled: Greenhouse embed (react-select comboboxes), Lever (radio
// groups, native selects), Ashby (no <form> tag; yes/no questions are two
// buttons with data-option plus a hidden checkbox).

export type FieldKind =
  | "text"
  | "textarea"
  | "select"
  | "radio"
  | "checkbox"
  | "file"
  | "combobox";

export interface ScannedField {
  /** Matches the element's data-ja attribute. */
  id: string;
  kind: FieldKind;
  label: string;
  required: boolean;
  /** For select / radio / checkbox groups: the visible choices. */
  options: string[];
  /** input type / name / autocomplete hints, for the deterministic matcher. */
  hint: string;
}

export function scanFormInPage(): ScannedField[] {
  const clean = (s: string | null | undefined) =>
    (s ?? "").replace(/[✱*]/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);

  // A label's own words, without the text of controls or status messages
  // nested inside it (Lever wraps whole fields, options and all, in <label>).
  const ownText = (node: Element | null): string => {
    if (!node) return "";
    const c = node.cloneNode(true) as Element;
    c.querySelectorAll("select, option, input, textarea, button, [role='listbox'], [aria-live], [class*='hidden' i], [class*='error' i], [class*='loading' i]").forEach((x) => x.remove());
    // Prefer an explicit label/question element inside the wrapper.
    const inner = c.querySelector("[class*='label' i], [class*='question' i]");
    return clean(inner && clean(inner.textContent) ? inner.textContent : c.textContent);
  };

  const visible = (el: Element) => {
    const h = el as HTMLElement;
    if (h.closest("[hidden],[aria-hidden='true']")) return false;
    const st = getComputedStyle(h);
    if (st.display === "none" || st.visibility === "hidden") return false;
    const r = h.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const textOf = (id: string | null) => {
    if (!id) return "";
    return id
      .split(/\s+/)
      .map((x) => document.getElementById(x)?.textContent ?? "")
      .join(" ");
  };

  const labelFor = (el: HTMLElement): string => {
    const byAria = textOf(el.getAttribute("aria-labelledby"));
    if (clean(byAria)) return clean(byAria);
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l && ownText(l)) return ownText(l);
    }
    const wrap = el.closest("label");
    if (wrap && ownText(wrap)) return ownText(wrap);
    const aria = el.getAttribute("aria-label");
    if (clean(aria)) return clean(aria);
    // Nearest field wrapper with a label/legend in it.
    let p: HTMLElement | null = el.parentElement;
    for (let i = 0; p && i < 5; i++, p = p.parentElement) {
      const l = p.querySelector("label, legend, [class*='label' i]");
      if (l && l !== el && ownText(l)) return ownText(l);
    }
    return clean(el.getAttribute("placeholder") || el.getAttribute("name"));
  };

  const groupLabel = (el: HTMLElement): string => {
    const fs = el.closest("fieldset");
    const legend = fs?.querySelector("legend");
    if (legend && clean(legend.textContent)) return clean(legend.textContent);
    const group = el.closest("[role='radiogroup'],[role='group']");
    if (group) {
      const t = clean(textOf(group.getAttribute("aria-labelledby")) || group.getAttribute("aria-label"));
      if (t) return t;
    }
    // Climb until a wrapper holds a label-ish element that isn't one of the options.
    let p: HTMLElement | null = el.parentElement;
    for (let i = 0; p && i < 6; i++, p = p.parentElement) {
      const cand = Array.from(p.querySelectorAll("label, legend, [class*='label' i], [class*='question' i], h3, h4, p"))
        .find((x) => !x.querySelector("input") && !x.contains(el) && clean(x.textContent).length > 3);
      if (cand) return ownText(cand);
    }
    return clean(el.getAttribute("name"));
  };

  const isRequired = (el: HTMLElement, label: string) =>
    (el as HTMLInputElement).required ||
    el.getAttribute("aria-required") === "true" ||
    /\*$/.test((el.closest("div,fieldset")?.textContent ?? "").split("\n")[0] ?? "") ||
    /[*✱]/.test(el.closest("label, fieldset, [class*='field' i]")?.textContent ?? "");

  // A file input's own label is often just "Attach" or "Upload". Climb to the
  // field's real question ("Resume/CV", "Cover Letter").
  const fileLabel = (el: HTMLElement): string => {
    const weak = (t: string) =>
      !t || /^(attach|upload|browse|choose|select|drop|or drag|enter manually|dropbox|google drive|paste)/i.test(t);
    // Ashby's "Autofill from resume" box sits outside the real fields. Climb
    // until a wrapper holds other questions; if the text so far says
    // "autofill", that's what this input is.
    let a: HTMLElement | null = el.parentElement;
    for (let i = 0; a && i < 8; i++, a = a.parentElement) {
      if (a.querySelector("input:not([type='file']), textarea, select")) break;
      if (/autofill|auto-fill/i.test(a.textContent ?? "")) return "Autofill from resume";
    }
    const group = el.closest("[role='group'][aria-labelledby], [aria-labelledby*='upload' i]");
    if (group) {
      const t = clean(textOf(group.getAttribute("aria-labelledby")));
      if (!weak(t)) return t;
    }
    const own = labelFor(el);
    if (!weak(own)) return own;
    let p: HTMLElement | null = el.parentElement;
    for (let i = 0; p && i < 6; i++, p = p.parentElement) {
      const cand = Array.from(p.querySelectorAll("label, legend, [class*='label' i], h3, h4"))
        .map((x) => ownText(x))
        .find((t) => !weak(t) && t.length > 1);
      if (cand) return cand;
    }
    return own || clean(el.getAttribute("name"));
  };

  document.querySelectorAll("[data-ja]").forEach((e) => e.removeAttribute("data-ja"));
  document.querySelectorAll("[data-ja-group]").forEach((e) => e.removeAttribute("data-ja-group"));

  const out: ScannedField[] = [];
  let n = 0;
  const tag = (el: Element) => {
    const id = `f${n++}`;
    el.setAttribute("data-ja", id);
    return id;
  };
  const seenGroups = new Set<string>();

  // The application form is the <form> with the most fields; some pages also
  // have a search or newsletter form.
  // Ashby has no <form>; fall back to the whole page.
  const forms = Array.from(document.querySelectorAll("form"));
  const form =
    forms.sort((a, b) => b.querySelectorAll("input, textarea, select").length - a.querySelectorAll("input, textarea, select").length)[0] ??
    document.body;
  const els = Array.from(
    form.querySelectorAll<HTMLElement>("input, textarea, select, [role='combobox'], button[data-option]"),
  );

  for (const el of els) {
    if (el.hasAttribute("data-ja")) continue;
    const t = el.tagName.toLowerCase();
    const type = (el.getAttribute("type") || "").toLowerCase();
    if (t !== "button" && ["hidden", "submit", "button", "reset", "image", "search"].includes(type)) continue;
    // Phone-number country pickers (intl-tel-input) and other widgets inside a dialog.
    if (el.closest("[role='dialog'], .iti__dropdown-content")) continue;

    // Ashby yes/no: <button data-option="yes">, <button data-option="no">, and a
    // hidden checkbox that mirrors the choice. Treat the buttons as a radio group.
    if (t === "button") {
      const box = el.parentElement;
      if (!box || box.hasAttribute("data-ja-group")) continue;
      box.setAttribute("data-ja-group", "1");
      const members = Array.from(box.querySelectorAll<HTMLElement>(":scope > button[data-option]"));
      if (!members.length || !visible(el)) continue;
      const id = `f${n++}`;
      members.forEach((m, i) => m.setAttribute("data-ja", `${id}.${i}`));
      box.querySelectorAll("input").forEach((x) => x.setAttribute("data-ja", `${id}.hidden`));
      const wrap = box.closest("[data-field-path]") ?? box.parentElement;
      const label = wrap ? ownText(wrap.querySelector("label") ?? wrap) : groupLabel(el);
      out.push({
        id,
        kind: "radio",
        label,
        required: /[*✱]/.test(wrap?.querySelector("label")?.textContent ?? "") || !!wrap?.querySelector("[required]"),
        options: members.map((m) => clean(m.textContent)),
        hint: "buttons yesno",
      });
      continue;
    }

    if (t === "input" && type === "file") {
      // File inputs are usually hidden behind an "Attach" button; don't require visibility.
      const label = fileLabel(el);
      out.push({ id: tag(el), kind: "file", label, required: isRequired(el, label), options: [], hint: `file ${el.getAttribute("name") ?? ""} ${el.id}` });
      continue;
    }

    if (t === "input" && (type === "radio" || type === "checkbox")) {
      // Hidden helper inputs (tabindex -1, not shown) aren't questions.
      if (el.getAttribute("tabindex") === "-1" && !visible(el) && !el.closest("label")) continue;
      const name = el.getAttribute("name") || "";
      const key = `${type}:${name || el.id}`;
      if (name && seenGroups.has(key)) continue;
      seenGroups.add(key);
      const members = name
        ? Array.from(form.querySelectorAll<HTMLInputElement>(`input[type='${type}'][name="${CSS.escape(name)}"]`))
        : [el as HTMLInputElement];
      const options = members.map((m) => labelFor(m));
      // A lone checkbox ("I agree...") is its own question.
      const single = type === "checkbox" && members.length === 1;
      const label = single ? labelFor(el) : groupLabel(el);
      const id = `f${n++}`;
      members.forEach((m, i) => m.setAttribute("data-ja", `${id}.${i}`));
      out.push({
        id,
        kind: type as "radio" | "checkbox",
        label,
        required: members.some((m) => m.required) || isRequired(el, label),
        options: single ? ["(check this box)"] : options,
        hint: `${type} ${name}`,
      });
      continue;
    }

    if (!visible(el)) continue;

    if (t === "select") {
      const sel = el as HTMLSelectElement;
      const label = labelFor(el);
      out.push({
        id: tag(el),
        kind: "select",
        label,
        required: isRequired(el, label),
        options: Array.from(sel.options).map((o) => clean(o.textContent)).filter((o) => o && !/^(select|choose|--)/i.test(o)),
        hint: `select ${sel.name} ${sel.id}`,
      });
      continue;
    }

    if (el.getAttribute("role") === "combobox" || (t === "input" && el.getAttribute("aria-autocomplete"))) {
      const label = labelFor(el);
      out.push({ id: tag(el), kind: "combobox", label, required: isRequired(el, label), options: [], hint: `combobox ${el.getAttribute("name") ?? ""} ${el.id}` });
      continue;
    }

    if (t === "textarea" || t === "input") {
      const label = labelFor(el);
      out.push({
        id: tag(el),
        kind: t === "textarea" ? "textarea" : "text",
        label,
        required: isRequired(el, label),
        options: [],
        hint: `${type || "text"} ${el.getAttribute("name") ?? ""} ${el.id} ${el.getAttribute("autocomplete") ?? ""}`,
      });
    }
  }
  return out.filter((f) => f.label || f.kind === "file");
}
