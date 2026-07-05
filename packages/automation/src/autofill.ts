// Auto-fill rules + resume suggestions — ported VERBATIM from
// automation/scout.js L129-256. The rules are ordered `if` statements and the
// ORDER IS LOAD-BEARING (e.g. relocate/commute must be checked before the
// zip/city text matchers; first/last name before the generic name catch-all).
// Do not reorder, do not data-drive. Return conventions:
//   `__RADIO:<csv keywords>` — radio/select match
//   plain string             — text fill
//   `__SKIP__`               — skip field
//   null                     — fall through to resume suggestion, then human

import type { ScoutConfig } from "./config.js";

export function makeAutoFillAnswer(config: ScoutConfig) {
  return function getAutoFillAnswer(questionText: string): string | null {
    const lower = questionText.toLowerCase();

    if (lower.includes("day")) return `__RADIO:${config.preferredDay}`;
    if (lower.includes("time") && !lower.includes("time zone") && !lower.includes("timezone")) return `__RADIO:${config.preferredTime}`;

    // Contact-info page (Indeed's first application step). These come from the
    // config so the bot no longer stalls on required-but-empty name/phone
    // fields. "first name" / "last name" checks run before the generic name
    // catch-all so they win. Returns "" (falsy) when the config value is blank,
    // which lets the per-question prompt / resume suggestion take over.
    if (lower.includes("first name") || lower.includes("given name") || lower.includes("firstname")) return config.firstName;
    if (lower.includes("last name") || lower.includes("family name") || lower.includes("surname") || lower.includes("lastname")) return config.lastName;
    if (lower.includes("full name") || lower === "name" || lower === "name *" || lower.includes("your name") || lower.includes("legal name")) return `${config.firstName} ${config.lastName}`.trim();
    if (lower.includes("phone") || lower.includes("mobile") || lower.includes("contact number") || lower.includes("telephone") || lower.includes("cell")) return config.phone;

    // PRIORITY: Relocate / Commute MUST be checked before any location-text
    // rules below. A question like "Will you relocate to this city?" should
    // resolve to a Yes/No radio (`__RADIO:Yes`), NOT trigger the city-text
    // matcher which would type the user's full city string into a radio group.
    if (lower.includes("relocate") || lower.includes("relocation") || lower.includes("willing to relocate") || lower.includes("commute")) return `__RADIO:${config.willingToRelocate}`;

    if (lower.includes("zip") || lower.includes("postal") || lower.includes("location-fields")) return config.zipCode;
    if (lower.includes("city")) return config.city;
    if (lower.includes("address")) return "__SKIP__";

    if (lower.includes("previously worked") || lower.includes("association with") || lower.includes("formerly employed")) return "__RADIO:No";

    if (lower.includes("authorized to work") || lower.includes("legal authorization") || lower.includes("legally authorized") || lower.includes("right to work") || lower.includes("eligibility to work") || lower.includes("eligible to work")) return `__RADIO:${config.authorizedToWork}`;
    if (lower.includes("sponsorship") || lower.includes("sponsor")) return `__RADIO:${config.needsSponsorship}`;
    if (lower.includes("citizen") || lower.includes("citizenship")) return `__RADIO:${config.usCitizen}`;

    if (lower.includes("veteran") || lower.includes("protected vet")) return `__RADIO:${config.veteranStatus}`;
    if (lower.includes("disability") || lower.includes("disabled")) return `__RADIO:${config.disabilityStatus}`;

    if (lower.includes("18 years") || lower.includes("18 or older") || lower.includes("at least 18")) return `__RADIO:${config.is18OrOlder}`;
    if (lower.includes("high school") || lower.includes("diploma") || lower.includes("ged")) return `__RADIO:${config.hasDiploma}`;
    if (lower.includes("highest level of education") || lower.includes("level of education") || lower.includes("education level")) return `__RADIO:${config.educationLevel}`;

    if (lower.includes("driving")) return `__RADIO:${config.drivingLicense}`;
    if (lower.includes("driver's license") || lower.includes("drivers license") || (lower.includes("driver") && lower.includes("license"))) return `__RADIO:${config.drivingLicense}`;

    if (lower.includes("currently located") || lower.includes("current location") || lower.includes("where are you located")) return config.city;

    if (lower.includes("salary") || lower.includes("pay expectation") || lower.includes("desired pay") || lower.includes("compensation") || lower.includes("expected pay")) return config.salary;

    if (lower.includes("laboratory") && (lower.includes("experience") || lower.includes("years"))) return config.yearsExperience;
    if (lower.includes("how many years") || (lower.includes("years") && lower.includes("experience") && !lower.includes("do you have"))) return config.yearsExperience;

    if (lower.includes("time zone") || lower.includes("timezone")) return config.timeZone;

    if (lower.includes("linkedin")) return config.linkedin;

    // Prior employment questions — only fire when the question text references
    // a previous/most-recent role, so we don't hijack generic "job title" /
    // "company" fields meant for the application itself.
    const isPriorContext = (lower.includes("previous") || lower.includes("prior") ||
      lower.includes("last") || lower.includes("most recent") || lower.includes("recent")) ||
      lower.includes("former");
    if (isPriorContext) {
      if (lower.includes("title") || lower.includes("position") || lower.includes("role")) {
        return config.priorJobTitle || null;
      }
      if (lower.includes("employer") || lower.includes("company") || lower.includes("organization") || lower.includes("workplace")) {
        return config.priorJobCompany || null;
      }
      if (lower.includes("how long") || lower.includes("duration") || lower.includes("tenure") || lower.includes("years at") || lower.includes("time at")) {
        return config.priorJobDuration || null;
      }
    }

    return null;
  };
}

