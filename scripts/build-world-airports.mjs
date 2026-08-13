/**
 * Build a compact IATA catalog from OurAirports (public domain).
 * Usage: node scripts/build-world-airports.mjs
 * Expects .tmp-airports/airports.csv and countries.csv
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = resolve(root, ".tmp-airports");
const outDir = resolve(root, "src/lib/data");

/** Extra country names (SL / DE / common) → ISO. OurAirports English names are added too. */
const COUNTRY_ALIASES = {
  KZ: ["kazahstan", "kasachstan", "kazajistan", "qazaqstan"],
  SI: ["slovenija", "slowenien"],
  HR: ["hrvaska", "hrvatska", "kroatien", "croazia", "croatie"],
  AT: ["avstrija", "osterreich", "autriche"],
  DE: ["nemcija", "deutschland", "allemagne", "germania"],
  IT: ["italija", "italien", "italia", "italie"],
  ES: ["spanija", "spanien", "espana", "espagne", "spagna"],
  FR: ["francija", "frankreich", "francia"],
  PT: ["portugalska", "portogallo"],
  GR: ["grcija", "grecja", "griechenland", "grecia", "grece"],
  TR: ["turcija", "turkiye", "turkei", "turchia", "turquie"],
  EG: ["egipt", "egipto", "aegypten", "agypten", "egypte", "egitto"],
  TH: ["tajska", "tailandia", "thailande", "thailandia"],
  ID: ["indonezija", "indonesien", "indonesie"],
  MY: ["malezija", "malajzia", "malaisie", "maleisi"],
  PH: ["filipini", "filipinas", "philippinen", "filippine"],
  JP: ["japonska", "japon", "giappone"],
  VN: ["viet nam"],
  CN: ["kitajska", "china", "chine", "cina"],
  KR: ["juzna koreja", "suedkorea", "coree", "corea"],
  IN: ["indija", "inde", "indie"],
  AE: ["emirati", "emirats", "zdruzeni arabski emirati", "uae"],
  US: ["amerika", "zda", "etats unis", "stati uniti", "usa"],
  GB: ["velika britanija", "england", "angleska", "angleška", "uk", "britain"],
  NL: ["nizozemska", "holland", "pays bas", "olanda"],
  CH: ["svica", "schweiz", "suisse", "svizzera"],
  BE: ["belgija", "belgien", "belgique", "belgio"],
  PL: ["poljska", "polen", "pologne", "polonia"],
  CZ: ["ceska", "tschechien", "tchequie", "repubblica ceca"],
  HU: ["madzarska", "ungarn", "hongrie", "ungheria"],
  SK: ["slovaska", "slowakei", "slovaquie", "slovacchia"],
  RO: ["romunija", "rumanien", "roumanie", "romania"],
  BG: ["bolgarija", "bulgarien", "bulgarie", "bulgaria"],
  RS: ["srbija", "serbien", "serbie", "serbia"],
  BA: ["bosna", "bosnien", "bosnie"],
  ME: ["crna gora", "montenegro"],
  MK: ["severna makedonija", "mazedonien"],
  AL: ["albanija", "albanien", "albanie"],
  XK: ["kosovo"],
  UA: ["ukrajina", "ukraine"],
  RU: ["rusija", "russland", "russie", "russia"],
  IS: ["islandija", "island", "islande", "islanda"],
  IE: ["irska", "irland", "irlande", "irlanda"],
  SE: ["svedska", "schweden", "suede", "svezia"],
  NO: ["norveska", "norwegen", "norvege", "norvegia"],
  FI: ["finska", "finnland", "finlande", "finlandia"],
  DK: ["danska", "danemark", "danimarca"],
  MA: ["maroko", "maroc", "marokko", "marruecos"],
  TN: ["tunizija", "tunisie", "tunesien"],
  ZA: ["juzna afrika", "sudafrika", "afrique du sud"],
  KE: ["kenija"],
  TZ: ["tanzanija", "zanzibar"],
  NA: ["namibija", "namibie", "namibien"],
  BW: ["bocvana", "botsuana", "botsvana"],
  ZW: ["zimbabve", "simbabwe"],
  MU: ["mavricius", "ile maurice", "mauricius"],
  SC: ["sejseli", "seychellen", "seszele"],
  MG: ["madagaskar"],
  AU: ["avstralija", "australie", "australien"],
  NZ: ["nova zelandija", "neuseeland", "nouvelle zelande"],
  CA: ["kanada"],
  MX: ["mehika", "mexique", "messico"],
  BR: ["brazilija", "brasil", "bresil"],
  AR: ["argentinien", "argentine"],
  CL: ["cile", "chili"],
  PE: ["perù"],
  CO: ["kolumbija", "colombie"],
  CU: ["kuba"],
  DO: ["dominikanska republika", "dominicana"],
  JM: ["jamajka", "jamaika"],
  CR: ["kostarika"],
  MV: ["maldivi", "malediven", "maldivas", "maldive"],
  LK: ["srilanka", "cejlon"],
  SG: ["singapur", "singapour"],
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQ && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if ((c === "," && !inQ) || ((c === "\n" || c === "\r") && !inQ)) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      if (c !== ",") {
        if (row.some((cell) => cell !== "")) rows.push(row);
        row = [];
      }
    } else {
      cur += c;
    }
  }
  if (cur || row.length) {
    row.push(cur);
    if (row.some((cell) => cell !== "")) rows.push(row);
  }
  return rows;
}

