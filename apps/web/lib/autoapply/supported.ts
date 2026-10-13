// Client-safe check for "Apply for me". Pure string test, no server imports,
// so client components (JobsCard inside JobsList) can use it.
//
// Mirrors canAutoApply() in ./targets.ts, which is the real gate on the
// server. Keep the two in step: Greenhouse, Lever and Ashby only.

const AUTO_APPLY_ID = /^(greenhouse|lever|ashby):[\w.-]{1,100}:[\w.-]{1,200}$/;

export function isAutoApplyJobId(jobId: string): boolean {
  return typeof jobId === "string" && jobId.length <= 300 && AUTO_APPLY_ID.test(jobId);
}
