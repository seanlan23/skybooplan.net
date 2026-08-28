import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject, streamObject } from "ai";
import { geminiApiKey } from "@/lib/llm";
import {
  GEMINI_GENERATION_TIMEOUT_MS,
  pipelineLog,
  safeJsonParse,
  withTimeout,
} from "@/lib/asyncTimeout";
import {
  parseCoercedTripPlan,
  thisResponseDaySpan,
  tripPlanGeminiSchema,
  tripPlanSchema,
  type GenerateTripPlanParams,
  type TripPlanPax,
  type TripPlanResponse,
  type TripBudgetTier,
} from "@/lib/geminiPro.shared";
import {
  detectAccommodationMode,
  detectHotelRestInterval,
  motorhomePromptRules,
} from "@/lib/tripMode";
import { groundTransportPromptBlock, lastDayReturnPromptBlock } from "@/lib/groundTransport";
import { travelRequirementsPromptBlock } from "@/lib/travelRequirements";
import { planTeaserText } from "@/lib/planTeaser";
import { STRICT_LLM_LANGUAGE_RULE } from "@/lib/planLanguages";
import {
  currencyWritingRule,
  normalizePlanCurrency,
  STRICT_LLM_CURRENCY_RULE,
  type PlanCurrency,
} from "@/lib/planCurrency";
import { languageWritingRule } from "@/lib/tripLocale";
import {
  buildUserStayPlanPromptBlock,
  hasExplicitStayPlan,
  parseStayPlanFromWishes,
} from "@/lib/userStayPlan";
import { flightContextPromptBlock } from "@/lib/geminiFlightContext";
import { lookupDestination } from "@/lib/destinationCoords";
import { DISTANCE_TRANSPORT_RULES } from "@/lib/transportPromptRules";
import {
  HARD_DRIVE_HOURS,
  HARD_DRIVE_KM,
  LAST_DAY_HOME_MAX_HOURS,
  TARGET_DRIVE_HOURS,
  TARGET_DRIVE_KM,
  plannerQualityPromptBlock,
} from "@/lib/plannerQuality";
import { unifiedTripPlanSystemRules } from "@/lib/unifiedTripPlanPrompt";
import {
  buildTravelBriefUserBlock,
  type TravelBriefFields,
} from "@/lib/travelDesignerPrompt";
import { normalizeAppLang } from "@/lib/i18n";

export type {
  GenerateTripPlanParams,
  TripBudgetTier,
  TripPlanPax,
  TripPlanResponse,
  TripWishTag,
} from "@/lib/geminiPro.shared";
export {
  TRIP_WISH_TAGS,
  tripPlanSchema,
  tripPlanGeminiSchema,
  isTripPlanResponse,
  normalizeTripPlanPax,
  normalizeIata,
  weatherWidgetSchema,
  safetyWarningSchema,
  weatherSummarySchema,
} from "@/lib/geminiPro.shared";
export type { WeatherSummary, WeatherWidget, SafetyWarningPayload } from "@/lib/geminiPro.shared";

const BUDGET_LABELS: Record<TripBudgetTier, string> = {
  budget: "Budget (nizki proračun) — stroga meja ≈ ≤1000 € na osebo na destinaciji (brez mednarodnih letov)",
  standard:
    "Standard — stroga meja ≈ ≤2000 € na osebo na destinaciji (brez mednarodnih letov). Ne načrtuj luksuznih lodge/fly-in safarijev.",
  premium: "Premium — višji standard dovoljen (vključno z lodgi, če sodi k destinaciji)",
};

/** Affordable southern/east-Africa steer when user is not on premium. */
function southernAfricaBudgetSteer(
  budget: TripBudgetTier,
  destinationIata?: string,
  destination?: string,
): string {
  if (budget === "premium") return "";
  const blob = `${destinationIata ?? ""} ${destination ?? ""}`.toLowerCase();
  const safariAfrica =
    /\b(bw|na|za|ke|gbe|mub|wdh|ers|jnb|cpt|nbo|botswana|bocvana|namibia|namibija|south africa|juzna afrika|kenya|kenija|nairobi)\b/i.test(
      blob,
    );
  if (!safariAfrica) return "";
  return `

STROGO — PRORAČUN ${budget === "budget" ? "BUDGET" : "STANDARD"} + SAFARI AFRIKA (Bocvana / Namibija / JAR / Kenija):
- PREPOVEDANO: Okavango fly-in lodge, private concession camps, balloon safari, luxury Mara/Moremi overnight, river lodge za €400+/noč.
- Namesto tega: mid-range lodges / guesthouses BLIZU DIVJINE (Maun, Kasane, Sesriem, Etosha, Kruger gate, Maasai Mara, Amboseli), self-drive / day trips (€40–180/osebo) — NE polniti dni z glavnimi mesti in nakupovalnimi centri.
- Hub pravilo: Gaborone / Windhoek / Johannesburg / Nairobi = max 1 noč ob prihodu + max 1–2 noči pred odletom (buffer). PREPOVEDANO 3+ zaporednih dni v teh hubih / Otjiwarongu za malls / city walks. Cape Town sme biti destinacija (ne samo buffer).
- Odvečne dni daj na wilderness: Bocvana → Maun/Makgadikgadi/Chobe; Namibija → Sesriem/Damaraland/Etosha; JAR → Kruger / Garden Route; Kenija → Maasai Mara / Amboseli — ne na capital shopping.
- Skupni stroški na destinaciji (brez mednarodnih letov) MORJO ostati znotraj proračuna na osebo.`;
}

function formatPaxForPrompt(pax: TripPlanPax): string {
  const ages = pax.childrenAges ?? [];
  if (ages.length === 0) {
    return `${pax.adults} odrasli${pax.adults === 1 ? "" : "h"}`;
  }
  return `${pax.adults} odrasli${pax.adults === 1 ? "" : "h"}, otroci (starosti v letih): ${ages.join(", ")}`;
}

const PACE_LABELS: Record<NonNullable<GenerateTripPlanParams["pace"]>, string> = {
  intensive: "intenziven",
  relaxed: "sproščen",
  calm: "miren",
};

/**
 * Single source of truth for priority / day slots / pace — injected into system + user prompts
 * so Gemini cannot invent “full day before landing” or ignore an explicit stay plan.
 */
