import { resolveDayBudgetCountry } from "@/lib/countryDailyBudget";
import { lookupDestination } from "@/lib/destinationCoords";

/**
 * How a guest actually reaches the resort from the airport.
 * Country table — not a named-city `if (Maldives)` branch in the UI.
 */
export type ResortTransferFlavor =
  | "island_exclusive"
  | "sea_ride_app"
  | "caribbean_official"
  | "generic";

const ISLAND_EXCLUSIVE_COUNTRIES = new Set(["MV"]);
const SEA_RIDE_APP_COUNTRIES = new Set(["TH"]);
const CARIBBEAN_OFFICIAL_COUNTRIES = new Set(["MX", "DO"]);

export type ResortTransferHint = {
  destinationIata?: string;
  destinationName?: string;
  destinationPlace?: string;
  destinationCountry?: string;
};

function transferCountry(hint: ResortTransferHint): string {
  const iata = (hint.destinationIata ?? "").toUpperCase();
  const fromIata = iata ? lookupDestination(iata)?.country : undefined;
  return resolveDayBudgetCountry({
    destinationCountry: hint.destinationCountry || fromIata,
    destinationName: [hint.destinationPlace, hint.destinationName].filter(Boolean).join(" "),
    destinationIata: iata,
  });
}

export function resolveResortTransferFlavor(hint: ResortTransferHint): ResortTransferFlavor {
  const cc = transferCountry(hint);
  if (ISLAND_EXCLUSIVE_COUNTRIES.has(cc)) return "island_exclusive";
  if (SEA_RIDE_APP_COUNTRIES.has(cc)) return "sea_ride_app";
  if (CARIBBEAN_OFFICIAL_COUNTRIES.has(cc)) return "caribbean_official";
  return "generic";
}

const THIN_DRIVER_SIGN =
  /šofer vas bo pričakal|pričakal z napisom|čaka(l)? z napisom|tablica z imenom|driver will (wait|meet|pick).{0,80}sign|meet you with a (name )?sign|holding a sign/i;

function hasHotelBookingPath(text: string): boolean {
  return /naročilo prek hotela|pošljite hotelu|message the hotel|book(ing)?\.com|hotelski transfer|hotel transfer/i.test(
    text,
  );
}

function hasRideAppPath(text: string): boolean {
  return /\b(grab|bolt|uber|careem|aplikacij)/i.test(text);
}

function hasOfficialDeskPath(text: string): boolean {
  return /uradni (pult|taksi)|official (taxi |transfer )?desk|fiksn(o|a) cen|fixed fare|prihodn(e|i) avl/i.test(
    text,
  );
}

export function transferPickupLooksIncomplete(text: string): boolean {
  const raw = text.trim();
  if (!raw) return true;
  const hasThree = hasHotelBookingPath(raw) && hasRideAppPath(raw) && hasOfficialDeskPath(raw);
  if (hasThree) return false;
  if (THIN_DRIVER_SIGN.test(raw)) return true;
  return raw.length < 220;
}

function canonicalTransferPickup(flavor: ResortTransferFlavor, lang: string): string {
  const sl = lang === "sl";
  const shared = sl
    ? [
        "1. Naročilo prek hotela (priporočeno za mir): Po rezervaciji hotela na Booking.com pošljite hotelu sporočilo s številko leta in uro pristanka ter naročite hotelski transfer. Šele takrat vas voznik pričaka z vašim imenom — samodejno vas nihče ne čaka.",
        "2. Lokalna aplikacija za prevoz: Na letališču se povežite na Wi-Fi ali vklopite eSIM in naročite prevoz (npr. Grab / Bolt na Tajskem, Uber v Mehiki, Uber/Careem v arabskem svetu). Prevzemna točka je običajno označena pred terminalom.",
        "3. Uradni letališki taksi pult: Poiščite uradni pult za taksije ali kombije znotraj prihodne avle z vnaprej določeno fiksno ceno. Izogibajte se neuradnim ponudnikom pred stavbo.",
      ]
    : [
        "1. Book via the hotel (best for a calm arrival): After you reserve on Booking.com, message the hotel your flight number and landing time and request their transfer. Only then will a driver wait with your name — nobody waits automatically.",
        "2. Local ride-hailing app: At the airport join Wi-Fi or enable eSIM and book a car (e.g. Grab / Bolt in Thailand, Uber in Mexico, Uber/Careem in the Arab world). The pickup point is usually signed outside the terminal.",
        "3. Official airport taxi desk: Use the official taxi or shuttle counter inside arrivals with a posted fixed fare. Avoid unofficial touts outside the building.",
      ];

  if (flavor === "island_exclusive") {
    const lead = sl
      ? "Transfer do resorta (gliser ali hidroplan) vedno organizira izključno resort. Let (številka in ura) sporočite hotelu vsaj 3 dni pred prihodom — šele potem vas čakajo."
      : "Resort transfer (speedboat or seaplane) is organized exclusively by the resort. Send your flight number and time at least 3 days before arrival — only then will they meet you.";
    const extra = sl
      ? "Javni Grab/taksi velja kvečjemu na Malé/Hulhumalé; do zasebnega otoka to ni alternativa hotelskemu transferju."
      : "Public Grab/taxi is only realistic on Malé/Hulhumalé — it is not a substitute for the resort boat or seaplane to a private island.";
    return [lead, ...shared, extra].join("\n");
  }
  if (flavor === "sea_ride_app") {
    const extra = sl
      ? "Na Tajskem sta običajna Grab in Bolt; v prihodni avli poiščite tudi uradni pult za fiksne taksije ali kombije (minivan)."
      : "In Thailand use Grab or Bolt; inside arrivals you can also book an official fixed-fare taxi or minivan desk.";
    return [...shared, extra].join("\n");
  }
  if (flavor === "caribbean_official") {
    const extra = sl
      ? "Na tej destinaciji (npr. Mehika, Dominikanska republika) najbolj zanesljivo deluje predhodno naročen transfer prek hotela ali uradni pult v terminalu."
      : "Here (e.g. Mexico, Dominican Republic) the reliable options are a pre-booked hotel transfer or the official desk inside the terminal.";
    return [...shared, extra].join("\n");
  }
  return shared.join("\n");
}