export function makeSuggestFromResume(getResumeContext: () => string) {
  return function suggestFromResume(questionText: string): string | null {
    const resumeContext = getResumeContext();
    if (!resumeContext) return null;
    const lower = questionText.toLowerCase();
    const lines = resumeContext.split("\n").map((l) => l.trim()).filter(Boolean);

    // Name and email are sourced from the UI Profile (full name) and the
    // user's Indeed account — resume-grep was redundant and occasionally
    // returned the wrong line (e.g., a header that wasn't the user's name).
    // Removed 2026-04-30. Phone/education/GPA/years/skills retained.

    if (lower.includes("phone") || lower.includes("mobile") || lower.includes("contact number")) {
      const phoneMatch = resumeContext.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
      if (phoneMatch) return phoneMatch[0];
    }

    if (lower.includes("degree") || lower.includes("education") || lower.includes("university") || lower.includes("school") || lower.includes("college") || lower.includes("major")) {
      const eduKeywords = ["bachelor", "master", "ph.d", "b.s.", "m.s.", "b.a.", "m.a.", "associate", "university", "college", "degree"];
      for (const line of lines) {
        if (eduKeywords.some((kw) => line.toLowerCase().includes(kw))) return line;
      }
    }
    if (lower.includes("gpa") || lower.includes("grade point")) {
      const gpaMatch = resumeContext.match(/(?:GPA|gpa)[:\s]*(\d+\.\d+)/i);
      if (gpaMatch) return gpaMatch[1];
    }

    if (lower.includes("years") && (lower.includes("experience") || lower.includes("work"))) {
      const yrMatch = resumeContext.match(/(\d+)\+?\s*years?\s*(of\s*)?experience/i);
      if (yrMatch) return yrMatch[1];
    }

    if (lower.includes("skill") || lower.includes("qualification") || lower.includes("proficien")) {
      const skillKeywords = ["skills", "proficien", "competenc", "technologies"];
      for (let i = 0; i < lines.length; i++) {
        if (skillKeywords.some((kw) => lines[i].toLowerCase().includes(kw))) {
          return lines.slice(i, i + 3).join(", ");
        }
      }
    }

    const questionWords = lower.split(/\s+/).filter((w) => w.length > 4 && !["what", "your", "this", "that", "have", "does", "with", "from", "would", "please", "enter"].includes(w));
    for (const line of lines) {
      const lineLower = line.toLowerCase();
      const matchCount = questionWords.filter((w) => lineLower.includes(w)).length;
      if (matchCount >= 2) return line;
    }

    return null;
  };
}