export function tripPlanControlRules(params: {
  pace?: GenerateTripPlanParams["pace"];
  hasFlightContext: boolean;
  explicitStayPlan: boolean;
  arrivalCity: string;
  destinationIata: string;
  arrivalDay: number;
  groundTransport?: boolean;
}): string {
  const pace = params.pace ?? "relaxed";
  const lightPace = pace === "calm" || pace === "relaxed";
  const arrivalDay = Math.max(1, params.arrivalDay);

  const paceBlock =
    pace === "intensive"
      ? `- TEMPO INTENZIVEN: 3–4 aktivnosti/dan je OK, a še vedno realni odmori za prevoz in hrano.
- Ne packaj dveh težkih celodnevnih izletov isti dan.`
      : pace === "calm"
        ? `- TEMPO MIREN / UMIRJEN (obvezno — uporabnik ne želi napora):
  • Tipično 1–2 lahki aktivnosti na poln dan (ne 3 težke).
  • Vsak dan naj ima prostor za počitek (bazen, plaža, siesta, počasen zajtrk) — to NI “filler”, to je namen.
  • PREPOVEDANO: celodnevni treking + dolg transfer + nočni program isti dan.
  • Premiki med bazami: samo transfer + check-in + lahka večerja; brez “raziskovanja okolice” isti dan.
  • pois[] na fazo: 2–4 (ne 6) — kakovost pred količino.`
        : `- TEMPO SPROŠČEN (obvezno — ne naporen itinerar):
  • Tipično 2 aktivnosti na poln dan + večerja/sprehod; ne polni dopoldan+popoldan+večer z “must-see” vsak slot.
  • Po dolgem transferju (≥2h): samo check-in + lahka aktivnost.
  • PREPOVEDANO: nabijanje 4+ ogledov ali “tropska pavza” kot lažni program pred dejanskim prihodom.
  • pois[] na fazo: 3–4 dovolj.`;

  const preArrival =
    arrivalDay > 1
      ? `• Dnevi 1–${arrivalDay - 1}: samo odhod/let — BREZ plaže, zajtrka ob morju, sieste na destinaciji.`
      : `• Pristaneš na dan 1 — pred uro pristanka ni destinacijskih aktivnosti.`;

  const flightDayBlock = params.groundTransport
    ? `- Potovanje po kopnem: dnevi so polni glede na tempo zgoraj.`
    : params.hasFlightContext
      ? `- LET IMA PREDNOST PRED “POLNIM DNEVOM” (STROGI JSON — dan ${arrivalDay} + zadnji dan):
  • Dan prihoda = dan ${arrivalDay} (ne izmišljuj zgodnejšega prihoda).
  ${preArrival}
  • Na dan ${arrivalDay}: v JSON vpiši prihod/transfer z urami iz IZBRANI LET, nato samo lahki program PO pristanku. PREPOVEDANO plaža/zajtrk pred pristankom.
  • PREPOVEDANO: “Zajtrk ob morju”, “Tropska pavza”, bazen ali promenada, če let še ni pristal.
  • Zadnji dan: check-out + transfer + mednarodni let z urami iz IZBRANI LET; pred tem samo lahki ogledi.`
      : `- Če ni izbranega leta: dan 1 = prihod v ${params.arrivalCity} (${params.destinationIata}), lahek program.`;

  const stayBlock = params.explicitStayPlan
    ? `- UPORABNIKOV RAZPORED MEST/NOČI ima ABSOLUTNO PREDNOST pred limito baz, kurirano potjo, “aklimatizacijo” in omejitvijo vstopnih metropol.
- hotels[] in days[].city MORATA ujemati NATANČNO število nočitev iz želja. PREPOVEDANO spreminjati števila ali dodajati noči na prvo bazo (1 noč na hubu ostane 1 noč).
- PREPOVEDANO enodnevni izlet (gliser/ladja/let) na kraj, kjer ima potnik že samostojno večdnevno bivanje (npr. Koh Phi Phi kot baza ⇒ ni izleta na Phi Phi iz Phuketa ali Ao Nanga). Ta prepoved je INTERNO pravilo načrtovanja — NIKOLI je ne izpisuj v naslove/opise aktivnosti.
- Vrnitev na Phuket/Patong za odhod je dovoljena, če je v željah.`
    : `- Brez eksplicitnega razporeda: mesta in nočitve izberi glede na želje, let in število dni.
- METROPOLA vs NOTRANJOST (strogo): če je vstop/izstop velika tranzitna metropola (npr. Bangkok, Kuala Lumpur, Toronto, Tokio): na začetku NAJVEČ 2–3 nočitve; ob povratku NAJVEČ 1–2 nočitvi (zaključek + transfer na letališče). Ista metropola skupaj ≤ 30 % celotnega trajanja potovanja.
- Sproščene dni nameni notranjosti: kulturni/gorski centri (npr. Chiang Mai) ≥3 nočitve (celodnevni izlet kot Doi Inthanon brez hitenja); otoki in naravni parki (npr. Koh Yao Noi, Khao Sok) ≥3 nočitve. PREPOVEDANO nategovati vstopni hub, medtem ko ima notranja baza 1–2 noči.`;

  return `
=== HIERARHIJA PRAVIL (obvezno — ob konfliktu zmaga višje) ===
1) Uporabnikove želje / razpored mest in noči
2) IZBRANI LET (realne ure prihoda/odhoda) — prazni sloti pred pristankom
3) Tempo potovanja (${PACE_LABELS[pace]}) — lahek program, ne naporen
4) Predlog poti (samo če točki 1 ni) — smeš dodati/izpustiti bazo; ne nategovati ene plaže
5) “Poln dan” (dopoldan/popoldan/večer) — SAMO na polnih dneh na destinaciji, ko ni konflikta z 2–3

${stayBlock}

${flightDayBlock}

TEMPO IN OBREMENITEV:
${paceBlock}

ČASOVNA STRUKTURA DNEVA (tempo je fleksibilno prilagojen; JSON sloti so obvezni):
- Na POLNIH dneh na destinaciji: zapolni morning, afternoon in evening z realnim programom glede na tempo (miren = lažji slot, ne izmišljen filler).
- JSON ključi morning / afternoon / evening so OBVEZNI vsak dan. Pred pristankom slot = popoln opis leta/čakanja — BREZ plaže, zajtrka ob morju, sieste.
- prazni timeSlot-i PRED/ZA letom so OBVEZNI kot vsebina (ni destinacijskega programa) — polje v JSON pa ostane izpolnjeno.
- PREPOVEDANO izmišljen “must-see” samo zato, da je slot turističen, če je potnik še v zraku.
- Aktivnosti ene baze / dneva NE smejo “prehitevati” naslednje baze (npr. dan v Ao Nangu ≠ trajekt na Koh Phi Phi; to šele na dnevu premika).

FAZE vs DNEVI (brez mešanja):
- itinerar[].pois[] = samo znamenitosti TE faze/baze — vsaka faza MORA imeti ≥1 POI z realnimi lat/lng v istem mestu.
- days[].city = mesto NOČITVE (kraj/vas/otok kjer spiš) — NE vstopno letališko mesto za vsak dan. Zaporedni dnevi v isti bazi MORAJU imeti isto city. PREPOVEDANO: enodnevni skok nazaj na prejšnje vozlišče brez transferja tisti dan (npr. A–A–B–A).
- days[].title = unikaten naslov dneva (kaj se dogaja) — NIKOLI samo "Dan 1" / "Dan 2".
- hotels[] = ena vrstica na bazo (city + nights), v istem vrstnem redu kot nočitve. PREPOVEDANO: ena vrstica z vstopnim mestom za celo potovanje.
- days[].activities in transportation[] = samo ta koledarski dan.
- Naslednji premik gre na dan ODHODA, ne na prvi dan bivanja.

MAPBOX / KOORDINATE (obvezno):
- Vsaka sightseeing aktivnost in vsak POI: natančen lat/lng V MESTU faze (ne letališki runway, ne sosednje mesto).
- PREPOVEDANO: Bangkok POI na danu v Phuketu/Krabiju; Paris POI v Barceloni; itd.
- NE ponavljaj istega POI/imena na dveh različnih dneh (razen hotela/check-ina).
- season_warning = samo sezona/vreme/praktični nasvet — BREZ promocij (eSIM, zavarovanje, popusti, “tvoj AI načrt”).
===`.trim();
}