function norm(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shortName(name) {
  return name
    .replace(/\s+International Airport$/i, "")
    .replace(/\s+Intl Airport$/i, "")
    .replace(/\s+International$/i, "")
    .replace(/\s+Airport$/i, "")
    .trim();
}

function sizeRank(type) {
  if (type === "large_airport") return 1;
  if (type === "medium_airport") return 2;
  return 3;
}

const airportRows = parseCsv(readFileSync(resolve(srcDir, "airports.csv"), "utf8"));
const countryRows = parseCsv(readFileSync(resolve(srcDir, "countries.csv"), "utf8"));
const aHeader = airportRows[0];
const cHeader = countryRows[0];
const aIdx = Object.fromEntries(aHeader.map((h, i) => [h, i]));
const cIdx = Object.fromEntries(cHeader.map((h, i) => [h, i]));

const countries = [];
const countryByCode = new Map();
for (const row of countryRows.slice(1)) {
  const code = String(row[cIdx.code] ?? "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) continue;
  const names = new Set();
  const add = (v) => {
    const n = norm(v);
    if (n.length >= 2) names.add(n);
  };
  add(row[cIdx.name]);
  add(code);
  for (const part of String(row[cIdx.keywords] ?? "").split(/[,;]/)) add(part);
  for (const extra of COUNTRY_ALIASES[code] ?? []) add(extra);
  const entry = { code, names: [...names].sort() };
  countries.push(entry);
  countryByCode.set(code, entry);
}

const byIata = new Map();
for (const row of airportRows.slice(1)) {
  const type = row[aIdx.type];
  const iata = String(row[aIdx.iata_code] ?? "").toUpperCase();
  const scheduled = String(row[aIdx.scheduled_service] ?? "").toLowerCase() === "yes";
  if (!/^[A-Z]{3}$/.test(iata)) continue;
  if (type === "closed" || type === "heliport" || type === "seaplane_base" || type === "balloonport") {
    continue;
  }
  const size = sizeRank(type);
  if (size === 3 && !scheduled) continue;

  const city = String(row[aIdx.municipality] ?? "").trim();
  const name = shortName(String(row[aIdx.name] ?? "").trim()) || city || iata;
  const country = String(row[aIdx.iso_country] ?? "").toUpperCase();
  const keys = String(row[aIdx.keywords] ?? "")
    .split(/[,;]/)
    .map((k) => norm(k))
    .filter((k) => k.length >= 2 && k !== norm(city) && k !== norm(name) && k !== iata.toLowerCase());

  const next = {
    iata,
    city: city || name,
    name,
    country,
    size,
    keys: keys.slice(0, 6),
  };
  const prev = byIata.get(iata);
  if (!prev || next.size < prev.size || (next.size === prev.size && keys.length > (prev.keys?.length ?? 0))) {
    byIata.set(iata, next);
  }
}

const airports = [...byIata.values()].sort((a, b) => a.iata.localeCompare(b.iata));
const compactAirports = airports.map((a) => {
  const row = [a.iata, a.city, a.name, a.country, a.size];
  if (a.keys.length) row.push(a.keys.join(" "));
  return row;
});

mkdirSync(outDir, { recursive: true });
const payload = {
  source: "OurAirports (public domain)",
  builtAt: new Date().toISOString().slice(0, 10),
  airports: compactAirports,
  countries: countries.map((c) => [c.code, c.names]),
};
writeFileSync(resolve(outDir, "worldAirports.json"), JSON.stringify(payload));

const large = airports.filter((a) => a.size === 1).length;
const medium = airports.filter((a) => a.size === 2).length;
const small = airports.filter((a) => a.size === 3).length;
console.log(
  JSON.stringify(
    {
      airports: airports.length,
      large,
      medium,
      small,
      countries: countries.length,
      bytes: Buffer.byteLength(JSON.stringify(payload)),
      nqz: byIata.get("NQZ"),
      ala: byIata.get("ALA"),
    },
    null,
    2,
  ),
);
