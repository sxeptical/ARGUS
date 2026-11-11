#!/usr/bin/env bun
/**
 * Authoring-time data pipeline (not run in CI or deployment). Builds the
 * static gym bundle from:
 *  - All The Places (CC0) brand store locators: Anytime Fitness, F45
 *    Training, CrossFit, Snap Fitness, and Virgin Active (Singapore).
 *    Filtered to `addr:country === "SG"` inside the Singapore bbox, so
 *    Johor entries that fall inside the bbox (R&F Mall, Sunway Big Box,
 *    CrossFit Johor Bahru) are excluded.
 *  - OpenStreetMap `leisure=fitness_centre` (Overpass API, ODbL).
 *    `access=private` entries and mistagged non-gyms are dropped; OSM
 *    points for a covered brand within ~150 m of an All The Places point
 *    are dropped as the same outlet, and OSM ActiveSG points within
 *    ~300 m of a public SportSG venue are dropped as the same gym.
 *  - SportSG Sport Facilities (data.gov.sg, Singapore Open Data Licence).
 *    Only venues with a gym are kept: Sport Centres and ActiveSG Gym
 *    venues ("Woodlands SC" is the Woodlands Sport Centre abbreviation),
 *    plus the documented exceptions below — a handful of swimming
 *    complexes and the Hockey Village host a gym under a non-"gym" name,
 *    and a few Sport Centres have no gym or have closed. Swimming
 *    complexes, stadiums, courts, fields, and other non-gym venues are
 *    excluded.
 *
 * Gyms absent from every open dataset are curated below with their
 * official source (currently Punggol, which opened after the SportSG
 * dataset's last update).
 *
 * This is a separate script and output (`public/gyms.json`) from
 * `scripts/fetch-amenities.mjs`, following the parks pattern: rerunning it
 * never refetches hawker centres, malls, or their photos.
 *
 * Brands are normalised at the end: every gym gets the operator brand it
 * belongs to (ActiveSG, Anytime Fitness, ..., or "Independent") so the UI
 * can group and filter by it. Detection uses the OSM `brand:wikidata` tag
 * where present (only the few QIDs observed in Singapore OSM data),
 * then the brand/name as whole tokens, so "Jenufit" does not match UFIT
 * and "Gofio" does not match GoFit. All SportSG venues and curated ActiveSG
 * gyms count as ActiveSG. Real chains outside the known list (Barry's,
 * Celebrity Fitness) fall through to "Independent".
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fetchJson, USER_AGENT } from "./lib/commons-photos.mjs";

const ATP_RUNS_URL = "https://data.alltheplaces.xyz/runs/latest.json";
const ATP_OUTPUT_BASE = "https://alltheplaces-data.openaddresses.io/runs";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const SPORTSG_DATASET = "d_9b87bab59d036a60fad2a91530e10773";
const SG_BOUNDS = { minLat: 1.1, maxLat: 1.5, minLng: 103.5, maxLng: 104.1 };

const inSingapore = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) &&
  lat >= SG_BOUNDS.minLat && lat <= SG_BOUNDS.maxLat && lng >= SG_BOUNDS.minLng && lng <= SG_BOUNDS.maxLng;
const round = (value) => Math.round(value * 1e6) / 1e6;
const text = (value) => (typeof value === "string" && value.trim() ? value.trim() : null);
const normalizeName = (name) =>
  name.toLowerCase().replace(/&/g, "and").replace(/\bsingapore\b/g, "").replace(/[^a-z0-9]/g, "");

// Equirectangular metres; accurate to well under 1% for sub-km dedupe. The
// geo-filter library does the same for its radius checks.
const distMetres = (a, b) => {
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat * 6371000, dLng * 6371000);
};

const ATP_SPIDERS = [
  { spider: "anytime_fitness", brand: "Anytime Fitness", category: "gym" },
  { spider: "f45_training", brand: "F45 Training", category: "gym" },
  { spider: "cross_fit", brand: "CrossFit", category: "crossfit" },
  { spider: "snap_fitness", brand: "Snap Fitness", category: "gym" },
  { spider: "virgin_active_sg", brand: "Virgin Active", category: "gym" },
];

// OSM name/brand substrings that All The Places already covers authoritatively.
const COVERED_BRAND_KEYS = ["anytime", "snap", "f45", "virgin", "crossfit"];
const coveredKey = (value) => {
  const haystack = normalizeName(String(value ?? ""));
  return COVERED_BRAND_KEYS.find((key) => haystack.includes(key)) ?? null;
};

// Known operators, matched on whole word tokens (case/spacing-insensitive)
// so substring lookalikes don't leak in ("Jenufit" → UFIT, "Gofio" → GoFit).
// "Gold's Gym" appears as "Gold's" or "Golds"; EnergyOne as one word or two.
const tokens = (value) => String(value ?? "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const hasTokenSeq = (haystack, needle) => {
  if (!needle.length || haystack.length < needle.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    if (needle.every((token, offset) => haystack[i + offset] === token)) return true;
  }
  return false;
};
const BRAND_RULES = [
  { label: "ActiveSG", names: [["activesg"]] },
  { label: "Anytime Fitness", names: [["anytime", "fitness"]] },
  { label: "Snap Fitness", names: [["snap", "fitness"]] },
  { label: "F45 Training", names: [["f45", "training"]] },
  { label: "Virgin Active", names: [["virgin", "active"]] },
  { label: "CrossFit", names: [["crossfit"]] },
  { label: "Fitness First", names: [["fitness", "first"]] },
  { label: "True Fitness", names: [["true", "fitness"]] },
  { label: "Pure Fitness", names: [["pure", "fitness"]] },
  { label: "UFIT", names: [["ufit"]] },
  { label: "GymmBoxx", names: [["gymmboxx"]] },
  { label: "24/7 Fitness", names: [["24", "7", "fitness"]] },
  { label: "Gold's Gym", names: [["gold", "s", "gym"], ["golds", "gym"]] },
  { label: "EnergyOne", names: [["energyone"], ["energy", "one"]] },
  { label: "GoFit", names: [["gofit"]] },
  { label: "Homeground", names: [["homeground"]] },
  { label: "Spartans", names: [["spartans"]] },
];

// OSM `brand:wikidata` QIDs observed for these operators in Singapore data.
// Other chains (Celebrity Fitness, Barry's) are deliberately unmapped so
// they still fall through to "Independent".
const BRAND_BY_WIKIDATA = {
  Q4778364: "Anytime Fitness",
  Q4013942: "Virgin Active",
  Q127120: "Fitness First",
  Q10852204: "Pure Fitness",
};

const matchBrand = (value) => {
  const haystack = tokens(value);
  const rule = BRAND_RULES.find((rule) => rule.names.some((needle) => hasTokenSeq(haystack, needle)));
  return rule?.label ?? null;
};

const normaliseBrand = (gym) => {
  if (gym.source === "sportsg" || gym.source === "curated") return "ActiveSG";
  const wikidata = gym.brandWikidata ? BRAND_BY_WIKIDATA[gym.brandWikidata] : null;
  if (wikidata) return wikidata;
  return matchBrand(gym.brand) ?? matchBrand(gym.name) ?? "Independent";
};

// Mistagged `leisure=fitness_centre` names that are not gyms, and condominium
// facilities (same generic name with no address). Documented, closed list:
// keep this small; legitimate gyms with odd names stay in.
const EXCLUDED_OSM_NAMES = new Set([
  "fitness corner", // condo gyms: 18 address-less nodes clustered in Woodlands
  "sg pho house", // restaurant
  "watersports kayak", // kayak rental
  "g spa", // spa
  "parc riviera gym", // condominium gym
  "twin view gym", // condominium gym
  "gym", // single generic word, no identity
  "lulemon athletica", // retail store
  "fas", // Football Association of Singapore
]);

const categoryForSport = (sport) => {
  const sports = String(sport ?? "")
    .toLowerCase()
    .split(/[;,\s]+/)
    .filter(Boolean);
  if (sports.includes("yoga")) return "yoga";
  if (sports.includes("pilates")) return "pilates";
  if (sports.some((s) => ["taekwondo", "muay_thai", "thai_boxing", "thai_kickboxing", "kickboxing", "boxing", "martial_arts"].includes(s))) return "martial-arts";
  if (sports.includes("climbing")) return "climbing";
  return "gym";
};

const websiteOf = (raw) => {
  const website = text(raw);
  if (!website) return null;
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
};

async function fetchAtp() {
  const latest = await fetchJson(ATP_RUNS_URL, { headers: { "User-Agent": USER_AGENT } });
  const runId = latest?.run_id;
  if (!runId) throw new Error("All The Places latest.json has no run_id");

  const gyms = [];
  for (const { spider, brand, category } of ATP_SPIDERS) {
    const url = `${ATP_OUTPUT_BASE}/${runId}/output/${spider}.geojson`;
    const data = await fetchJson(url, { headers: { "User-Agent": USER_AGENT } });
    let kept = 0;
    for (const feature of data?.features ?? []) {
      const props = feature.properties ?? {};
      const [lng, lat] = feature.geometry?.coordinates ?? [];
      if (!inSingapore(lat, lng)) continue;
      if (props["addr:country"] !== "SG") continue;
      // Display the branch ("Marymount CC"); fall back to the place name so
      // CrossFit / Snap names that already carry the branch stay as tagged.
      const branch = text(props.branch);
      const placeName = text(props.name);
      let name = branch ?? placeName ?? brand;
      // Strip a redundant brand prefix ("Anytime Fitness - Woodlands").
      if (name.toLowerCase().startsWith(brand.toLowerCase())) {
        const stripped = name.slice(brand.length).replace(/^[\s\-:·—]+/, "").trim();
        if (stripped) name = stripped;
      }
      const street = text(props["addr:street_address"]) ?? text(props["addr:full"]);
      const postcode = text(props["addr:postcode"]);
      let address;
      if (!street) address = postcode ? `Singapore ${postcode}` : null;
      else if (postcode && !street.includes(postcode)) {
        // `addr:street_address` sometimes already ends in "Singapore";
        // append the postcode bare there instead of duplicating it.
        address = /singapore/i.test(street) ? `${street} ${postcode}` : `${street}, Singapore ${postcode}`;
      } else address = street;
      // Some `addr:full` values end in a duplicated ", Singapore" after the
      // postcode (".., Singapore 159949, Singapore"); keep the first only.
      if (address && /singapore.*,\s*singapore\s*$/i.test(address)) address = address.replace(/,\s*Singapore\s*$/i, "");
      const ref = String(props.ref ?? "").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
      gyms.push({
        id: `atp-${spider}-${ref || kept}`,
        name,
        brand,
        category,
        address,
        lat: round(lat),
        lng: round(lng),
        openingHours: text(props.opening_hours),
        website: websiteOf(props.website),
        source: "alltheplaces",
      });
      kept += 1;
    }
    console.log(`All The Places ${spider}: ${kept} Singapore gyms`);
  }
  return gyms;
}

// Sport Centres all have a gym; "Woodlands SC" is the Woodlands Sport Centre
// abbreviation. ActiveSG Gym venues are gyms by name.
const defaultSportsgVenue = (venue) =>
  /sport centre/i.test(venue) || /activesg gym/i.test(venue) || venue === "Woodlands SC";

// SportSG venues whose dataset name differs from the official gym display
// name (key: dataset VENUE, value: official name). Names follow ActiveSG's
// gym directory (activesgcircle.gov.sg/facilities/gyms, 31 gyms, last
// updated 8 Nov 2026): Sport Centres host a "<Place> ActiveSG Gym", and the
// community-centre gyms use "ActiveSG Gym @ <Place>" (the dataset omits the
// spaces around "@"). The dataset venue string is kept as a search alias, so
// "Tampines Sport Centre" still finds the gym after the rename.
//  - "Heartbeat@Bedok ActiveSG Sport Centre" has no "Gym" and no spaces
//    around "@"; "Jurong Lake Gardens ActiveSG Gym & Pool" is the gym only
//    (pool is a separate facility), and "Woodlands SC" is abbreviated.
//  - Tampines and Bedok are the user-reported pairs: the official
//    "Tampines ActiveSG Gym" sits at "Level 7 Our Tampines Hub, 1 Tampines
//    Walk", so "Our Tampines Hub"/"OTH" are extra aliases (the building in
//    the address alone would also match those searches).
const SPORTSG_OFFICIAL_GYM_NAMES = {
  "ActiveSG Gym@Ang Mo Kio Community Centre": "ActiveSG Gym @ Ang Mo Kio Community Centre",
  "ActiveSG Gym@Enabling Village": "ActiveSG Gym @ Enabling Village",
  "ActiveSG Gym@Fernvale Square": "ActiveSG Gym @ Fernvale Square",
  "ActiveSG Gym@Serangoon Central": "ActiveSG Gym @ Serangoon Central",
  "ActiveSG Gym@Toa Payoh": "ActiveSG Gym @ Toa Payoh",
  "ActiveSG Gym@Toa Payoh West Community Centre": "ActiveSG Gym @ Toa Payoh West Community Centre",
  "Bishan Sport Centre": "Bishan ActiveSG Gym",
  "Bukit Canberra Sport Centre": "Bukit Canberra ActiveSG Gym",
  "Bukit Gombak Sport Centre": "Bukit Gombak ActiveSG Gym",
  "Choa Chu Kang Sport Centre": "Choa Chu Kang ActiveSG Gym",
  "Clementi Sport Centre": "Clementi ActiveSG Gym",
  "Delta Sport Centre": "Delta ActiveSG Gym",
  "Heartbeat@Bedok ActiveSG Sport Centre": "Heartbeat @ Bedok ActiveSG Gym",
  "Hougang Sport Centre": "Hougang ActiveSG Gym",
  "Jalan Besar Sport Centre": "Jalan Besar ActiveSG Gym",
  "Jurong East Sport Centre": "Jurong East ActiveSG Gym",
  "Jurong Lake Gardens ActiveSG Gym & Pool": "Jurong Lake Gardens ActiveSG Gym",
  "Jurong West Sport Centre": "Jurong West ActiveSG Gym",
  "Pasir Ris Sport Centre": "Pasir Ris ActiveSG Gym",
  "Queenstown Sport Centre": "Queenstown ActiveSG Gym",
  "Sengkang Sport Centre": "Sengkang ActiveSG Gym",
  "Senja-Cashew Sport Centre": "Senja-Cashew ActiveSG Gym",
  "Tampines Sport Centre": "Tampines ActiveSG Gym",
  "Woodlands SC": "Woodlands ActiveSG Gym",
  "Yio Chu Kang Sport Centre": "Yio Chu Kang ActiveSG Gym",
  "Yishun Sport Centre": "Yishun ActiveSG Gym",
};

// Building prefixes the official directory gives in the address but the
// SportSG dataset omits; kept so the venue is still visible (and searchable)
// under the gym's official name.
const SPORTSG_ADDRESS_PREFIXES = {
  "Heartbeat@Bedok ActiveSG Sport Centre": "Level 6 Heartbeat@Bedok",
  "Tampines Sport Centre": "Level 7 Our Tampines Hub",
};

// Extra search aliases beyond the dataset venue string.
const SPORTSG_EXTRA_ALIASES = {
  "Tampines Sport Centre": ["Our Tampines Hub", "OTH"],
};

// SportSG venues that host an ActiveSG gym but whose names don't match the
// default rule (key: dataset VENUE, value: official gym name). Names follow
// ActiveSG's gym directory (activesg.gov.sg/gym-pool-crowd, verified Nov
// 2026); the dataset is stale (last updated Oct 2024):
//  - "ActiveSG Hockey Village @ Boon Lay" omits the "Gym" suffix the
//    official name carries.
//  - Bukit Batok and Katong are listed as swimming complexes, but the gyms
//    operate from the same sites.
//  - Ang Mo Kio Swimming Complex became ActiveSG Sport Park @ Teck Ghee
//    (opened Jan 2026); the dataset still uses the old name.
const SPORTSG_ADDITIONAL_GYM_VENUES = {
  "ActiveSG Hockey Village @ Boon Lay": "ActiveSG Hockey Village @ Boon Lay Gym",
  "Ang Mo Kio Swimming Complex": "ActiveSG Sport Park @ Teck Ghee Gym",
  "Bukit Batok Swimming Complex": "Bukit Batok ActiveSG Gym",
  "Katong Swimming Complex": "Katong ActiveSG Gym",
};

// "Sport Centre" venues with no ActiveSG gym (checked against ActiveSG's
// gym directory, Nov 2026):
//  - Kallang (squash/tennis/netball/lawn bowl/Home of Athletics only) and
//    Serangoon (pool/stadium/hall only) never had one; Serangoon's gym is
//    the separate "ActiveSG Gym @ Serangoon Central".
//  - Toa Payoh Sport Centre (301 Lorong 6 Toa Payoh) closed 31 Oct 2023 for
//    redevelopment into a Regional Sport Centre; its gym moved to 127A
//    Lorong 1 Toa Payoh ("ActiveSG Gym @ Toa Payoh", already covered).
//  - St Wilfred Sport Centre ceased operations permanently in H2 2025 on
//    lease expiry (SportSG media release, 13 Jun 2025).
const SPORTSG_NON_GYM_VENUES = new Set([
  "Kallang Sport Centre",
  "Serangoon Sport Centre",
  "St. Wilfred Sport Centre",
  "Toa Payoh Sport Centre",
]);

const keepsSportsgVenue = (venue) =>
  !SPORTSG_NON_GYM_VENUES.has(venue) &&
  (defaultSportsgVenue(venue) || Object.hasOwn(SPORTSG_ADDITIONAL_GYM_VENUES, venue));

async function fetchSportsg() {
  const poll = await fetchJson(`https://api-open.data.gov.sg/v1/public/api/datasets/${SPORTSG_DATASET}/poll-download`);
  const url = poll?.data?.url;
  if (!url) throw new Error(`No presigned URL returned for ${SPORTSG_DATASET}`);
  const data = await fetchJson(url, { headers: { "User-Agent": USER_AGENT } });
  const features = data?.features ?? [];
  const gyms = [];
  for (const feature of features) {
    if (feature.geometry?.type !== "Point") continue;
    const props = feature.properties ?? {};
    const venue = text(props.VENUE);
    if (!venue || !keepsSportsgVenue(venue)) continue;
    const [lng, lat] = feature.geometry.coordinates ?? [];
    if (!inSingapore(lat, lng)) continue;
    const street = [text(props.ADDRESSBLOCKHOUSENUMBER), text(props.ADDRESSSTREETNAME)].filter(Boolean).join(" ");
    const postcode = text(props.POSTAL_CODE);
    const officialName = SPORTSG_OFFICIAL_GYM_NAMES[venue];
    const name = officialName ?? SPORTSG_ADDITIONAL_GYM_VENUES[venue] ?? venue;
    const addressPrefix = SPORTSG_ADDRESS_PREFIXES[venue];
    const addressStreet = addressPrefix && street ? `${addressPrefix}, ${street}` : street;
    // The dataset venue string stays searchable under the official name.
    const aliases = officialName && officialName !== venue
      ? [venue, ...(SPORTSG_EXTRA_ALIASES[venue] ?? [])]
      : [];
    gyms.push({
      id: `sportsg-${normalizeName(venue)}`,
      name,
      brand: /activesg/i.test(venue) ? "ActiveSG" : "SportSG",
      category: "public",
      address: addressStreet ? `${addressStreet}${postcode ? `, Singapore ${postcode}` : ""}` : null,
      lat: round(lat),
      lng: round(lng),
      openingHours: null,
      website: null,
      ...(aliases.length ? { aliases } : {}),
      source: "sportsg",
    });
  }
  console.log(`SportSG: ${gyms.length} of ${features.length} venues kept (Sport Centres + ActiveSG Gyms)`);
  return gyms;
}

async function fetchOsm() {
  const query = `[out:json][timeout:90];area["ISO3166-1"="SG"]->.a;nwr["leisure"="fitness_centre"]["name"](area.a);out center tags;`;
  const osm = await fetchJson(OVERPASS_URL, {
    method: "POST",
    headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ data: query }),
  });
  const elements = osm?.elements ?? [];
  console.log(`OpenStreetMap: ${elements.length} fitness_centre elements`);
  return elements;
}

const osmToGym = (element) => {
  const tags = element.tags ?? {};
  const name = text(tags.name);
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;
  if (!name || !inSingapore(lat, lng)) return null;
  if (tags.access === "private") return null;
  if (EXCLUDED_OSM_NAMES.has(name.toLowerCase())) return null;
  const isActiveSg = /activesg/i.test(name);
  const street = [text(tags["addr:housenumber"]), text(tags["addr:street"])].filter(Boolean).join(" ");
  const postcode = text(tags["addr:postcode"]);
  return {
    id: `osm-${element.type}-${element.id}`,
    name,
    brand: text(tags.brand) ?? (isActiveSg ? "ActiveSG" : null),
    brandWikidata: text(tags["brand:wikidata"]),
    category: isActiveSg ? "public" : categoryForSport(tags.sport),
    address: street ? `${street}${postcode ? `, Singapore ${postcode}` : ""}` : null,
    lat: round(lat),
    lng: round(lng),
    openingHours: text(tags.opening_hours),
    website: websiteOf(tags.website ?? tags["contact:website"]),
    source: "osm",
  };
};

const [atpGyms, sportsgGyms, osmElements] = await Promise.all([fetchAtp(), fetchSportsg(), fetchOsm()]);

// ActiveSG gyms absent from every open dataset (verified against
// ActiveSG's gym directory, activesg.gov.sg/gym-pool-crowd, Nov 2026).
// Coordinates are the OneMap point linked from the official ActiveSG
// Circle facility page (token-free OneMap postal search returns no
// results; fetch-schools.mjs notes the API needs a name to match on).
// Each entry cites its facility page; keep this list small and check the
// directory before adding — most ActiveSG gyms are covered by SportSG.
const CURATED_ACTIVESG_GYMS = [
  {
    name: "Punggol ActiveSG Gym",
    address: "11 Sentul Crescent, Singapore 828656",
    lat: 1.4087625,
    lng: 103.9068686,
    website: "https://www.activesgcircle.gov.sg/facilities/punggol-activesg-gym",
  },
];

const curatedGyms = CURATED_ACTIVESG_GYMS.map((entry) => ({
  id: `curated-${normalizeName(entry.name)}`,
  name: entry.name,
  brand: "ActiveSG",
  category: "public",
  address: entry.address,
  lat: round(entry.lat),
  lng: round(entry.lng),
  openingHours: null,
  website: entry.website,
  source: "curated",
}));
console.log(`Curated: ${curatedGyms.length} gyms (absent from open datasets)`);

// OSM: drop junk, then node/way duplicates of the same name within 100 m
// (IQ Fightclub, ATP Fitness). Co-located tenants with different names are
// distinct gyms, so — unlike malls — same-spot alone does not dedupe.
const osmGymsRaw = osmElements.map(osmToGym).filter(Boolean);
const osmGyms = [];
for (const gym of [...osmGymsRaw].sort((a, b) => (a.id.startsWith("osm-node") ? 0 : 1) - (b.id.startsWith("osm-node") ? 0 : 1))) {
  const duplicate = osmGyms.some(
    (kept) => normalizeName(kept.name) === normalizeName(gym.name) && distMetres(kept, gym) <= 100,
  );
  if (!duplicate) osmGyms.push(gym);
}

// Drop covered-brand OSM points matching an All The Places point.
const osmAfterAtp = osmGyms.filter((gym) => {
  const key = coveredKey(`${gym.brand ?? ""} ${gym.name}`);
  if (!key) return true;
  return !atpGyms.some((atp) => coveredKey(atp.brand) === key && distMetres(atp, gym) <= 150);
});

// Drop OSM ActiveSG gyms matching a public SportSG venue or curated gym.
// The threshold is wider than the brand-storefront one because sport
// centres are large complexes whose stored point can sit well offset from
// the gym inside. An OSM gym at an ActiveSG Gym venue (e.g. Jurong Lake
// Gardens Gym) is the same gym; independent commercial gyms near other
// Sport Centres stay.
const publicGyms = [...sportsgGyms, ...curatedGyms];
const osmKept = osmAfterAtp.filter((gym) => {
  const isOsmActiveSg = /activesg/i.test(gym.name);
  // Unbranded OSM fitness centres whose name says "gym"/"gymnasium" and that
  // sit on a public ActiveSG site are that site's gym under an older name —
  // e.g. "Tampines Gymnasium" (OSM node 5813931524, no brand tag, 39 m from
  // the Tampines Sport Centre point) is the Our Tampines Hub ActiveSG gym.
  // The 100 m bar is far tighter than the 300 m ActiveSG rule below, so
  // independent gyms near (not on) a sport centre stay.
  const isUnbrandedGymName = !gym.brand && /gym/i.test(gym.name);
  if (isUnbrandedGymName && publicGyms.some((publicGym) => distMetres(publicGym, gym) <= 100)) return false;
  return !publicGyms.some((publicGym) => {
    if (distMetres(publicGym, gym) > 300) return false;
    return isOsmActiveSg || (/activesg/i.test(publicGym.name) && /gym/i.test(gym.name));
  });
});

const merged = [...atpGyms, ...osmKept, ...sportsgGyms, ...curatedGyms];
// Normalise the operator brand now that dedupe (which compares raw brand
// text) is done; brandWikidata is build-only and never reaches the bundle.
const gyms = merged
  .map(({ brandWikidata, ...gym }) => ({ ...gym, brand: normaliseBrand({ ...gym, brandWikidata }) }))
  .sort((a, b) => a.name.localeCompare(b.name, "en-SG"));
if (gyms.length < 300) throw new Error(`Gym sources returned only ${gyms.length} gyms`);

const serialized = JSON.stringify(gyms);
await mkdir("public", { recursive: true });
await writeFile("public/gyms.json", serialized);
const brandCounts = Object.entries(
  gyms.reduce((counts, gym) => ({ ...counts, [gym.brand]: (counts[gym.brand] ?? 0) + 1 }), {}),
).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
console.log(
  `Gyms bundle: ${gyms.length} gyms (${atpGyms.length} All The Places, ${osmKept.length} OpenStreetMap, ` +
    `${sportsgGyms.length} SportSG, ${curatedGyms.length} curated; OSM raw ${osmElements.length}, junk/duped ${osmElements.length - osmKept.length}), ${Buffer.byteLength(serialized)} bytes`,
);
console.log(`Brands: ${brandCounts.map(([brand, count]) => `${brand} ${count}`).join(", ")}`);