/** Shared LLM rules for per-day travel hacks and transport logic (system + user prompt). */
export function itineraryHacksAndTransportRules(displayCurrency: PlanCurrency): string {
  return `
${DISTANCE_TRANSPORT_RULES}

TRAVEL HACK (days[].travelHack — obvezno vsak dan):
- Vsak dan MORA imeti polje travelHack z enim unikatnim, lokacijsko specifičnim insider nasvetom za TA dan in TA mesto (ne generičen nasvet za celotno državo).
- Prepovedano je ponavljati isti ali skoraj enak travel hack na več dneh — vsak dan druga tema (npr. lokalna tržnica, skriti vhod, urnik templja, najboljši kot za fotografijo, lokalna jed, izogibanje vrstam).
- travelHack mora biti praktičen, konkreten in vezan na aktivnosti tistega dne — ne kopiraj season_warning in ne piši splošnih fraze o vremenu.

TRANSPORT IN PREMIKANJE (obvezno — več plasti):

0) TRANSPORTNE ZNAČKE NA AKTIVNOSTIH (activities[] — obvezno za vsak premik):
- Vsaka aktivnost, ki predstavlja premik med lokacijami (category "airport", notranji let, trajekt, vlak, speedboat, kombi, taxi), MORA imeti OBVEZNA polja:
  • transport_type: "flight" | "ferry" | "train" | "van" | "bus" | "taxi"
  • duration: natančen čas premika (npr. "1h 10min", "45min", "2h 30min") — nikoli prazno
- Primer aktivnosti z letom (arrivalTime = začetek aktivnosti/odhod, departureTime = konec/pristanek — kronološko):
  { "title": "Notranji let Bangkok → Chiang Mai", "category": "airport", "transport_type": "flight", "duration": "1h 10min", "timeSlot": "dopoldan", "arrivalTime": "08:00", "departureTime": "09:10", ... }
- UI prikaže ikono prevoza + trajanje iz teh polj — brez njih značke NE delujejo!

1) PREMIK MED AKTIVNOSTMI (v activities[] — kratka točka, ne esej):
- Za vsako aktivnost (razen zadnje v dnevu) dodaj ENO kratko točko (v bullets[] ali kot vrstico "- …" v description): kako se premakneš do NASLEDNJE (peš / metro / Grab / taxi …) + približen čas/cena v ${displayCurrency}.
- PREPOVEDANO: dolg neformatiran odstavek o večerji/prevozu — max 1 vrstica za premik, detajli v transportTip.

2) DNEVNI PREVOZNI PREGLED (days[].transportTip — obvezno vsak dan):
- Polje transportTip mora vsak dan vsebovati strukturiran pregled premikanja za tisti dan v 2–4 stavkih:
  • primarni način prevoza v mestu/regiji,
  • priporočene lokalne aplikacije (npr. Grab/Bolt v Bangkoku, InDrive na Phuketu, Uber v ZDA, Citymapper v Evropi — izberi realne za lokacijo),
  • kako rezervirati / kupiti vstopnice za javni prevoz (npr. Rabbit Card, BTS day pass),
  • opozorila (promet, dež, zaprte ceste) specifična za ta dan.
- Cene letališče↔hotel / Grab-taxi v transportTip morajo biti usklajene z realnim pasom destinacije (Tajska tipično 15–35 € za HKT→Patong) — NE piši 5–15 € in hkrati 25–35 €.
- Ne ponavljaj identičnega transportTip na več dneh — prilagodi mesto (Bangkok ≠ Chiang Mai ≠ Phuket).

3) NASVETI LOKALCEV IN VARNOST (days[].local_tips — obvezno vsak dan, type: string):
- Vsak dan 2–3 kratki nasveti, STROGO vezani na konkretna mesta/aktivnosti TISTEGA dne (vstopnine, rezervacije, bonton, napitnine, odpiralni časi) — ne generični checklist za celo državo in ne kopija travelHack/transportTip.
- Ne ponavljaj identičnega local_tips na več dneh. Prepovedano copy-paste šablona "voda iz pipe + ulična hrana + oblačenje v templjih + napitnine" na vsako mesto.
- Kodeks oblačenja v templjih/wat SAMO če ta dan res obiščeš tempelj/wat/svetišče. PREPOVEDANO "oblačenje v templjih" na New York, Pariz, Rim ali druga mesta brez templja tisti dan.
- Primeri, samo ko je to na sporedu tistega dne: napitnine v ZDA; bonton na Broadwayu; vstopnine/rezervacije za The Met; pravila pri gospel maši v Harlemu; ramena pokrita pri Wat Pho.
- Prepovedano: generično "bodi previden" / "uporabi zdravo pamet".

4) MEDMESTNI / OTOŠKI PREVOZ (days[].transportation[] — obvezno ko relevantno):
- Ob letu, vlaku, trajektu, speedboatu ali kombiju med mesti obvezno izpolni transportation[] z vsakim korakom (type, from, to, duration, estimatedPrice).
- transportation[] je OBVEZNO na vsakem dnevu z medmestnim prevozom — UI kartice z ikono letala/trajekta berejo ta array, ne samo opis aktivnosti!
- Vsak zapis v transportation[] mora imeti duration (npr. "1h 10min") — enako kot activities[].duration za isti korak.
- Primer enega dneva z letom:
  "transportation": [{ "type": "flight", "from": "Bangkok BKK", "to": "Chiang Mai CNX", "duration": "1h 10min", "estimatedPrice": 45 }]
- transfer / transportation[] SAMO ko se mesto nočitve zamenja (nova baza, from !== to). PREPOVEDANO FLIGHT/VAN/FERRY banner za enodnevne izlete iz iste baze (npr. otoški/zalivski izlet) — to so samo activities.
- Za otoke: navedi urnike trajektov in hitrih čolnov, sezonske odpovedi, rezervacijo vnaprej, pristanišče in transfer letališče → pristanišče.
- Otok z letališčem na celini: 3 koraki (flight → van → ferry) — glej pravilo spodaj. Otok BREZ piste: nikoli ne izmisli leta na otok; uporabi resnične noge (čoln/kombi/let na celinsko letališče).
- Phuket → Krabi / Ao Nang: SAMO gliser/trajekt (ferry/speedboat) ALI cestni kombi/taxi (~2.5h). PREPOVEDANO notranji let HKT–KBV.
- Koh Lanta NIMA lastnega letališča; poleti za to območje gredo z letališča Krabi (KBV), nato kombi + trajekt/gliser. PREPOVEDANO izmišljeno letališče na Lanti.
- Isla Mujeres: če je na poti, takoj po prihodu v Cancún ALI zadnja baza pred odhodom (trajekt ~20 min). PREPOVEDANO vstaviti otok v sredino celinske obale (Cancún → Isla Mujeres → Playa del Carmen → Tulum → Valladolid).
- Varnostne prevare, voda, hrana in bonton spadajo v local_tips — NE v transportTip. transportTip = samo kako se premikati (A→B, app, karta).
`.trim();
}

