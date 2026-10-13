// Weekly work-search requirements by state, for regular state UI.
// Researched 2026-10-09. These are suggested defaults only; the user can change
// their target in Settings. Re-check sources before relying on them.

export interface StateWorkSearchRule {
  /** Two-letter code, e.g. "NY". */
  code: string;
  /** Minimum activities per week, or null when unknown or it varies too much to give one number. */
  perWeek: number | null;
  /** One short plain sentence shown to the user, e.g. "At least 3 work search activities each week." Mention variations. */
  note: string;
  /** Official source URL. */
  source: string;
  /** true if source is not an official state page. */
  secondary?: boolean;
}

export const STATE_WORK_SEARCH: Record<string, StateWorkSearchRule> = {
  AL: {
    code: "AL",
    perWeek: 3,
    note: "At least 3 work search contacts each week, unless the state tells you that you don't need to search.",
    source: "https://www.labor.alabama.gov/Message.aspx",
  },
  AK: {
    code: "AK",
    perWeek: 2,
    note: "At least 2 work search activities each week. If you live more than 55 road miles from a job center, it's 1.",
    source: "https://dol.alaska.gov/unemployment/work_search.htm",
  },
  AZ: {
    code: "AZ",
    perWeek: 4,
    note: "At least 4 work search contacts each week, each on a different day.",
    source: "https://des.az.gov/work-search",
  },
  AR: {
    code: "AR",
    perWeek: 5,
    note: "At least 5 work search activities each week. Only 1 job fair counts per week. The week runs Sunday to Saturday.",
    source: "https://dws.arkansas.gov/wp-content/uploads/UI-Handbook-2026-Final.pdf",
  },
  CA: {
    code: "CA",
    perWeek: null,
    note: "California has no set number. EDD sends you a notice with the rules for your claim.",
    source: "https://edd.ca.gov/en/unemployment/return-to-work/",
  },
  CO: {
    code: "CO",
    perWeek: 5,
    note: "Colorado recommends at least 5 work search activities each week. Your claim notice may give a different number.",
    source: "https://cdle.colorado.gov/unemployment/ui-claimant-guide/maintaining-your-ui-eligibility",
  },
  CT: {
    code: "CT",
    perWeek: 3,
    note: "At least 3 work search activities each week, and 1 must be an employer contact. Union hall members and people with a recall date may be exempt.",
    source: "https://portal.ct.gov/dol/unemployment-benefits/work-search/work-search-faqs",
  },
  DE: {
    code: "DE",
    perWeek: 1,
    note: "At least 1 new work search activity each week. Union hiring hall members and people with a recall date are exempt.",
    source:
      "https://labor.delaware.gov/divisions/unemployment-insurance/unemployment-benefits-faqs/works-search-frequently-asked-questions/",
  },
  DC: {
    code: "DC",
    perWeek: 2,
    note: "At least 2 work search contacts each week that can be checked. Union members placed by their union may be exempt.",
    source: "https://unemployment.dc.gov/page/work-search-requirements-0",
  },
  FL: {
    code: "FL",
    perWeek: 5,
    note: "At least 5 employer contacts each week. If your county has 75,000 people or fewer, it's 3.",
    source:
      "https://floridajobs.org/workforce-resources/reemployment-assistance/claimants/request-benefit-payment",
  },
  GA: {
    code: "GA",
    perWeek: 3,
    note: "At least 3 new job contacts each week, with employers you haven't contacted before.",
    source: "https://dol.georgia.gov/learn-about-work-search-requirements",
  },
  HI: {
    code: "HI",
    perWeek: 3,
    note: "At least 3 work search activities each week. The week ends on Saturday. Union members register through their union.",
    source: "https://labor.hawaii.gov/ui/faq/",
  },
  ID: {
    code: "ID",
    perWeek: 5,
    note: "At least 5 work search activities each week. Union members and some seasonal workers may be exempt.",
    source: "https://www.labor.idaho.gov/Unemployment-Benefits/Work-Search-Requirements/",
  },
  IL: {
    code: "IL",
    perWeek: null,
    note: "Illinois has no set weekly number. You must look for work every week and keep a log of your contacts.",
    source:
      "https://ides.illinois.gov/unemployment/resources/unemployment-insurance-benefit-handbook/ui-benefit-handbook-work-search-and-availability.html",
  },
  IN: {
    code: "IN",
    perWeek: 2,
    note: "At least 2 work search activities each week. Approved training, a recall date within 60 days, or a union hiring hall can waive it.",
    source: "https://www.in.gov/dwd/indiana-unemployment/individuals/work-search",
  },
  IA: {
    code: "IA",
    perWeek: 4,
    note: "At least 4 work search activities each week, and 3 must be job applications.",
    source: "https://workforce.iowa.gov/unemployment/reemployment",
  },
  KS: {
    code: "KS",
    perWeek: 3,
    note: "At least 3 work search activities each week, and 1 must be a job application or resume.",
    source: "https://www.dol.ks.gov/unemployment/unemployment-faqs",
  },
  KY: {
    code: "KY",
    perWeek: 5,
    note: "At least 5 work search activities each week, and 3 must be applications or interviews. Union hall members and people with a recall date may be exempt.",
    source: "https://kcc.ky.gov/career/individuals/Pages/Work-Search-Requirements.aspx",
  },
  LA: {
    code: "LA",
    perWeek: 5,
    note: "5 work search activities each week for claims filed on or after Jan 4, 2026. Older claims need 3.",
    source: "https://www.laworks.net/faqs/faq_ui_claimantbenefits.asp",
  },
  ME: {
    code: "ME",
    perWeek: 1,
    note: "At least 1 work search activity each week. It can be waived for up to 6 weeks if you have a return date.",
    source: "https://www.maine.gov/unemployment/faq/worksearch/index.shtml",
  },
  MD: {
    code: "MD",
    perWeek: 3,
    note: "At least 3 job search activities each week, and 1 must be an employer contact. Short layoffs, union halls and training may be exempt.",
    source: "https://labor.maryland.gov/employment/uirex.shtml",
  },
  MA: {
    code: "MA",
    perWeek: 3,
    note: "At least 3 work search activities each week. Not required if you're in approved training.",
    source: "https://www.mass.gov/how-to/file-your-weekly-unemployment-claim",
  },
  MI: {
    code: "MI",
    perWeek: 3,
    note: "At least 3 different work search activities each week, since July 19, 2026. The week runs Sunday to Saturday.",
    source:
      "https://www.michigan.gov/leo/bureaus-agencies/uia/uia-resources-for-claimants/finding-employment-work-search/work-search-requirement",
  },
  MN: {
    code: "MN",
    perWeek: null,
    note: "Minnesota has no set number. You must actively look for work every week. Referral union members stay in good standing instead.",
    source: "https://ui.mn.gov/applicants/getpaid/stay-eligible/seeking.jsp",
  },
  MS: {
    code: "MS",
    perWeek: 3,
    note: "Contact at least 3 employers each week, and at least 1 must be a real job application.",
    source: "https://mdes.ms.gov/worksearch",
  },
  MO: {
    code: "MO",
    perWeek: 3,
    note: "At least 3 work search activities each week. Union hall members, training, or a set recall date can change this.",
    source: "https://labor.mo.gov/faqs/knowledge-base/do-i-need-search-work",
  },
  MT: {
    code: "MT",
    perWeek: 1,
    note: "At least 1 job application or resume sent each week. Union and employer-attached workers keep in touch with them instead.",
    source: "https://uid.dli.mt.gov/claimants/work-search-requirements",
  },
  NE: {
    code: "NE",
    perWeek: 5,
    note: "5 work search activities each week, and 2 must be job applications. Short layoffs and union hall members may be exempt.",
    source: "https://dol.nebraska.gov/UIBenefits/Claims/ReemploymentActivities",
  },
  NV: {
    code: "NV",
    perWeek: null,
    note: "Nevada gives no set number. You must do several work search activities each week and report them.",
    source: "https://detr.nv.gov/content/media/RESEA_FAQ_ENG_SPA_FIN_330.pdf",
  },
  NH: {
    code: "NH",
    perWeek: null,
    note: "New Hampshire gives no set number. Search for work every week, and your local office may give you a number.",
    source: "https://www.nhes.nh.gov/forms/documents/nhes-0162.pdf",
  },
  NJ: {
    code: "NJ",
    perWeek: 3,
    note: "Contact at least 3 different employers each week to be safe. The week runs Sunday to Saturday.",
    source: "https://nj.gov/labor/myunemployment/assets/pdfs/BC_514.pdf",
  },
  NM: {
    code: "NM",
    perWeek: 2,
    note: "At least 2 different work search contacts each week, unless the state exempts you.",
    source: "https://www.dws.nm.gov/Work-Search-Requirement-Information",
  },
  NY: {
    code: "NY",
    perWeek: 3,
    note: "At least 3 work search activities each week. Union members placed by their union and short layoffs with a return date are exempt.",
    source: "https://dol.ny.gov/work-search",
  },
  NC: {
    code: "NC",
    perWeek: 3,
    note: "Contact at least 3 employers each week. One approved reemployment activity can count as 1 of the 3.",
    source: "https://www.des.nc.gov/worksearch",
  },
  ND: {
    code: "ND",
    perWeek: 4,
    note: "Usually 4 work search contacts each week, or the number Job Service gives you. The week runs Sunday to Saturday.",
    source: "https://www.jobsnd.com/node/36971",
  },
  OH: {
    code: "OH",
    perWeek: 2,
    note: "2 work search activities each week. A temporary layoff with a return within 45 days may be exempt.",
    source:
      "https://dam.assets.ohio.gov/image/upload/jfs.ohio.gov/EBS/Programs%20Rules%20and%20Resources/OUIO/Active_Work_Search_And_Reemployment_Activities.pdf",
  },
  OK: {
    code: "OK",
    perWeek: 2,
    note: "At least 2 work searches each week. Short layoffs, union hall members and approved training are exempt.",
    source: "https://oklahoma.gov/oesc/individuals/faqs.html",
  },
  OR: {
    code: "OR",
    perWeek: 5,
    note: "At least 5 work search activities each week, and 2 must be direct contacts with employers.",
    source: "https://unemployment.oregon.gov/frances/weekly-claim",
  },
  PA: {
    code: "PA",
    perWeek: 3,
    note: "Apply for 2 jobs and do 1 other activity each week, starting week 3 of your claim. Union hall members and people with a recall date are exempt.",
    source:
      "https://www.pa.gov/agencies/dli/resources/for-claimants-workers/benefits-information/using-the-uc-system/claimant-faqs/work-search-job-registration-faqs.html",
  },
  RI: {
    code: "RI",
    perWeek: 3,
    note: "3 work search activities each week, and at least 1 must be a job application.",
    source:
      "https://dlt.ri.gov/sites/g/files/xkgbur571/files/2025-11/FINAL%20UI%20Benefit%20Rights%20-%20Nov.%202025.pdf",
  },
  SC: {
    code: "SC",
    perWeek: 2,
    note: "At least 2 job searches each week, done through SC Works Online (jobs.scworks.org).",
    source: "https://www.dew.sc.gov/individuals/search-work",
  },
  SD: {
    code: "SD",
    perWeek: 2,
    note: "At least 2 work search activities each week. Union members and people with a set return date can ask for an exemption.",
    source: "https://dlr.sd.gov/ra/individuals/work_search_requirements.aspx",
  },
  TN: {
    code: "TN",
    perWeek: 4,
    note: "4 work search activities each week, reported on your weekly certification. Some people can have this waived.",
    source: "https://www.tn.gov/workforce/unemployment/apply-for-benefits/what-to-expect-after-you-file-2.html",
  },
  TX: {
    code: "TX",
    perWeek: 5,
    note: "Most counties require 5 work search activities each week, but some small counties need fewer. Your TWC letter gives your number.",
    source: "https://twc.texas.gov/jobseekers/required-number-work-search-activities-county",
  },
  UT: {
    code: "UT",
    perWeek: 4,
    note: "At least 4 new contacts for full-time work each week.",
    source: "https://jobs.utah.gov/ui/FAQ.html",
  },
  VT: {
    code: "VT",
    perWeek: 3,
    note: "At least 3 job contacts or activities each week. A return date within 10 weeks or approved training can waive it.",
    source: "https://labor.vermont.gov/node/3631",
  },
  VA: {
    code: "VA",
    perWeek: 2,
    note: "At least 2 job contacts each week, with different employers. The week ends Saturday. Union hall members contact the hall instead.",
    source: "https://vec.virginia.gov/your-unemployment-benefit-rights-and-responsibilities",
  },
  WA: {
    code: "WA",
    perWeek: 3,
    note: "At least 3 job search activities each week. Union members, approved standby and approved training can be waived.",
    source:
      "https://esd.wa.gov/get-financial-help/unemployment-benefits/weekly-unemployment-claims/job-search-requirements",
  },
  WV: {
    code: "WV",
    perWeek: 4,
    note: "At least 4 work search activities each week. Keep dated proof.",
    source: "https://workforcewv.org/wp-content/uploads/2026/04/Work-Search-Activities-Chart-Rev.-03.26.pdf",
  },
  WI: {
    code: "WI",
    perWeek: 4,
    note: "At least 4 work search actions each week. Expected recall, union referral lists and approved training can waive it.",
    source: "https://www.dwd.wisconsin.gov/uiben/worksearch-requirements.htm",
  },
  WY: {
    code: "WY",
    perWeek: 2,
    note: "Contact at least 2 employers each week.",
    source: "https://www.law.cornell.edu/regulations/wyoming/053-24-Wyo-Code-R-SS-24-6",
    secondary: true,
  },
};
