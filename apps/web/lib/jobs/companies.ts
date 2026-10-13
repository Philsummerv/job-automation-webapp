// Curated employers whose career sites run on Greenhouse, Lever or Ashby.
// Each one publishes a free, public, keyless job-board API.
//
// The first 56 slugs were checked on 2026-10-08, the rest on 2026-10-12
// (verified 2026-10-12); all returned open jobs. Boards
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

/**
 * The first 56 boards (checked 2026-10-08). Search falls back to fetching
 * these live when the job_postings table is missing or empty, so the site
 * keeps working before migration 0007 and the first refresh.
 */
export const LIVE_FALLBACK_COMPANIES: CompanyBoard[] = [
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

// ─── Added 2026-10-12 ─────────────────────────────────────────────────────
// 206 more boards, verified 2026-10-12: each slug answered with open US jobs,
// most of them hourly or no-degree roles. Too many to fetch on every search,
// so these are only searched through the job_postings index, which
// app/api/cron/refresh-jobs fills. Grouped by industry.
const ADDED_2026_10_12: CompanyBoard[] = [
  // ─── Restaurants, cafes and bakeries ─────────────────────────────────────────
  { system: "lever", slug: "insomniacookies", name: "Insomnia Cookies" }, // Late-night cookie bakery chain, hundreds of stores; 99 NY jobs incl. Brooklyn and...
  { system: "greenhouse", slug: "diginnother", name: "DIG" }, // Fast casual restaurant chain HQ'd in NYC; 141 NY jobs. Second DIG board is...
  { system: "greenhouse", slug: "digrestaurants", name: "DIG" }, // Fast casual; 21 NY jobs (NYC, Rye Brook). Many managers here, hourly roles mostly on...
  { system: "greenhouse", slug: "sohohouseco", name: "Soho House & Co." }, // Members clubs / restaurants / hospitality; 441 global, 129 US, 31 NY (Manhattan, Brooklyn)
  { system: "greenhouse", slug: "vanleeuwenicecream", name: "Van Leeuwen Ice Cream" }, // Brooklyn-based ice cream shop chain; 38 NY jobs
  { system: "greenhouse", slug: "philzcoffeecareers", name: "Philz Coffee" }, // Coffee chain, California only; no NY
  { system: "greenhouse", slug: "toojaysdeli", name: "TooJay's Deli" }, // Deli/bakery restaurant chain, Florida; no NY
  { system: "greenhouse", slug: "nakedfarmer", name: "Naked Farmer" }, // Farm-to-table fast casual chain, FL/TN/NC; no NY
  { system: "greenhouse", slug: "blankstreet", name: "Blank Street Coffee" }, // Coffee chain started in Brooklyn; 20 NY jobs (102 total incl. UK)
  { system: "lever", slug: "bluebottlecoffee", name: "Blue Bottle Coffee" }, // Specialty coffee chain; 5 NY jobs (rest in CA, IL, NV, plus Asia)
  { system: "greenhouse", slug: "methodco", name: "Method Co." }, // Restaurant/hotel hospitality group in Detroit and Philadelphia; no NY
  { system: "lever", slug: "level99", name: "Level99" }, // Entertainment venues with restaurant/bar, MA/CT/VA; no NY
  { system: "lever", slug: "fixinssoulkitchen", name: "Fixins Soul Kitchen" }, // Soul food restaurants in Detroit, LA, Sacramento, Tulsa; no NY
  { system: "lever", slug: "rivieradininggroup", name: "Riviera Dining Group" }, // Restaurant group in Miami/Orlando FL; no NY
  { system: "greenhouse", slug: "magnolia", name: "Magnolia" }, // Magnolia Table restaurant, bakery and retail in Waco TX; no NY
  { system: "greenhouse", slug: "coqodaq", name: "COQODAQ" }, // NYC Korean fried chicken restaurant (Gracious Hospitality); all 12 US jobs in NY
  { system: "greenhouse", slug: "cotenyc", name: "COTE NYC" }, // NYC Korean steakhouse (Gracious Hospitality); all NY
  { system: "greenhouse", slug: "mossnewyorkllc", name: "Moss New York" }, // NYC members club / restaurant at 520 Fifth Ave; all NY
  { system: "greenhouse", slug: "convene", name: "Convene Hospitality Group" }, // Event venues + catering; 14 NY jobs
  { system: "greenhouse", slug: "zerocater", name: "ZeroCater" }, // Office catering, part-time shifts in CA/OR; 1 NY

  // ─── Food production, meal kits and grocery delivery ─────────────────────────
  { system: "lever", slug: "gopuff", name: "Gopuff" }, // Quick-commerce grocery delivery + micro-fulfillment centers; 49 NY jobs
  { system: "greenhouse", slug: "high-volume", name: "DoorDash (DashMart)" }, // DoorDash hourly board for DashMart grocery fulfillment centers; 10 NY jobs
  { system: "greenhouse", slug: "cookunity", name: "CookUnity" }, // Chef-made meal delivery with commercial kitchens; 38 NY jobs
  { system: "greenhouse", slug: "jjsnackfoods", name: "J&J Snack Foods" }, // Food manufacturing (pretzels, churros, frozen treats) plants in KY, MO, CA etc.; no NY
  { system: "greenhouse", slug: "hoodhp", name: "HP Hood" }, // Dairy/beverage manufacturer; 46 NY jobs (Vernon, Oneida, upstate plants)
  { system: "greenhouse", slug: "homechef", name: "Home Chef" }, // Meal kit (Kroger) production plants in GA, IL, CA; no NY. Larger internal board...
  { system: "greenhouse", slug: "homechefinternalemployees", name: "Home Chef" }, // Hourly meal-kit warehouse shifts; no NY. Name says "internal": check it takes outside applicants
  { system: "greenhouse", slug: "misfitsmarket", name: "Misfits Market" }, // Online grocery; warehouse jobs in Hanover MD and Northlake IL; 2 NY
  { system: "greenhouse", slug: "fairlife", name: "Fairlife" }, // Dairy manufacturer (Coca-Cola); 24 NY jobs at Webster NY plant
  { system: "lever", slug: "charcuterie", name: "Charcuterie Artisans" }, // Cured meat food manufacturing, RI and IA plants; no NY
  { system: "greenhouse", slug: "weee", name: "Weee!" }, // Asian online grocery; warehouses in Clifton NJ, Chicago, Houston; no NY. Mostly...
  { system: "lever", slug: "tovala", name: "Tovala" }, // Meal kit / smart oven, food plant in Utah and Chicago; no NY. Small board

  // ─── Retail stores (clothing, jewelry, cannabis and more) ────────────────────
  { system: "greenhouse", slug: "aloyoga", name: "Alo Yoga" }, // Apparel brand with stores + distribution centers (MD, NV, MS); 79 NY jobs
  { system: "greenhouse", slug: "curaleaf", name: "Curaleaf" }, // Cannabis dispensary retail chain, many states; 15 NY jobs
  { system: "greenhouse", slug: "lush", name: "Lush Cosmetics" }, // Cosmetics retail stores in malls nationwide; 8 NY jobs
  { system: "lever", slug: "buckmason", name: "Buck Mason" }, // Menswear/womenswear stores; 48 NY jobs
  { system: "greenhouse", slug: "greenthumbindustries", name: "Green Thumb Industries (RISE)" }, // Cannabis dispensaries + production; 10 NY jobs
  { system: "greenhouse", slug: "gorjana", name: "gorjana" }, // Jewelry retail stores; 12 NY jobs
  { system: "greenhouse", slug: "fahertybrand", name: "Faherty Brand" }, // Apparel stores (plus a market/cafe); 28 NY jobs incl. Hamptons and Manhattan
  { system: "greenhouse", slug: "tecovas", name: "Tecovas" }, // Western boots retail stores, mostly South/West; 4 NY jobs
  { system: "greenhouse", slug: "reformation", name: "Reformation" }, // Apparel stores + remote customer service; 24 NY jobs
  { system: "ashby", slug: "rothys", name: "Rothy's" }, // Shoes/bags retail stores; 13 NY jobs
  { system: "greenhouse", slug: "mejuri", name: "Mejuri" }, // Jewelry retail stores; 12 NY jobs
  { system: "greenhouse", slug: "brilliantearth", name: "Brilliant Earth" }, // Jewelry showrooms + NJ fulfillment center; 7 NY jobs
  { system: "greenhouse", slug: "crescolabs", name: "Cresco Labs" }, // Cannabis production/manufacturing, hourly plant roles; no NY
  { system: "greenhouse", slug: "sunnyside", name: "Sunnyside" }, // Cannabis dispensary retail chain (Cresco); no NY currently
  { system: "greenhouse", slug: "hillhousehome", name: "Hill House Home" }, // Apparel/home retail stores; 6 NY jobs
  { system: "lever", slug: "terrascend", name: "TerrAscend" }, // Cannabis dispensaries + cultivation (NJ, PA, MD, CA); no NY
  { system: "greenhouse", slug: "jennikayne", name: "Jenni Kayne" }, // Apparel/home retail stores; 4 NY jobs
  { system: "greenhouse", slug: "everlane", name: "Everlane" }, // Apparel retail stores; 3 NY jobs
  { system: "greenhouse", slug: "onrunning", name: "On" }, // Athletic shoe brand stores; 12 NY jobs
  { system: "greenhouse", slug: "veronicabeard", name: "Veronica Beard" }, // Apparel retail stores; 28 NY jobs (HQ in NYC)
  { system: "ashby", slug: "away", name: "Away" }, // Luggage retail stores; 1 NY job (Brooklyn)
  { system: "greenhouse", slug: "camp", name: "CAMP" }, // Kids toy/experience retail stores; 3 NY jobs
  { system: "greenhouse", slug: "saatva", name: "Saatva" }, // Mattress showrooms; 4 NY jobs
  { system: "ashby", slug: "tonal", name: "Tonal" }, // Fitness equipment showrooms in malls; 2 NY jobs (Westchester)
  { system: "lever", slug: "brooksrunning", name: "Brooks Running" }, // Running shoe brand stores (WA, MA, CA); no NY
  { system: "greenhouse", slug: "parachutehome", name: "Parachute Home" }, // Home goods retail stores; 1 NY job (Soho)
  { system: "greenhouse", slug: "aimeleondore", name: "Aime Leon Dore" }, // Apparel store + cafe; 8 NY jobs (HQ Queens/Manhattan)
  { system: "greenhouse", slug: "thirdlove", name: "ThirdLove" }, // Lingerie retail stores; NJ store near NYC
  { system: "ashby", slug: "brooklinen", name: "Brooklinen" }, // Brooklyn-founded home goods retail; NY not tagged in current listings

  // ─── Warehouses and fulfillment centers ──────────────────────────────────────
  { system: "greenhouse", slug: "shipmonk", name: "ShipMonk" }, // E-commerce fulfillment warehouses (KY, TX, PA, NV, FL); no NY
  { system: "greenhouse", slug: "shipbobinc", name: "ShipBob" }, // E-commerce fulfillment warehouses (IL, PA, TX); no NY
  { system: "greenhouse", slug: "saltbox", name: "Saltbox" }, // Co-warehousing / e-commerce fulfillment hubs; no NY
  { system: "greenhouse", slug: "stockx", name: "StockX" }, // Resale marketplace authentication centers (seasonal hourly); NJ center near NYC
  { system: "greenhouse", slug: "renttherunway", name: "Rent the Runway" }, // Apparel rental fulfillment center (Secaucus NJ area); 8 NY postings
  { system: "lever", slug: "spreetail", name: "Spreetail" }, // E-commerce fulfillment warehouses (WA, NE, etc.)
  { system: "greenhouse", slug: "nimblerobotics", name: "Nimble Robotics" }, // Robotic fulfillment centers; maintenance techs (TX, NJ)

  // ─── Driving, delivery and logistics ─────────────────────────────────────────
  { system: "lever", slug: "tsmg", name: "TSMG" }, // Vehicle test-driving / driver contract staffing, many US locations; 54 NY postings...
  { system: "greenhouse", slug: "dhpace", name: "D.H. Pace" }, // Door/dock equipment install and service, national field techs and drivers; no NY seen
  { system: "greenhouse", slug: "triumvirateenvironmental", name: "Triumvirate Environmental" }, // Environmental/hazmat waste hauling and trucking; national, 2 NY
  { system: "lever", slug: "premiertruck", name: "Premier Truck Group" }, // Truck dealership/service network (TX, South, Midwest); drivers, porters, techs, parts...
  { system: "lever", slug: "richards-supply", name: "Richards Building Supply" }, // Building-supply distribution: local CDL delivery and yard/warehouse jobs; 3 NY
  { system: "greenhouse", slug: "certifiedgroup", name: "Certified Group" }, // Food-testing labs with courier/dispatch fleet; Melville NY courier routes (5 NY)
  { system: "lever", slug: "arrivelogistics", name: "Arrive Logistics" }, // Freight brokerage (Austin/Chicago); entry-level carrier/broker sales roles
  { system: "greenhouse", slug: "operationscareers", name: "Veo" }, // Shared e-scooter/bike fleet ops: drivers, mechanics; 6 NY (Bronx)
  { system: "lever", slug: "fetchpackage", name: "Fetch Package" }, // Apartment package delivery / valet trash, hourly field crews across Sun Belt; no NY
  { system: "greenhouse", slug: "itslogisticsllc", name: "ITS Logistics" }, // 3PL / freight brokerage and warehousing (Reno NV, TX)
  { system: "greenhouse", slug: "via", name: "Via Transportation" }, // Ride-share/microtransit operator; NYC HQ, 62 NY postings (many are tech, filter titles)
  { system: "ashby", slug: "serverobotics", name: "Serve Robotics" }, // Sidewalk robot delivery; part-time field ops in LA/Miami/Atlanta/Chicago; 3 NY
  { system: "greenhouse", slug: "gatikaiinc", name: "Gatik" }, // Autonomous middle-mile box trucks; drivers in TX/AR/etc.; 3 NY
  { system: "greenhouse", slug: "try-picnic", name: "Picnic" }, // Grocery/batch delivery; NYC part-time drivers (8 NY)
  { system: "lever", slug: "ridezum", name: "Zum" }, // Student transportation / bus fleet; 4 NY
  { system: "greenhouse", slug: "uberfreight", name: "Uber Freight" }, // Freight brokerage / managed transportation and warehousing
  { system: "ashby", slug: "aurora-operations-inc", name: "Aurora Innovation" }, // Autonomous trucking (TX/PA); operator and fleet-tech roles among many engineering posts
  { system: "ashby", slug: "8fleet-inc", name: "8Fleet" }, // Rideshare/delivery vehicle fleet rental for gig drivers
  { system: "greenhouse", slug: "nuro", name: "Nuro" }, // Autonomous delivery vehicles; CA operator/fleet-tech shift roles, rest engineering
  { system: "greenhouse", slug: "nabis", name: "Nabis" }, // Cannabis wholesale distribution/logistics; strong NY presence (7 NY: Bronx, Rochester)
  { system: "greenhouse", slug: "rlsbio", name: "RLS Radiopharmacies" }, // Radiopharmacy delivery; courier routes nationwide
  { system: "greenhouse", slug: "odeko", name: "Odeko" }, // Cafe supply distribution and delivery; NYC-based, Moonachie NJ warehouse (1 NY)
  { system: "greenhouse", slug: "kodiak", name: "Kodiak Robotics" }, // Autonomous trucking; CDL safety drivers and truck techs (TX etc.)
  { system: "greenhouse", slug: "airspace", name: "Airspace" }, // Time-critical/medical courier logistics
  { system: "ashby", slug: "curri", name: "Curri" }, // Construction-supply last-mile delivery platform
  { system: "greenhouse", slug: "cargomatic", name: "Cargomatic" }, // Port drayage / trucking (LA, Savannah etc.)

  // ─── Health care (home health, clinics, labs, pharmacy, vet) ─────────────────
  { system: "greenhouse", slug: "bayada", name: "BAYADA Home Health Care" }, // Home health aides, CNAs, LPNs, national; 37 NY jobs. Huge board (~2,500 jobs, 29MB)
  { system: "lever", slug: "getlabs", name: "Getlabs" }, // At-home lab draws, nationwide. Almost all jobs are mobile phlebotomist. 8 NY jobs.
  { system: "greenhouse", slug: "onemedical", name: "One Medical" }, // Primary care clinics, national. Medical assistant, phlebotomist and front desk jobs...
  { system: "greenhouse", slug: "natera", name: "Natera" }, // Genetic testing lab. Phlebotomists nationwide, lab operators in Austin TX / San Carlos...
  { system: "greenhouse", slug: "bondvet", name: "Bond Vet" }, // Vet clinics (animal health, not human). Front desk 'care coordinator' and vet...
  { system: "greenhouse", slug: "goodvets", name: "GoodVets" }, // Vet clinics (animal health), national (IL, DC, SC, KS, NC, AZ, TX). No NY.
  { system: "greenhouse", slug: "modernanimal", name: "Modern Animal" }, // Vet clinics (animal health), mostly California. Most entry roles need RVT credential...
  { system: "ashby", slug: "sprinter-health", name: "Sprinter Health" }, // In-home lab draws / care, national. 3 NY jobs (Queens, NYC).
  { system: "greenhouse", slug: "blinkhealth", name: "Blink Health" }, // Online pharmacy. Call center and pharmacy tech jobs in Pittsburgh PA and Chesterfield...
  { system: "greenhouse", slug: "strivehealth", name: "Strive Health" }, // Kidney care clinics (CT, IL, CO and others). No NY.
  { system: "greenhouse", slug: "cloverhealth", name: "Clover Health" }, // Medicare Advantage plan with in-home care. Field medical assistants mostly in NJ. 1 NY...
  { system: "greenhouse", slug: "rightwayhealthcare", name: "Rightway" }, // Pharmacy benefits / care navigation. Remote plus Denver and Dallas. HQ NYC, 9 NY jobs.
  { system: "greenhouse", slug: "bluestone", name: "Bluestone Physician Services" }, // Senior care / home and facility-based primary care, Minnesota and nearby. No NY to...
  { system: "ashby", slug: "equip", name: "Equip Health" }, // Virtual eating-disorder treatment (behavioral health). Remote US jobs.
  { system: "greenhouse", slug: "charliehealth", name: "Charlie Health" }, // Virtual behavioral health. Mostly licensed clinicians; a few office, collections and...
  { system: "ashby", slug: "phil", name: "Phil" }, // Digital pharmacy. Pharmacy techs in Columbus OH and Hebron KY, support jobs remote.
  { system: "greenhouse", slug: "cortica", name: "Cortica" }, // Autism / pediatric behavioral health clinics, mostly California and Massachusetts. No NY.
  { system: "greenhouse", slug: "billiontoone", name: "BillionToOne" }, // Diagnostic lab, mostly Union City CA. 2 NY jobs.
  { system: "greenhouse", slug: "tia", name: "Tia" }, // Women's health clinics (CA, AZ, NY). 5 NY jobs.
  { system: "greenhouse", slug: "talkspace", name: "Talkspace" }, // Online behavioral health, medical billing / care-coordination jobs. NY-based (23 NY...
  { system: "greenhouse", slug: "cadencehealth", name: "Cadence" }, // Remote patient monitoring. Remote MA and enrollment jobs, plus hybrid in Las Vegas and...
  { system: "lever", slug: "lifestance", name: "LifeStance Health" }, // Outpatient behavioral health, national. Board is huge but mostly licensed therapists...
  { system: "greenhouse", slug: "prenuvo", name: "Prenuvo" }, // Full-body MRI imaging clinics. Patient liaison (front desk) jobs in Miami, Minneapolis...
  { system: "greenhouse", slug: "hellotend", name: "Tend" }, // Dental studios (NY, MA, DC, VA, GA). 6 NY jobs, including dental assistant and...
  { system: "greenhouse", slug: "sollishealth", name: "Sollis Health" }, // NYC-based concierge urgent care; ~9 NY jobs

  // ─── Call centers, sales and customer service ────────────────────────────────
  { system: "greenhouse", slug: "oportun", name: "Oportun" }, // Consumer lending/banking; mostly bilingual call-center member service reps. No NY.
  { system: "greenhouse", slug: "beyondfinance", name: "Beyond Finance" }, // Debt resolution call center (CS, retention, inside sales); remote/hybrid US. No NY.
  { system: "greenhouse", slug: "matic", name: "Matic Insurance" }, // Insurance agency call center; entry-level sales and CS. No NY.
  { system: "ashby", slug: "steadily", name: "Steadily" }, // Landlord insurance; inside sales and claims, training provided. No NY.
  { system: "ashby", slug: "kin", name: "Kin Insurance" }, // Home insurance call center, sales and licensed CS agents. No NY.
  { system: "greenhouse", slug: "pieinsurance", name: "Pie Insurance" }, // Workers' comp insurance; claims, CS and inside sales. No NY.
  { system: "greenhouse", slug: "lendingtree", name: "LendingTree" }, // Loan/insurance marketplace; call center and sales. No NY.
  { system: "greenhouse", slug: "ziprecruiter", name: "ZipRecruiter" }, // Inside sales floor (entry-level account executives). 1 NY posting.
  { system: "greenhouse", slug: "simplisafe", name: "SimpliSafe" }, // Home security; hourly monitoring call center and seasonal sales agents. No NY.
  { system: "ashby", slug: "spoton", name: "SpotOn" }, // Restaurant POS; field/territory sales reps in dozens of US cities. 5 NY postings.
  { system: "greenhouse", slug: "tripactions", name: "Navan" }, // Corporate travel; travel agent/consultant and SDR roles. 41 NY postings.
  { system: "greenhouse", slug: "justworks", name: "Justworks" }, // Payroll/PEO, NYC headquarters; support and sales. 62 NY postings.
  { system: "greenhouse", slug: "mercury", name: "Mercury" }, // Business banking; customer support and SDR. Nearly all postings list NY (69).
  { system: "greenhouse", slug: "knock", name: "Knock" }, // Mortgage/home lending; remote US loan support roles.
  { system: "greenhouse", slug: "podium81", name: "Podium" }, // Utah inside sales floor (SDR) and onboarding/support. No NY.
  { system: "lever", slug: "includedhealth", name: "Included Health" }, // Health navigation; member-services call center hiring in cohorts. Most other roles are...
  { system: "lever", slug: "lessen", name: "Lessen" }, // Property maintenance services; CS/escalations reps, coordinators and field techs (many...
  { system: "greenhouse", slug: "orchard", name: "Orchard" }, // Real estate brokerage; licensed agent sales roles (license needed, no degree). 2 NY...
  { system: "greenhouse", slug: "honor", name: "Honor" }, // Home care; client-care advisors and sales. No NY.

  // ─── Trades, home services and field technicians ─────────────────────────────
  { system: "lever", slug: "sila", name: "Sila Services" }, // HVAC/plumbing/electrical home services rollup; 27 NY-located jobs. Best trades board found
  { system: "lever", slug: "windownation", name: "Window Nation" }, // Home improvement / window installation; 5 NY jobs (Buffalo area)
  { system: "greenhouse", slug: "jetsonhome", name: "Jetson Home" }, // Residential heat pump / HVAC installer; 1 NY job
  { system: "greenhouse", slug: "budderfly", name: "Budderfly" }, // Energy efficiency / HVAC-R and electrical field service, multi-state
  { system: "ashby", slug: "dandelion", name: "Dandelion Energy" }, // Geothermal heat pump installer, Northeast; 1 NY job (NY-founded company)
  { system: "greenhouse", slug: "googlefiber", name: "Google Fiber" }, // Telecom/fiber field technicians and door-to-door sales
  { system: "greenhouse", slug: "pathrobotics", name: "Path Robotics" }, // Robotic welding (Columbus OH) field techs; 1 NY job
  { system: "lever", slug: "mainspringenergy", name: "Mainspring Energy" }, // Power generator manufacturing + field service; 2 NY jobs (Long Island)
  { system: "greenhouse", slug: "formic", name: "Formic" }, // Factory automation field service technicians (multi-state)

  // ─── Manufacturing and factory jobs ──────────────────────────────────────────
  { system: "greenhouse", slug: "rebuildmanufacturing", name: "Re:Build Manufacturing" }, // Contract manufacturing, multiple plants; 28 NY-located jobs
  { system: "greenhouse", slug: "redwoodmaterials", name: "Redwood Materials" }, // Battery recycling / manufacturing (NV, SC)
  { system: "greenhouse", slug: "relativity", name: "Relativity Space" }, // Aerospace manufacturing (CA, MS); many shift technician roles
  { system: "greenhouse", slug: "divergent", name: "Divergent Technologies" }, // Automotive/aerospace parts manufacturing (LA area)
  { system: "ashby", slug: "saronic", name: "Saronic" }, // Boat/shipbuilding manufacturing (TX, LA)
  { system: "ashby", slug: "formenergy", name: "Form Energy" }, // Battery manufacturing (Weirton WV factory)
  { system: "greenhouse", slug: "formlabs", name: "Formlabs" }, // 3D printer manufacturing (MA, OH)
  { system: "greenhouse", slug: "astranis", name: "Astranis" }, // Satellite manufacturing (SF); some roles are early-career associate programs
  { system: "greenhouse", slug: "vast", name: "Vast" }, // Space station manufacturing (Long Beach CA)
  { system: "greenhouse", slug: "harbingermotors", name: "Harbinger Motors" }, // EV truck manufacturing (CA)
  { system: "greenhouse", slug: "machindustries", name: "Mach Industries" }, // Defense manufacturing
  { system: "ashby", slug: "hadrian-automation", name: "Hadrian" }, // Precision machining factories (CA, AZ)
  { system: "ashby", slug: "1x", name: "1X Technologies" }, // Humanoid robot manufacturing (Bay Area)
  { system: "greenhouse", slug: "scoutmotors", name: "Scout Motors" }, // VW-backed EV automaker, SC plant ramping
  { system: "greenhouse", slug: "ursamajor", name: "Ursa Major" }, // Rocket engine manufacturing (CO, AL)
  { system: "lever", slug: "velo3d", name: "Velo3D" }, // Metal 3D printer manufacturing
  { system: "greenhouse", slug: "sunpro", name: "SunPro" }, // Awning/screen manufacturing; plant floor roles
  { system: "greenhouse", slug: "antora", name: "Antora Energy" }, // Thermal battery manufacturing (CA)
  { system: "greenhouse", slug: "chaosindustries", name: "Chaos Industries" }, // Defense hardware manufacturing
  { system: "lever", slug: "hermeus", name: "Hermeus" }, // Aircraft manufacturing (Atlanta GA)
  { system: "greenhouse", slug: "epirus", name: "Epirus" }, // Defense electronics manufacturing (Torrance CA)

  // ─── Drones, robots and self-driving fleets ──────────────────────────────────
  { system: "greenhouse", slug: "flyzipline", name: "Zipline" }, // Drone delivery field ops; 3 NY-located jobs
  { system: "lever", slug: "waabi", name: "Waabi" }, // Autonomous trucking (TX) vehicle techs/dispatch
  { system: "greenhouse", slug: "waymo", name: "Waymo" }, // Autonomous ride-hail; mostly engineering but 23 NY-located jobs and some ops/tech roles
  { system: "ashby", slug: "skydio", name: "Skydio" }, // Drone manufacturing; has a New York field support role

  // ─── Energy and utilities ────────────────────────────────────────────────────
  { system: "greenhouse", slug: "oklo", name: "Oklo" }, // Nuclear power / utilities (ID)
  { system: "ashby", slug: "helion", name: "Helion Energy" }, // Fusion power plant build (WA)

  // ─── Gyms and fitness studios ────────────────────────────────────────────────
  { system: "lever", slug: "solidcore", name: "Solidcore" }, // Fitness studios; hourly front-desk sales crew and coaches nationwide. 27 NY postings.
  { system: "greenhouse", slug: "eosfitness", name: "EoS Fitness" }, // Fitness gym chain (AZ, TX, FL, CA, NV, UT); huge hourly board; no NY
  { system: "lever", slug: "jetsetpilates", name: "JETSET Pilates" }, // Fitness studios (Pilates), national; ~24 NY-area postings

  // ─── Events, venues and hospitality ──────────────────────────────────────────
  { system: "greenhouse", slug: "aegworldwide", name: "AEG Worldwide" }, // Live events/venues; Event Staff category; NY via Bowery Presents/Webster Hall
  { system: "greenhouse", slug: "msgentertainmentholdingsllc", name: "MSG Entertainment" }, // Venues/events (MSG, Radio City, Beacon); ~85 NY jobs - strong NY bonus
  { system: "ashby", slug: "industrious", name: "Industrious" }, // Coworking/hospitality front-of-house; ~8 NY
  { system: "greenhouse", slug: "feverup", name: "Fever" }, // Live events/experiences (Candlelight etc.); 566 total, mostly Spain; ~27 NY
  { system: "lever", slug: "flowlife", name: "Flow" }, // Residential/hospitality buildings (Miami etc.); ~4 NY
  { system: "ashby", slug: "traba", name: "Traba" }, // Light-industrial/event staffing platform; field ops roles; NY HQ (~14 NY)
  { system: "lever", slug: "placemakr", name: "Placemakr" }, // Hospitality/apartment-hotels; 1 NY
  { system: "greenhouse", slug: "kasa", name: "Kasa" }, // Hospitality (tech-enabled hotels/apartments); no NY
  { system: "greenhouse", slug: "sensei", name: "Sensei" }, // Wellness resort/hospitality (Rancho Mirage CA, Hawaii); no NY

  // ─── Security, facilities and parking ────────────────────────────────────────
  { system: "greenhouse", slug: "waldensecurity", name: "Walden Security" }, // Security guard company (Southeast/TX + federal); location field often just a city or...
  { system: "greenhouse", slug: "tsg", name: "Titan Security Group" }, // Security guard company (Chicago/Midwest, also FL, SC, NV)
  { system: "greenhouse", slug: "spsnorthamerica", name: "SPS North America" }, // Workplace/facilities services (mailroom, reception, AV); ~34 NY jobs
  { system: "greenhouse", slug: "metropolis", name: "Metropolis" }, // Parking/facilities; mostly sales reps on this board; ~18 NY
  { system: "lever", slug: "ableserve", name: "ABM Industries" }, // Facilities/janitorial services (Lever board for a segment); a few NY
  { system: "greenhouse", slug: "armorous", name: "Armorous" }, // Security guard company (California); no NY

  // ─── Property management ─────────────────────────────────────────────────────
  { system: "greenhouse", slug: "bozzuto", name: "Bozzuto" }, // Apartment property management (Mid-Atlantic/Northeast); 1 NY
  { system: "greenhouse", slug: "cortland", name: "Cortland" }, // Apartment property management (Sun Belt); no NY
  { system: "greenhouse", slug: "mgproperties", name: "MG Properties" }, // Apartment property management (West); no NY
  { system: "lever", slug: "cimgroup", name: "CIM Group" }, // Real estate/property management; ~4 NY; mixed with finance roles
  { system: "greenhouse", slug: "assetliving", name: "Asset Living" }, // Property management (national); corporate board, some site roles; no NY
  { system: "greenhouse", slug: "olympusproperty", name: "Olympus Property" }, // Apartment property management (TX and others); no NY
  { system: "greenhouse", slug: "prometheusrealestategroup", name: "Prometheus Real Estate Group" }, // Apartment property management (Bay Area/Pacific NW); no NY
  { system: "lever", slug: "tripalink", name: "Tripalink" }, // Student/residential property management; no NY
  { system: "greenhouse", slug: "propertymanagementassociates", name: "Property Management Associates" }, // Apartment property management (Southern CA); no NY

  // ─── Schools and childcare ───────────────────────────────────────────────────
  { system: "lever", slug: "rocketship", name: "Rocketship Public Schools" }, // Charter school network (education, national); no NY jobs
  { system: "greenhouse", slug: "guidepostmontessori", name: "Guidepost Montessori" }, // Childcare / preschool network nationally; ~2 NY jobs
  { system: "greenhouse", slug: "wonderschool", name: "Wonderschool" }, // Childcare network (national); no NY
  { system: "greenhouse", slug: "achievementfirst", name: "Achievement First" }, // Charter schools (Brooklyn); all 20 US jobs in NY; teaching roles may need certification
  { system: "ashby", slug: "primer", name: "Primer" }, // Microschools (education, national); no NY
];

/** Every board we list. The refresh job indexes all of them. */
export const COMPANIES: CompanyBoard[] = dedupeBoards([
  ...LIVE_FALLBACK_COMPANIES,
  ...ADDED_2026_10_12,
]);

function dedupeBoards(boards: CompanyBoard[]): CompanyBoard[] {
  const seen = new Set<string>();
  return boards.filter((b) => {
    const k = `${b.system}:${b.slug}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** "greenhouse:carvana" — the key used in job_board_status and SourceStatus. */
export function boardKey(b: CompanyBoard): string {
  return `${b.system}:${b.slug}`;
}