function wishesBlob(params: GenerateTripPlanParams): string {
  return [
    params.customWishes?.trim() ?? "",
    params.wishTags.join(" "),
    params.priorities?.join(" ") ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

function isMotorhomeTrip(params: GenerateTripPlanParams): boolean {
  // Explicit car mode wins over wishes that mention "avtodom".
  if (params.groundTransportMode === "car") return false;
  if (params.groundTransportMode === "motorhome") return true;
  return detectAccommodationMode(wishesBlob(params)) === "motorhome";
}

function isCarRoadTrip(params: GenerateTripPlanParams): boolean {
  return params.groundTransportMode === "car";
}

function isRoadTripRequest(params: GenerateTripPlanParams): boolean {
  return /route\s*66|road\s*trip|roadtrip|cesta\s*66|po\s+poti/i.test(wishesBlob(params));
}

/**
 * Cap overnight bases so each camp lasts ≥2 nights (day trips from the same
 * base). Calendar days[] still cover the full trip (e.g. 11 days → max 5 camps).
 */
export function motorhomeRoadTripMaxBases(days: number): number {
  if (days <= 0) return 0;
  if (days <= 2) return 1;
  return Math.max(1, Math.floor(days / 2));
}

/** Force Gemini to emit only one day_number window — used when streaming long trips in batches. */
export function dayRangePromptBlock(params: GenerateTripPlanParams): string {
  const span = thisResponseDaySpan(params);
  if (!span.isPartial) return "";
  const visited = params.dayRange?.visitedCities?.filter(Boolean) ?? [];
  const lastCity = params.dayRange?.lastCity?.trim();
  const continuation =
    span.start > 1
      ? `- NADALJEVANJE: dnevi 1–${span.start - 1} so ŽE zgenerirani${lastCity ? ` (zadnji dan: ${lastCity})` : ""}${visited.length ? `. Že obiskana mesta: ${visited.join(", ")}` : ""}.
- NE generiraj day_number 1–${span.start - 1}. Ne začenjaj poti znova na letališču prihoda.
- Destinacije iz želja, ki še NISO med že obiskanimi (npr. drugo mesto/država), MORAŠ vključiti v tem razponu.`
      : `- To je SAMO prvi del ${span.total}-dnevne poti. Generiraj začetek; kasnejši dnevi pridejo v naslednjem klicu. Ne stisni cele poti v ${span.count} dni.`;
  return `
RAZPON DNI ZA TA JSON (STROGO — prebije vsa druga pravila o številu dni):
- Generiraj SAMO day_number ${span.start} do ${span.end} — natanko ${span.count} day{} objektov.
- Celotna pot ima ${span.total} koledarskih dni.
${continuation}
- PREPOVEDANO vrniti manj kot ${span.count} day{} ali day_number zunaj ${span.start}–${span.end}.
`;
}

function travelBriefFieldsFromParams(params: GenerateTripPlanParams): TravelBriefFields {
  const customWishes = params.customWishes?.trim() ?? "";
  const wishBlob = wishesBlob(params);
  const motorhome = isMotorhomeTrip(params);
  const carTrip = isCarRoadTrip(params);
  const trainTrip = params.groundTransportMode === "train";
  const openJaw =
    Boolean(params.returnFromIata) &&
    params.returnFromIata !== params.destinationIata;

  const origin =
    params.originPlace?.trim() ||
    lookupDestination(params.originIata)?.name ||
    params.originIata ||
    "not specified";

  const destName =
    params.destinationPlace?.trim() ||
    params.destination?.trim() ||
    lookupDestination(params.destinationIata)?.name ||
    params.destinationIata;
  const destParts = [destName];
  if (params.destinationIata) destParts.push(`(${params.destinationIata})`);
  if (openJaw && params.returnFromIata) {
    destParts.push(`open-jaw return from ${params.returnFromIata}`);
  }
  const destinations = destParts.filter(Boolean).join(" ");

  const mainTransport: TravelBriefFields["mainTransport"] = motorhome
    ? "motorhome"
    : carTrip
      ? "car"
      : trainTrip
        ? "train"
        : openJaw
          ? "multi-city flights"
          : "flight";

  const extraTransport: string[] = [];
  if (params.flightContext && !params.groundTransportMode) {
    const fc = params.flightContext;
    extraTransport.push(
      `Selected ticket: outbound ${params.originIata} ${fc.outboundDepart} → ${params.destinationIata} ${fc.outboundArrive}${fc.outboundArriveDayOffset ? ` (+${fc.outboundArriveDayOffset} day)` : ""}.`,
    );
    if (fc.inboundDepart) {
      extraTransport.push(
        `Return ${params.returnFromIata ?? params.destinationIata} ${fc.inboundDepart}${fc.inboundArrive ? ` → ${params.originIata} ${fc.inboundArrive}` : ""}.`,
      );
    }
  }
  if (params.originPlace && params.destinationPlace && params.groundTransportMode) {
    extraTransport.push(
      `Ground: ${params.originPlace} → ${params.destinationPlace} by ${params.groundTransportMode}.`,
    );
  }
  if (params.wishTags.includes("Najem avtomobila")) {
    extraTransport.push("Rental car requested for part or all of the trip.");
  }
  const additionalTransport =
    extraTransport.join(" ") || "None specified — use what the destination and dates require.";

  const pace: TravelBriefFields["pace"] =
    params.pace === "intensive"
      ? "intensive"
      : params.pace === "calm"
        ? "relaxed"
        : "balanced";

  const interestBits = [
    ...(params.priorities ?? []),
    ...params.wishTags.filter(
      (t) => t !== "Najem avtomobila" && t !== "Brez nočnih voženj" && t !== "Vegetarijansko/Vegansko" && t !== "Dostopno z vozičkom",
    ),
  ].filter(Boolean);
  const interests =
    interestBits.length > 0 ? interestBits.join(", ") : "not specified — keep a balanced mix";

  const budget: TravelBriefFields["budget"] =
    params.budget === "budget"
      ? "budget"
      : params.budget === "premium"
        ? "higher"
        : "mid-range";

  const accommodation = motorhome
    ? "campsites / RV parks (no invented hotel names)"
    : carTrip
      ? "hotels (city + nights only — Booking.com)"
      : "hotels (city + nights only — Booking.com)";

  const stayHits = hasExplicitStayPlan(wishBlob || customWishes)
    ? parseStayPlanFromWishes(customWishes || wishBlob)
    : [];
  const mandatoryPlaces =
    stayHits.length >= 2
      ? stayHits.map((s) => `${s.nights} night(s) in ${s.city}`).join("; ")
      : customWishes ||
        "None specified — design the route from the destination, dates, interests and selected flight.";

  const extraWishes: string[] = [];
  if (stayHits.length >= 2 && customWishes) extraWishes.push(customWishes);
  if (params.wishTags.includes("Vegetarijansko/Vegansko")) {
    extraWishes.push("Vegetarian / vegan meals.");
  }
  if (params.wishTags.includes("Dostopno z vozičkom")) {
    extraWishes.push("Wheelchair-accessible where possible.");
  }
  if (params.wishTags.includes("Brez nočnih voženj")) {
    extraWishes.push("Avoid night driving.");
  }
  if (params.wishTags.includes("Najem avtomobila") && !extraTransport.some((x) => /Rental car/i.test(x))) {
    extraWishes.push("Rental car where useful.");
  }
  const additionalWishes =
    extraWishes.filter(Boolean).join("\n") || "None specified.";

  return {
    origin,
    destinations,
    startDate: params.departDate,
    endDate: params.returnDate ?? params.departDate,
    travellers: formatPaxForPrompt(params.pax),
    mainTransport,
    additionalTransport,
    pace,
    interests,
    budget,
    accommodation,
    mandatoryPlaces,
    additionalWishes,
    language: params.language,
    currency: params.currency ?? "EUR",
    userWishes: customWishes || "None specified.",
    wishTags: params.wishTags.length > 0 ? params.wishTags.join(", ") : "none",
  };
}

function buildTripPlanPrompt(params: GenerateTripPlanParams): string {
  const wishes =
    params.wishTags.length > 0
      ? params.wishTags.join(", ")
      : "brez posebnih zahtev";
  const customWishes = params.customWishes?.trim() ?? "";
  const motorhome = isMotorhomeTrip(params);
  const carTrip = isCarRoadTrip(params);
  const roadTrip = isRoadTripRequest(params) || carTrip;
  const route = params.originPlace && params.destinationPlace
    ? `${params.originPlace} → ${params.destinationPlace}`
    : params.returnFromIata
      ? `${params.originIata} → ${params.destinationIata}, povratek iz ${params.returnFromIata}`
      : `${params.originIata} → ${params.destinationIata}`;
  const dates = params.returnDate
    ? `${params.departDate} → ${params.returnDate}`
    : params.departDate;
  const pace = params.pace ? PACE_LABELS[params.pace] : "sproščen";
  const priorities =
    params.priorities?.length ? params.priorities.join(", ") : "brez posebnih prioritet";

  const wishBlob = wishesBlob(params);
  const explicitStayPlan = hasExplicitStayPlan(wishBlob || customWishes);

  const maxBases = explicitStayPlan
    ? params.days
    : motorhome || roadTrip
      ? motorhomeRoadTripMaxBases(params.days)
      : params.days <= 9
        ? 2
        : params.days <= 14
          ? 3
          : params.days <= 21
            ? 4
            : 4;

  const span = thisResponseDaySpan(params);
  const dayObjectsRule = span.isPartial
    ? `vsota itinerar[].days[] = NATANKO ${span.count} day{} z day_number ${span.start}–${span.end} (celotna pot = ${span.total} dni — ostalih dni NE generiraj)`
    : `vsota vseh itinerar[].days[] = NATANKO ${span.total} ločenih dnevnih objektov`;

  const tvojeZeljeBlock = customWishes
    ? `

=== TVOJE ŽELJE (ABSOLUTNA PREDNOST — pred predlogom poti in limito baz) ===
${customWishes}

Če želje vsebujejo razpored mest z dnevi/nočmi: itinerar[] in days[].city MORATA slediti temu razporedu. PREPOVEDANO ga zamenjati s prednastavljeno potjo, če uporabnik tega ni prosil.
===`
    : "";

  const motorhomeBlock = motorhome
    ? `

NAČIN POTOVANJA: AVTODOM / RV / CAMPERVAN (obvezno)
- Polje hotels v JSON vrni kot prazno polje [] — brez hotelov!
- Namesto hotelov za vsak dan dodaj konkretno aktivnost za nočitev: RV park / kamp / campground (category: hotel) z imenom in lokacijo.
- PREPOVEDANO v description/name: "hotel", "okolica hotela", "blizu hotela" — vedno kamp / avtodom / sosta.
- HRANA: NE dodajaj kosila/večerje/zajtrka skoraj vsak dan. Kuhanje v avtodomu je privzeto. Največ 1–2 posebni food aktivnosti na celotno pot (npr. ena dobra konoba). Ostali dnevi: ogledi, vožnja, plaža, kamp — BREZ category food.
- PREPOVEDANO: generični filler "Lokalna večerja", "Večernji sprehod in lokalna večerja", "Kosilo na poti", "Pavza v kavarni".
- Med mesti načrtuj vožnjo z avtodomom — ne notranjih letov. Dnevna etapa ${TARGET_DRIVE_KM}–${HARD_DRIVE_KM} km (max 6–${HARD_DRIVE_HOURS} h z postanki). PREPOVEDANO 1500–2200 km v enem dnevu.
- Parkiraj RV izven mestnega jedra; v center z javnim prevozom ali P+R.
- itinerar[] = največ ${maxBases} baz/kampov (to NI število dni!).
- KRITIČNO: ${dayObjectsRule}. Primer: ${span.count} day{} z ${maxBases} kampi = več day{} na istem kampu — NIKOLI samo ${maxBases} day{} objektov.
- Vsaka baza/kamp: NAJMANJ 2 noči (dnevni izleti iz kampa). 1 noč samo za čisti transfer ali zadnji hub. PREPOVEDANO menjati kamp vsakih 24 ur.
${roadTrip ? "- Road trip: enosmerna pot vzdolž ceste; večnočni kampi na isti postaji so OK (ne vsak dan nova baza)." : ""}`
    : "";

  const carHotelBlock = carTrip
    ? `

NAČIN POTOVANJA: AVTO / ROAD TRIP Z HOTELI (obvezno)
- Nočitve = hoteli v mestih vsak večer (Booking.com).
- hotels[] = { city, nights } — PREPOVEDANO izmišljati konkretna imena hotelov. UI odpre žive Booking opcije.
- PREPOVEDANO kot namestitev: kamp, RV park, campground, sosta, "spanje v avtu", avtodom.
- itinerar[] = največ ${maxBases} hotelskih baz (mesta) — to NI število dni!
- KRITIČNO: ${dayObjectsRule}. Več noči v istem mestu = več day{} na isti hotelski bazi.
- Road trip: enosmerna pot; več noči v istem mestu so OK (ne vsak dan novo mesto).
- Ena etapa ${TARGET_DRIVE_KM}–${HARD_DRIVE_KM} km / ≤${TARGET_DRIVE_HOURS} h čiste vožnje (trdo max ${HARD_DRIVE_HOURS} h). PREPOVEDANO 1500–2200 km ali 8–16 h kot en JSON dan.
- Lastno vozilo: outbound+inbound = krog ALI vmesne tranzitne nočitve. Day N = samo zadnja etapa domov (≤${LAST_DAY_HOME_MAX_HOURS} h).
- Zadnji dan day.city = izhodišče. 2 noči v Rimu/Kotorju/Parizu ali izpusti mesto.`
    : "";

  const groundTransportBlock =
    params.groundTransportMode && params.originPlace && params.destinationPlace
      ? groundTransportPromptBlock(
          params.groundTransportMode,
          params.originPlace,
          params.destinationPlace,
        )
      : "";

  const lastDayBlock = span.includesDeparture
    ? lastDayReturnPromptBlock({
        groundTransportMode: params.groundTransportMode,
        originPlace: params.originPlace,
        returnFromIata: params.returnFromIata,
        destinationIata: params.destinationIata,
      })
    : "";

  const flightReturnLine = !span.includesDeparture
    ? `- Ta del se konča z dnevom ${span.end} — NE generiraj mednarodnega odhoda/povratka (to pride v zadnjem delu).`
    : params.groundTransportMode
      ? "- Povratek domov mora ustrezati izbranemu prevozu (avto/vlak/avtodom) — glej pravila spodaj, NE let z letališča."
      : `- Zadnji dan: v JSON vpiši check-out/transfer/let z urami iz IZBRANI LET za ${params.returnFromIata ?? params.destinationIata}.`;

  const flightReturnClosing =
    !span.includesDeparture || params.groundTransportMode
      ? ""
      : params.flightContext?.inboundDepart
        ? "\n\nZadnji dan: v JSON vpiši category airport / check-out / transfer z urami NATANKO iz IZBRANI LET. Aplikacija JSON ne prepisuje. trip_metadata.return_flight_eu = natanko te ure."
        : "\n\nZadnji dan: vpiši airport/check-out/transfer samo z zanesljivimi urami. trip_metadata.return_flight_eu izpolni samo če imaš zanesljive ure.";

  const selectedFlightBlock =
    (span.includesArrival || span.includesDeparture) &&
    !params.groundTransportMode &&
    params.flightContext
      ? flightContextPromptBlock(params.flightContext, params.days, {
          originIata: params.originIata,
          destinationIata: params.destinationIata,
          language: params.language,
        })
      : "";

  const lang = normalizeAppLang(params.language ?? "sl");
  const displayCurrency = normalizePlanCurrency(params.currency);
  const teaser = planTeaserText(lang);
  const teaserBlock = `
UVODNI TEASER (obvezno — pred 1. dnem):
Na samem začetku polja trip_metadata.season_warning (uvodno besedilo pred dnevnim načrtom) mora biti kot prvi stavek NATANKO ta tekst, v izbranem jeziku uporabnika:
"${teaser}"
Takoj za tem nadaljuj s kratkim narativnim uvodom o poti (največ 1–2 stavka — samo vzbudi zanimanje za itinerar). Varnostna opozorila, vreme, sezona in oblačila NE piši v season_warning — gredo v safetyWarning in weatherWidget (spodaj).`;

  const travelReqBlock = travelRequirementsPromptBlock({
    originIata: params.originIata,
    destinationIata: params.destinationIata,
    destinationLabel: params.destination,
    language: lang,
  });

  const arrivalCityName =
    lookupDestination(params.destinationIata)?.name ??
    params.destinationPlace ??
    params.destination;
  const arrivalDayNum = 1 + (params.flightContext?.outboundArriveDayOffset ?? 0);
  const userStayPlanBlock = buildUserStayPlanPromptBlock(
    wishBlob || customWishes,
    params.days,
    { arrivalDay: arrivalDayNum },
  );
  const arrivalDayRule = !span.includesArrival
    ? `- Dan prihoda je že zgeneriran. Začni z dnevom ${span.start} v nadaljevanju poti — ne ponavljaj letališča prihoda.`
    : params.groundTransportMode
      ? ""
      : arrivalDayNum > 1
        ? `- Dan prihoda na destinacijo = dan ${arrivalDayNum} v ${arrivalCityName} (${params.destinationIata}). Dnevi pred tem = samo let — brez destinacijskih aktivnosti. Prepovedan notranji let stran z letališča prihoda na dan prihoda.`
        : `- Dan 1 = ${arrivalCityName} (prihod na ${params.destinationIata}). Prepovedan notranji let stran z letališča prihoda na dan 1.`;

  const poisPerPhase =
    motorhome || roadTrip
      ? "2–3 znamenitosti (ne več — krajši JSON)"
      : lightPacePoisHint(params.pace);

  const titleLine = span.isPartial
    ? `Ustvari dneve ${span.start}–${span.end} (od skupno ${span.total}) načrta potovanja za lokacijo: ${params.destination} v mesecu ${params.month}.`
    : `Ustvari ${params.days}-dnevni načrt potovanja za lokacijo: ${params.destination} v mesecu ${params.month}.`;

  return `${buildTravelBriefUserBlock(travelBriefFieldsFromParams(params))}

${titleLine}
${dayRangePromptBlock(params)}
${span.includesArrival ? teaserBlock : ""}
${travelReqBlock}
${plannerQualityPromptBlock({
  road: Boolean(params.groundTransportMode === "car" || params.groundTransportMode === "motorhome" || roadTrip || carTrip),
  totalDays: params.days,
  lockUserStayPlan: explicitStayPlan,
})}
${userStayPlanBlock ?? ""}
${tvojeZeljeBlock}${motorhomeBlock}${carHotelBlock}${groundTransportBlock}

Jezik izhoda: ${lang} — 100% tega jezika (glej USER PARAMETERS languageCode).
Valuta: ${displayCurrency}.
Let: ${route}.
Datumi: ${dates} (${params.days} dni).
Potniki: ${formatPaxForPrompt(params.pax)}.
Tempo potovanja: ${pace} — spoštuj TEMPO IN OBREMENITEV zgoraj (ne naporen itinerar).
Kaj jih zanima: ${priorities}.
Prevoz: ${params.groundTransportMode ?? "flight"}${
    params.originPlace && params.destinationPlace
      ? ` (${params.originPlace} → ${params.destinationPlace})`
      : ""
  }.
Proračun: ${BUDGET_LABELS[params.budget]}.
${southernAfricaBudgetSteer(params.budget, params.destinationIata, params.destination)}
Posebne zahteve (oznake): ${wishes}.

Obvezna logistična pravila za ta načrt:
- ${
    explicitStayPlan
      ? `Število in vrstni red baz = NATANKO po UPORABNIKOVEM RAZPOREDU zgoraj (ne skrči na tipičnih ${Math.min(4, params.days)} baz). PREPOVEDANO dodajati noči na prvo bazo.`
      : motorhome
        ? `Načrtuj največ ${maxBases} baz/kampov vzdolž enosmerne poti; ${dayObjectsRule} (več noči na isti bazi = več day{} — NE samo ${maxBases} day{}).`
        : carTrip || roadTrip
          ? `Načrtuj največ ${maxBases} hotelskih baz (mesta) vzdolž enosmerne poti; ${dayObjectsRule} (več noči v istem mestu = več day{} — NE samo ${maxBases} day{}). PREPOVEDANO: kamp/RV/sosta kot nočitev.`
        : `Število in vrstni red mest izbereš ti glede na želje, let in ${params.days} dni.`
  }
- ${explicitStayPlan ? "Sledi uporabnikovemu vrstnemu redu mest (vrnitev na odhodni hub je dovoljena, če je v razporedu). PREPOVEDANO enodnevni izlet na otok/kraj z že načrtovanim večdnevnim bivanjem." : "Enosmerna geografska pot (en jasen lok); brez vračanja v že obiskana mesta."}
${arrivalDayRule}
${flightReturnLine}
- Za vsako fazo obvezno izpolni city (angleško ime), lat in lng (centrum mesta${motorhome ? " ali kamp ob poti" : ""}).
- Vsaka aktivnost mora imeti category (sightseeing, nature, beach, food, entertainment, hotel, airport) in koordinate za oglede.
- PREPOVEDANO: znamenitosti enega mesta na dnevu v drugem mestu (POI ∈ baza).
- timeSlot je obvezen: "dopoldan", "popoldan" ali "vecer". Za mednarodni prihod/odhod vpiši HH:MM NATANKO iz IZBRANI LET — aplikacija JSON ne prepisuje.
- ČASOVNA STRUKTURA: JSON ključi morning/afternoon/evening so VEDNO obvezni. Pred/za letom slot opiše let/čakanje — ne izmišljene plaže. Miren tempo = manj ogledov, ne manjkajoči ključi.
- Vsak dan obvezno izpolni travelHack (unikaten insider nasvet), transportTip (dnevni pregled prevoza) in local_tips (2–3 kratki nasveti lokalcev, vezani na konkretna mesta TISTEGA dne — ne ista šablona vsak dan).
- Za dni z notranjim letom, trajektom, kombijem ali vlakom obvezno izpolni transportation[] (type: flight|ferry|train|van, from, to, duration, estimatedPrice v ${displayCurrency}). Za otok z letališčem na celini (npr. Boracay/MPH) obvezno 3 koraki: let → kombi → trajekt.
- Vsak dan (days[]) mora imeti daily_budget_per_person_eur (realna številka EUR na osebo, tipično 35–70 na poln dan, NIKOLI 0), drivingDistanceKm in drivingDurationHours (npr. "3h 45m").
- Polje days[].date mora biti vedno v ISO obliki YYYY-MM-DD (npr. "2026-08-14") — ne slovenskega datuma; day_name je lahko "Sobota, 14. avgust".
- Za vsako fazo (itinerar[]) generiraj pois[] — ${poisPerPhase} z name, description, lat, lng, unsplashQuery, tripAdvisorStyleDetails (highlights, proTip, bestTimeOfDay, rating, reviewSummary). Samo POI te baze.
- UNSPLASH ISKANJE SLIK (obvezno): Za vsako fazo (itinerar[]) izpolni unsplashQuery z čistim angleškim izrazom za mesto (npr. "Dubai", ne "Dubaj"). Za vsak POI (pois[]) in vsako aktivnost z ogledom izpolni unsplashQuery z uradnim angleškim imenom znamenitosti (npr. "Burj Khalifa", ne "Burj Kalifa"). Brez slovenskih črk — samo angleščina, kot jo uporablja Unsplash/Google.
- Vsaka aktivnost z ogledom mora imeti tripAdvisorStyleDetails (razen hotel/airport).
- Na polnih dneh: smiselno število aktivnosti glede na tempo (miren ≈ 1–2, sproščen ≈ 2, intenziven ≈ 3–4). Dan prihoda = lahek program šele po namestitvi. Raje kratek let/počitek v slotu kot "jutranji sprehod" / "če imaš energijo".

Opisi aktivnosti: ${motorhome || roadTrip ? "1–2 kratki točki" : "2–4 kratke točke"} v bullets[] (ali "- " vrstice) — nikoli en neformatiran odstavek. Vsaka aktivnost mora imeti estimatedCostEur (realna cifra v ${displayCurrency}). day_name zapisuj s polnimi imeni mesecev (npr. "Sobota, 14. avgust"). season_warning naj bo geografsko natančen za ${params.destination}.

${itineraryHacksAndTransportRules(displayCurrency)}

${selectedFlightBlock}
${lastDayBlock}${flightReturnClosing}`;
}

/** User message sent to Gemini — briefing first, then JSON rules. */
export function tripPlanUserPrompt(params: GenerateTripPlanParams): string {
  return buildTripPlanPrompt(params);
}

function lightPacePoisHint(pace?: GenerateTripPlanParams["pace"]): string {
  if (pace === "calm") return "2–4 znamenitosti (ne več)";
  if (pace === "intensive") return "vsaj 3–6 znamenitosti";
  return "3–4 znamenitosti (dovolj za sproščen tempo)";
}

/** Structured trip-plan JSON — override via GEMINI_TRIP_PLAN_MODEL in .env / Vercel. */
export function resolveTripPlanModel(raw?: string | null): string {
  const requested = raw?.trim() || "gemini-2.5-flash-lite";
  // 2.5 Flash/Pro think for minutes with zero itinerary tokens.
  if (/^gemini-2\.5-flash$/i.test(requested) || /^gemini-2\.5-pro/i.test(requested)) {
    return "gemini-2.5-flash-lite";
  }
  return requested;
}

export const GEMINI_TRIP_PLAN_MODEL = resolveTripPlanModel(process.env.GEMINI_TRIP_PLAN_MODEL);

/** Structured-output cap for the one-shot itinerary JSON (15–20 day calendars). */
export const GEMINI_TRIP_PLAN_MAX_OUTPUT_TOKENS = 32768;
export const GEMINI_TRIP_PLAN_TEMPERATURE = 0.3;
/** 2.5 Flash default thinking burns the stall window with zero JSON tokens. */
export const GEMINI_TRIP_PLAN_THINKING_BUDGET = 0;

const google = createGoogleGenerativeAI({
  apiKey: geminiApiKey() ?? undefined,
});

const tripPlanGenerationConfig = {
  maxOutputTokens: GEMINI_TRIP_PLAN_MAX_OUTPUT_TOKENS,
  temperature: GEMINI_TRIP_PLAN_TEMPERATURE,
  providerOptions: {
    google: {
      maxOutputTokens: GEMINI_TRIP_PLAN_MAX_OUTPUT_TOKENS,
      thinkingConfig: {
        thinkingBudget: GEMINI_TRIP_PLAN_THINKING_BUDGET,
        includeThoughts: false,
      },
    },
  },
} as const;

export function tripPlanSystemPrompt(params: GenerateTripPlanParams): string {
  const span = thisResponseDaySpan(params);
  const motorhome = isMotorhomeTrip(params);
  const carTrip = isCarRoadTrip(params);
  const roadTrip = isRoadTripRequest(params) || carTrip;
  const explicitStayPlan = hasExplicitStayPlan(wishesBlob(params));
  const motorhomeRules = motorhome ? motorhomePromptRules(true) : "";
  const lastDayBlock = span.includesDeparture
    ? lastDayReturnPromptBlock({
        groundTransportMode: params.groundTransportMode,
        originPlace: params.originPlace,
        returnFromIata: params.returnFromIata,
        destinationIata: params.destinationIata,
      })
    : "";
  const flightReturnEuRule = params.groundTransportMode
    ? `- Če je prevoz avto/vlak/avtodom: trip_metadata.return_flight_eu NE izpolnjuj — potnik se vrne z istim prevozom na izhodišče (${params.originPlace ?? "domov"}), ne z letalom.`
    : params.flightContext?.inboundDepart
      ? `- trip_metadata.return_flight_eu: uporabi NATANKO ure iz IZBRANI LET (departure_time=${params.flightContext.inboundDepart}, arrival_time_eu=${params.flightContext.inboundArrive ?? ""}) — ne izmišljaj drugih.${
          params.flightContext.inboundStops != null && params.flightContext.inboundStops > 0
            ? ` PREPOVEDANO: summary NE sme reči "direct"/"direktni" — let ima ${params.flightContext.inboundStops} postanek(ov)${params.flightContext.inboundVia ? ` prek ${params.flightContext.inboundVia}` : ""}.`
            : params.flightContext.inboundStops === 0
              ? " Summary sme omeniti direktni let samo ker je IZBRANI LET nonstop."
              : ' PREPOVEDANO: v summary NE trdi "direct"/"direktni let", razen če je eksplicitno nonstop.'
        }`
      : `- Na zadnjem dnevu logistike obvezno generiraj točno uro mednarodnega leta nazaj v Evropo (EU) in izpolni trip_metadata.return_flight_eu. NE trdi "direct"/"direktni", če nisi 100% prepričan (HKT–MUC / BKK–MUC skoraj nikoli ni direkt).`;

  const selectedFlightSystemBlock =
    (span.includesArrival || span.includesDeparture) &&
    !params.groundTransportMode &&
    params.flightContext
      ? flightContextPromptBlock(params.flightContext, params.days, {
          originIata: params.originIata,
          destinationIata: params.destinationIata,
          language: params.language,
        })
      : "";
  const povratekEuBlock =
    !span.includesDeparture
      ? ""
      : params.groundTransportMode
    ? `POVRATEK DOMOV (obvezno — ${params.groundTransportMode === "train" ? "VLAK" : "AVTO/AVTODOM"}):
- Zadnji dan: vožnja/vlak nazaj na izhodiščno lokacijo — NE mednarodni let z letališča.
- Zadnji dan day.city = izhodišče (${params.originPlace ?? "domov"}) — ne Munich/Zagreb/Nîmes z naslovom „vožnja domov“.
- Day N = samo zadnja zmerna etapa (≤${LAST_DAY_HOME_MAX_HOURS} h). PREPOVEDANO 1500–2200 km / 8–16 h JSON dan; če je etapa ≥${LAST_DAY_HOME_MAX_HOURS} h ali >${HARD_DRIVE_KM} km, nočitev vmes.
- Lastno vozilo: outbound+inbound = krog ALI tranzitne baze z nočitvami.
- trip_metadata.return_flight_eu NE izpolnjuj.`
    : `POVRATEK V EU (obvezno — STROGI JSON):
- Zadnji dan: v JSON vpiši check-out, prevoz na letališče in mednarodni let z urami iz IZBRANI LET. Aplikacija tega JSON-a ne prepisuje.
- trip_metadata.return_flight_eu: kopiraj ure iz IZBRANI LET (ne izmišljuj).`;

  const lang = normalizeAppLang(params.language ?? "sl");
  const displayCurrency: PlanCurrency = normalizePlanCurrency(params.currency);
  const writingRule = languageWritingRule(lang);
  const moneyRule = currencyWritingRule(displayCurrency);

  const travelReqBlock = travelRequirementsPromptBlock({
    originIata: params.originIata,
    destinationIata: params.destinationIata,
    destinationLabel: params.destination,
    language: lang,
  });

  const arrivalCity =
    lookupDestination(params.destinationIata)?.name ??
    params.destinationPlace ??
    params.destination ??
    params.destinationIata;
  const returnAirport = params.returnFromIata ?? params.destinationIata;

  const arrivalDayNum = 1 + (params.flightContext?.outboundArriveDayOffset ?? 0);
  const controlRules = tripPlanControlRules({
    pace: params.pace,
    hasFlightContext: Boolean(params.flightContext && !params.groundTransportMode),
    explicitStayPlan,
    arrivalCity,
    destinationIata: params.destinationIata,
    arrivalDay: arrivalDayNum,
    groundTransport: Boolean(params.groundTransportMode),
  });

  const userStayPlanBlock = buildUserStayPlanPromptBlock(
    wishesBlob(params),
    params.days,
    { arrivalDay: arrivalDayNum },
  );

  const arrivalAirportBlock =
    params.groundTransportMode || !span.includesArrival
      ? ""
    : `
PRIHODOVNO LETALIŠČE (OBVEZNO — prednost pred vsemi primeri poti):
- Mednarodni let potnika pristane na ${params.destinationIata} (${arrivalCity}).
- Dan prihoda na destinacijo = dan ${arrivalDayNum} v ${arrivalCity}${
        arrivalDayNum > 1
          ? ` (dnevi pred tem = samo odhod/let — BREZ plaže/zajtrka/sieste na destinaciji)`
          : ""
      }.
- Prepovedano: notranji let z ${params.destinationIata} na drug hub (npr. HKT→BKK, CNX→BKK, DPS→CGK) na dan prihoda ali dan zatem samo zato, da bi “začeli v prestolnici”.
${
  explicitStayPlan
    ? `- Če uporabnik predpiše samo 1 noč na bazi prihoda, NASLEDNJI dan sme biti transfer (kombi/trajekt/notranji let). PREPOVEDANO dodajati 1–2 “polna dneva” na hub za aklimatizacijo. Prepovedan notranji let SAMO na sam dan prihoda, pred nočitvijo.`
    : `- Notranji leti so dovoljeni šele ko potnik zapusti bazo prihoda po vsaj 1–2 polnih dneh tam.`
}
- Odhod nazaj: izhodno letališče je ${returnAirport}${
        returnAirport !== params.destinationIata
          ? " (open-jaw — pot lahko končaš proti temu letališču)"
          : " — končaj pot v isti regiji, ne sili v Bangkok buffer, če ni potreben"
      }.
`;

  const interests =
    [params.priorities?.join(", "), params.wishTags.join(", "), params.customWishes]
      .filter(Boolean)
      .join(" — ") || "none specified";

  const lodgingBlock = carTrip
    ? `STROGO PRAVILO — AVTO / ROAD TRIP Z HOTELI:
- hotels[] = samo city + nights — UI/PDF odpreta Booking.com. PREPOVEDANO izmišljati imena hotelov.
- PREPOVEDANO kot namestitev: kamp, RV park, campground, sosta, avtodom, "spanje v avtu".
- Med mesti načrtuj vožnjo z avtom — enosmerna pot z realističnimi etapami.`
    : motorhome
      ? `STROGO PRAVILO — AVTODOM / RV / CAMPERVAN:
- hotels[] MORA biti []. Za vsak dan: RV park / kamp z realnim imenom. Med mesti samo vožnja z avtodomom.`
      : `STROGO PRAVILO — HOTELI:
- hotels[] / accommodations[] = samo city + nights. Never invent hotel names.`;

  const routeBlock = explicitStayPlan
    ? `VEČ DESTINACIJ: uporabnikov razpored mest/dni ima ABSOLUTNO PREDNOST. Sledi vrstnemu redu in NATANČNEMU številu nočitev; days[].city mora ujemati. PREPOVEDANO dodajati noči na prvo bazo. PREPOVEDANO enodnevni izlet na kraj z že načrtovanim večdnevnim bivanjem. Ta prepoved je INTERNO pravilo — NIKOLI je ne izpisuj v opise aktivnosti.`
    : motorhome
      ? `ROAD TRIP: največ ${motorhomeRoadTripMaxBases(params.days)} bazami/kampi. days[] = NATANKO ${params.days} koledarskih day{} ((END_DATE − START_DATE) + 1). PREPOVEDANO: ena baza na vsak dan. Vsaka baza NAJMANJ 2 noči (dnevni izleti); 1 noč samo transfer/hub.`
      : carTrip || roadTrip
        ? `ROAD TRIP: največ ${motorhomeRoadTripMaxBases(params.days)} hotelskimi bazami. days[] = NATANKO ${params.days} koledarskih day{} ((END_DATE − START_DATE) + 1).`
        : `Število mest izberi glede na želje, let in ${params.days} dni ((END_DATE − START_DATE) + 1) — ne nategovati ene plaže.`;

  return `Si strokovni potovalni agent za aplikacijo skybooplan. Striktno sledi zahtevani JSON shemi.

${unifiedTripPlanSystemRules({
  startDate: params.departDate,
  endDate: params.returnDate ?? params.departDate,
  totalDays: params.days,
  language: lang,
  displayCurrency,
  interests,
  emitStart: span.start,
  emitEnd: span.end,
})}

${dayRangePromptBlock(params)}

${STRICT_LLM_LANGUAGE_RULE}

${STRICT_LLM_CURRENCY_RULE}

JEZIK IZHODA:
${writingRule}

VALUTA (displayCurrency = ${displayCurrency}):
${moneyRule}

${controlRules}

${userStayPlanBlock ?? ""}
${travelReqBlock}
${arrivalAirportBlock}
${selectedFlightSystemBlock}
${motorhomeRules}

${lodgingBlock}

STROGI JSON — dnevna polja:
- Vsak dan: activities.morning + activities.afternoon + activities.evening (vsi trije ključi), transportTip (transportne opombe za TO mesto) in local_tips (2–3 kratki nasveti, vezani na lokacije TISTEGA dne).
- Preferiraj bullets. PREPOVEDANO wall of text / en dolg neformatiran odstavek.
- arrivalTime/departureTime: on the selected international flights copy IZBRANI LET clocks exactly. The app will not rewrite this JSON.
- weatherWidget { season, avgTemp, clothing } obvezno. safetyWarning objekt ali null.
- itinerar[] faza: city (Booking.com angleško ime), lat, lng, unsplashQuery. pois[] samo te baze (${lightPacePoisHint(params.pace)}).
- Inter-city: transportation[] { type, from, to, duration, estimatedPrice }.
${flightReturnEuRule}

${povratekEuBlock}

${routeBlock}

${lastDayBlock}

PRILAGODITEV POTNIKOM IN PRORAČUNU:
- Prilagodi pax in budget. Budget ≈ ≤1000 €/osebo; standard ≈ ≤2000 €/osebo (brez mednarodnih letov).
${southernAfricaBudgetSteer(params.budget, params.destinationIata, params.destination)}`;
}

/** Streaming Gemini generation — keeps HTTP connection alive (avoids serverless timeout). */
export function createTripPlanStream(
  params: GenerateTripPlanParams,
  options?: { abortSignal?: AbortSignal },
) {
  pipelineLog("gemini:streamObject START", GEMINI_TRIP_PLAN_MODEL);
  const prompt = buildTripPlanPrompt(params);
  const image = params.sharedImage;
  const abortSignal = options?.abortSignal;

  if (image) {
    return streamObject({
      model: google(GEMINI_TRIP_PLAN_MODEL),
      system: tripPlanSystemPrompt(params),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image", image: `data:${image.mimeType};base64,${image.base64}` },
          ],
        },
      ],
      schema: tripPlanGeminiSchema,
      abortSignal,
      ...tripPlanGenerationConfig,
    });
  }

  return streamObject({
    model: google(GEMINI_TRIP_PLAN_MODEL),
    system: tripPlanSystemPrompt(params),
    prompt,
    schema: tripPlanGeminiSchema,
    abortSignal,
    ...tripPlanGenerationConfig,
  });
}

