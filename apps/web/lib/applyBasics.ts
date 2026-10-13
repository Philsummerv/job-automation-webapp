import type { Profile, ResumeProfile } from "@jobassistui/shared";
import type { ApplyResumeBasics } from "@/app/(app)/apply/ApplyKitBuilder";

/** Resume facts the apply kit's .txt download needs, from the saved resume. */
export function toApplyBasics(p: ResumeProfile, profile: Profile): ApplyResumeBasics {
  return {
    name: p.name || profile.full_name || "",
    email: p.email || "",
    phone: p.phone || "",
    location: p.locations?.[0] || "",
    certifications: p.certifications ?? [],
    education: (p.education ?? []).map((e) => ({
      school: e.school,
      credential: e.credential,
      dates: e.dates ?? "",
    })),
  };
}
