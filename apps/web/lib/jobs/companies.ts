// Curated employers whose career sites run on Greenhouse, Lever or Ashby.
// Each one publishes a free, public, keyless job-board API.
//
// Every slug below was checked on 2026-10-08 and returned open jobs. Boards
// move: if a company switches systems its API 404s, the source fails quietly
// (see sources.ts) and the rest of the feed still loads. Re-check with:
//   Greenhouse: https://boards-api.greenhouse.io/v1/boards/<slug>/jobs
//   Lever:      https://api.lever.co/v0/postings/<slug>?mode=json
//   Ashby:      https://api.ashbyhq.com/posting-api/job-board/<slug>
//
// Picked for breadth, not just software: customer support, operations,
// warehouse and logistics, restaurants, health care, manufacturing and
// technician roles show up alongside office jobs.

export type BoardSystem = "greenhouse" | "lever" | "ashby";

export interface CompanyBoard {
  system: BoardSystem;
  slug: string;
  /** Display name. Greenhouse/Ashby don't always return one. */
  name: string;
}

export const COMPANIES: CompanyBoard[] = [
  // ─── Greenhouse ───────────────────────────────────────────────────────────
  { system: "greenhouse", slug: "carvana", name: "Carvana" }, // ops, inspection, customer advocates
  { system: "greenhouse", slug: "sweetgreen", name: "sweetgreen" }, // restaurants
  { system: "greenhouse", slug: "hellofresh", name: "HelloFresh" }, // warehouse, fulfillment
  { system: "greenhouse", slug: "doordashusa", name: "DoorDash" },
  { system: "greenhouse", slug: "instacart", name: "Instacart" },
  { system: "greenhouse", slug: "oscar", name: "Oscar Health" }, // health care, member services
  { system: "greenhouse", slug: "peloton", name: "Peloton" }, // retail, field ops
  { system: "greenhouse", slug: "toast", name: "Toast" }, // customer success, support
  { system: "greenhouse", slug: "lucidmotors", name: "Lucid Motors" }, // manufacturing
  { system: "greenhouse", slug: "spacex", name: "SpaceX" }, // technicians, production
  { system: "greenhouse", slug: "andurilindustries", name: "Anduril" }, // manufacturing, technicians
  { system: "greenhouse", slug: "flexport", name: "Flexport" }, // logistics
  { system: "greenhouse", slug: "glossier", name: "Glossier" }, // retail
  { system: "greenhouse", slug: "samsara", name: "Samsara" },
  { system: "greenhouse", slug: "lyft", name: "Lyft" },
  { system: "greenhouse", slug: "airbnb", name: "Airbnb" },
  { system: "greenhouse", slug: "chime", name: "Chime" },
  { system: "greenhouse", slug: "sofi", name: "SoFi" },
  { system: "greenhouse", slug: "affirm", name: "Affirm" },
  { system: "greenhouse", slug: "betterment", name: "Betterment" },
  { system: "greenhouse", slug: "gusto", name: "Gusto" },
  { system: "greenhouse", slug: "twilio", name: "Twilio" },
  { system: "greenhouse", slug: "roku", name: "Roku" },
  { system: "greenhouse", slug: "duolingo", name: "Duolingo" },
  { system: "greenhouse", slug: "squarespace", name: "Squarespace" },
  { system: "greenhouse", slug: "coursera", name: "Coursera" },
  { system: "greenhouse", slug: "dropbox", name: "Dropbox" },
  { system: "greenhouse", slug: "voxmedia", name: "Vox Media" },
  { system: "greenhouse", slug: "robinhood", name: "Robinhood" },
  { system: "greenhouse", slug: "okta", name: "Okta" },
  { system: "greenhouse", slug: "pinterest", name: "Pinterest" },
  { system: "greenhouse", slug: "reddit", name: "Reddit" },
  { system: "greenhouse", slug: "stripe", name: "Stripe" },

  // ─── Lever ────────────────────────────────────────────────────────────────
  { system: "lever", slug: "veeva", name: "Veeva Systems" },
  { system: "lever", slug: "zoox", name: "Zoox" }, // fleet ops, technicians
  { system: "lever", slug: "shieldai", name: "Shield AI" },
  { system: "lever", slug: "palantir", name: "Palantir" },
  { system: "lever", slug: "spotify", name: "Spotify" },
  { system: "lever", slug: "matchgroup", name: "Match Group" },
  { system: "lever", slug: "ro", name: "Ro" }, // health care
  { system: "lever", slug: "rover", name: "Rover" },
  { system: "lever", slug: "jumpcloud", name: "JumpCloud" },
  { system: "lever", slug: "outreach", name: "Outreach" },
  { system: "lever", slug: "wealthfront", name: "Wealthfront" },
  { system: "lever", slug: "greenlight", name: "Greenlight" },

  // ─── Ashby ────────────────────────────────────────────────────────────────
  { system: "ashby", slug: "lemonade", name: "Lemonade" }, // insurance, support
  { system: "ashby", slug: "ramp", name: "Ramp" },
  { system: "ashby", slug: "notion", name: "Notion" },
  { system: "ashby", slug: "plaid", name: "Plaid" },
  { system: "ashby", slug: "snowflake", name: "Snowflake" },
  { system: "ashby", slug: "sentry", name: "Sentry" },
  { system: "ashby", slug: "vanta", name: "Vanta" },
  { system: "ashby", slug: "replit", name: "Replit" },
  { system: "ashby", slug: "supabase", name: "Supabase" },
  { system: "ashby", slug: "zapier", name: "Zapier" },
  { system: "ashby", slug: "multiverse", name: "Multiverse" },
];