/** Pull a truncated JSON object out of an AI SDK / Gemini stream error. */
export function extractGeneratedObject(error: unknown): unknown | null {
  if (!error || typeof error !== "object") return null;
  const e = error as {
    value?: unknown;
    cause?: { value?: unknown; data?: unknown };
    text?: string;
  };
  if (e.cause?.value != null) return e.cause.value;
  if (e.cause?.data != null) return e.cause.data;
  if (e.value != null) return e.value;
  if (typeof e.text === "string" && e.text.trim()) {
    const parsed = safeJsonParse(e.text, "gemini:recover");
    if (parsed.ok) return parsed.value;
  }
  return null;
}

export async function generateTripPlan(params: GenerateTripPlanParams): Promise<TripPlanResponse> {
  try {
    pipelineLog("gemini:generateObject START");
    const genStart = performance.now();

    const result = await withTimeout(
      generateObject({
        model: google(GEMINI_TRIP_PLAN_MODEL),
        system: tripPlanSystemPrompt(params),
        prompt: buildTripPlanPrompt(params),
        schema: tripPlanGeminiSchema,
        ...tripPlanGenerationConfig,
      }),
      GEMINI_GENERATION_TIMEOUT_MS,
      "gemini:generateObject",
    );

    pipelineLog("gemini:generateObject DONE", `${Math.round(performance.now() - genStart)}ms`);

    let payload: unknown = result.object;
    if (typeof payload === "string") {
      pipelineLog("gemini:raw string payload — JSON.parse");
      const parsed = safeJsonParse(payload, "gemini:generateObject");
      if (!parsed.ok) {
        throw new Error(`Gemini JSON parse failed: ${parsed.error}`);
      }
      payload = parsed.value;
    }

    const coerced = parseCoercedTripPlan(payload);
    if (!coerced.success) {
      console.error("Gemini Pro coerce/parse failed", coerced.error.flatten());
      throw new Error("Napaka pri generiranju načrta preko Gemini Pro");
    }
    return coerced.data;
  } catch (error) {
    if (error instanceof Error && error.name === "OperationTimeoutError") {
      console.error("Gemini Pro timeout:", error.message);
      throw new Error("Generiranje načrta je preseglo časovno mejo. Poskusi znova.");
    }

    const recovered = extractGeneratedObject(error);
    if (recovered != null) {
      const coerced = parseCoercedTripPlan(recovered);
      if (coerced.success) {
        pipelineLog("gemini:recovered via coerceTripPlanPayload");
        return coerced.data;
      }
      console.error("Gemini Pro recovery parse failed", coerced.error.flatten());
    }

    console.error("Gemini Pro napaka:", error);
    throw new Error("Napaka pri generiranju načrta preko Gemini Pro");
  }
}
