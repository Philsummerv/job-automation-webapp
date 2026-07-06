// Config defaults — ported from the desktop app (automation/scout.js L20-54).
// Dropped: notionKey/notionDatabaseId (replaced by onActivity), userDataDir +
// browserWindow (no local profile/window in cloud mode).
// Added: resumeFile — in-memory PDF payload so uploads work against a REMOTE
// browser (a local path would resolve on the wrong machine over CDP).

export interface ResumeFile {
  name: string;
  mimeType: string;
  // Uint8Array (not Buffer) so this type is loadable in browser contexts
  // (the extension imports this module); Node Buffers satisfy it directly.
  buffer: Uint8Array;
}

export interface ScoutConfig {
  searchQuery: string;
  searchLocation: string;
  firstName: string;
  lastName: string;
  phone: string;
  zipCode: string;
  city: string;
  salary: string;
  yearsExperience: string;
  educationLevel: string;
  willingToRelocate: string;
  preferredDay: string;
  preferredTime: string;
  linkedin: string;
  timeZone: string;
  priorJobTitle: string;
  priorJobCompany: string;
  priorJobDuration: string;
  authorizedToWork: string;
  needsSponsorship: string;
  usCitizen: string;
  is18OrOlder: string;
  hasDiploma: string;
  drivingLicense: string;
  veteranStatus: string;
  disabilityStatus: string;
  resumePath: string | null;
  resumeFile?: ResumeFile | null;
  twoCaptchaApiKey: string | null;
  maxApplications: number;
  exclusionTitleRegex: string;
}

export const DEFAULT_CONFIG: ScoutConfig = {
  searchQuery: '"Chemistry"',
  searchLocation: "",
  firstName: "",
  lastName: "",
  phone: "",
  zipCode: "",
  city: "",
  salary: "70000",
  yearsExperience: "4",
  educationLevel:
    "Bachelor of Science in Chemistry,Bachelor's,Bachelor,Bachelors,B.S.,BS,BA,B.A.",
  willingToRelocate: "Yes",
  preferredDay: "Monday",
  preferredTime: "Afternoon",
  linkedin: "",
  timeZone: "EST",
  priorJobTitle: "",
  priorJobCompany: "",
  priorJobDuration: "",
  authorizedToWork: "Yes",
  needsSponsorship: "No",
  usCitizen: "Yes",
  is18OrOlder: "Yes",
  hasDiploma: "Yes",
  drivingLicense: "Yes",
  veteranStatus: "not a protected veteran,no,i am not,decline",
  disabilityStatus:
    "don't have a disability,do not have a disability,no,i do not wish to answer,decline",
  resumePath: null,
  resumeFile: null,
  twoCaptchaApiKey: null,
  maxApplications: 1,
  exclusionTitleRegex: "\\b(teacher|instructor|faculty|professor)\\b",
};
