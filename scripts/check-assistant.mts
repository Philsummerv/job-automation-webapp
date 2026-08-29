// Throwaway verification of the Rules Assistant safety logic.
import {
  checkRefusal,
  answerFromCheckedData,
  capQuestion,
} from "../apps/web/lib/assistant";
import { TOPICS, MAX_QUOTE_LEN, FACTS } from "@jobassistui/shared";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("\n1. Refusal list fires on the dangerous questions");
const mustRefuse: [string, string][] = [
  ["will i qualify for benefits", "eligibility"],
  ["am I eligible if I quit", "eligibility"],
  ["how much will I get each week", "amount"],
  ["what is my weekly benefit amount", "amount"],
  ["how do I appeal a denial", "appeal"],
  ["they say I was overpaid", "overpayment"],
  ["I'm being investigated for fraud", "fraud"],
  ["what does this determination letter mean", "determination"],
];
for (const [q, expected] of mustRefuse) {
  const got = checkRefusal(q);
  check(`"${q}" -> ${expected}`, got === expected, `got ${got}`);
}

console.log("\n2. Ordinary rules questions are NOT refused");
const mustPass = [
  "how many work search activities do I need",
  "what counts as a work search activity",
  "how long do I keep my records",
  "when do I certify",
  "do I have to register with the job service",
];
for (const q of mustPass) {
  const got = checkRefusal(q);
  check(`"${q}" passes`, got === null, `refused as ${got}`);
}

console.log("\n3. REGRESSION GUARD: no topic-button label trips the refusal list");
for (const t of TOPICS) {
  const got = checkRefusal(t.label);
  check(`button "${t.label}"`, got === null, `refused as ${got}`);
}

console.log("\n4. New York returns a real quote with a citation");
const ny = answerFromCheckedData("NY", "New York", "activity_count", "");
check("kind is checked", ny.kind === "checked", ny.kind);
check("has a body", Boolean(ny.body));
check("has a source", Boolean(ny.source));
check("source has a url", Boolean(ny.source?.url));
check("source has verified_on", Boolean(ny.source?.verified_on));
check("suggested target is 3", ny.suggested_weekly_target === 3, String(ny.suggested_weekly_target));
console.log(`     quote: "${ny.body?.slice(0, 70)}…"`);
console.log(`     source: ${ny.source?.display} (${ny.source?.verified_on})`);

console.log("\n5. Texas and Florida never produce a number");
for (const [abbr, name] of [["TX", "Texas"], ["FL", "Florida"]] as const) {
  const a = answerFromCheckedData(abbr, name, "activity_count", "");
  check(`${abbr} kind is varies`, a.kind === "varies", a.kind);
  check(`${abbr} has no suggested target`, a.suggested_weekly_target === undefined);
  check(`${abbr} has a lookup link`, Boolean(a.lookup?.url));
  const text = `${a.lead} ${a.body ?? ""}`;
  check(`${abbr} lead states no bare count`, !/\b\d+\s*(activities|per week|a week)\b/i.test(text), text);
}

console.log("\n6. Refusal beats everything, even with a valid topic");
const refused = answerFromCheckedData("NY", "New York", "activity_count", "will i qualify");
check("kind is refusal", refused.kind === "refusal", refused.kind);
check("no rules body leaked", refused.body === null);
check("no source leaked", refused.source === null);
check("phone is present", refused.contact.phone.length > 0);

console.log("\n7. Unknown state is honest, never a dead end");
const oh = answerFromCheckedData("OH", "Ohio", "activity_count", "");
check("kind is no_jurisdiction", oh.kind === "no_jurisdiction", oh.kind);
check("says so plainly", /haven't set up Ohio/i.test(oh.lead), oh.lead);

console.log("\n8. Known state, unchecked topic");
const nyGap = answerFromCheckedData("NY", "New York", "refusing_work", "");
check("kind is no_answer", nyGap.kind === "no_answer", nyGap.kind);
check("gives the NY phone", nyGap.contact.phone === "1-888-209-8124", nyGap.contact.phone);

console.log("\n9. Quotes stay screenshot-height");
for (const [abbr, sf] of Object.entries(FACTS)) {
  for (const f of sf.facts) {
    check(`${abbr}/${f.topic} <= ${MAX_QUOTE_LEN} chars`, f.text.length <= MAX_QUOTE_LEN, `${f.text.length}`);
  }
}

console.log("\n10. Input cap");
check("500 char cap", capQuestion("x".repeat(900)).length === 500);

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