/** Prompt block — named places are examples for Gemini, not UI branches. */
export function resortTransferPromptRules(
  flavor: ResortTransferFlavor,
  destLabel: string,
): string {
  const dest = destLabel.trim() || "this destination";
  const extra =
    flavor === "island_exclusive"
      ? `DODATNO za to destinacijo (primeri za razumevanje — NE if-veja: Maldivi): transfer (gliser ali hidroplan) vedno organizira IZKLJUČNO resort. OBVEZNO: gost mora sporočiti let vsaj 3 dni prej. Javni taksi/Grab NI pot do zasebnega otoka.`
      : flavor === "sea_ride_app"
        ? `DODATNO (primeri — NE if-veja: Tajska / Phuket): omeni Grab in Bolt ter uradne letališke pulte za fiksne taksije ali kombije (minivan).`
        : flavor === "caribbean_official"
          ? `DODATNO (primeri — NE if-veja: Mehika / Cancun, Dominikanska republika): poudari predhodno naročen transfer prek hotela ALI uradni pult v terminalu.`
          : `Aplikacije prilagodi regiji (Grab/Bolt, Uber, Uber/Careem) — ne izmišljuj, da nekdo samodejno čaka.`;

  return `=== ARRIVAL TRANSFER (transfer_pickup) ===
Destinacija: ${dest}.
STROGO PREPOVEDANO: pisati samo »Šofer vas bo pričakal z napisom« / »The driver will wait with a sign«. Samodejno vas NIHČE ne čaka, če prevoza niste naročili.
Polje transfer_pickup MORA v jeziku uporabnika razložiti VSE 3 realne poti do resorta (oštevilčeno):
1. Naročilo prek hotela (priporočeno za mir): po rezervaciji na Booking.com sporočilo hotelu s številko leta in uro pristanka + naročilo hotelski transfer. Šele takrat voznik čaka z imenom.
2. Lokalna aplikacija: Wi-Fi / eSIM na letališču, nato Grab / Bolt / Uber / Careem — prevzemna točka pred terminalom.
3. Uradni letališki taksi pult v prihodni avli s fiksno ceno; izogibajte se neuradnim ponudnikom pred stavbo.
${extra}`;
}

export function resortTransferFieldSpec(): string {
  return "3 realne poti do resorta (1 hotel po Booking.com sporočilu, 2 aplikacija, 3 uradni taksi pult). PREPOVEDANO samo »šofer z napisom« — nihče ne čaka brez naročila";
}

/** UI + PDF: keep a full Gemini write-up; replace thin “driver with a sign” copy. */
export function ensureTransferPickupCopy(
  text: string,
  hint: ResortTransferHint,
  lang?: string | null,
): string {
  const flavor = resolveResortTransferFlavor(hint);
  const code = (lang ?? "sl").slice(0, 2).toLowerCase();
  if (!transferPickupLooksIncomplete(text)) {
    if (
      flavor === "island_exclusive" &&
      !/3\s*(dni|days)|three days/i.test(text)
    ) {
      const extra =
        code === "sl"
          ? " Transfer (gliser ali hidroplan) organizira izključno resort — let sporočite vsaj 3 dni prej."
          : " The resort exclusively organizes speedboat or seaplane transfer — send your flight at least 3 days ahead.";
      return `${text.trim()}${extra}`;
    }
    return text.trim();
  }
  return canonicalTransferPickup(flavor, code);
}
