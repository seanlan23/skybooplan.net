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
} from "@/lib/userStayPlan";
import { flightContextPromptBlock } from "@/lib/geminiFlightContext";
import { lookupDestination } from "@/lib/destinationCoords";
import { DISTANCE_TRANSPORT_RULES } from "@/lib/transportPromptRules";
import { plannerQualityPromptBlock } from "@/lib/plannerQuality";
import { worldRouteRulesPromptBlock } from "@/lib/worldRouteRules";
import { twoStagePromptBlock } from "@/lib/twoStagePlan";
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
  • Na dan ${arrivalDay}: activities[] = samo sightseeing/food/nature PO pristanku (title, description, category, timeSlot, coords). BREZ arrivalTime/departureTime. BREZ category airport / hotel check-in / transfer — aplikacija jih vstavi.
  • PREPOVEDANO: “Zajtrk ob morju”, “Tropska pavza”, bazen ali promenada, če let še ni pristal.
  • Zadnji dan: enako — samo lahki ogledi PRED odhodom; brez HH:MM in brez airport/check-out/transfer vrstic.`
      : `- Če ni izbranega leta: dan 1 = prihod v ${params.arrivalCity} (${params.destinationIata}), lahek program.`;

  const stayBlock = params.explicitStayPlan
    ? `- UPORABNIKOV RAZPORED MEST/NOČI ima ABSOLUTNO PREDNOST pred limito baz in kakršnimkoli predlogom poti.
- Vrnitev na Phuket/Patong za odhod je dovoljena, če je v željah.`
    : `- Brez eksplicitnega razporeda: drži enosmerni lok; število baz raste z dnevi (glej SMSEL POTI).`;

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

ČASOVNA STRUKTURA DNEVA (fleksibilno — tempo in let imata prednost):
- Na POLNIH dneh na destinaciji (po prihodu, pred odhodom, brez dolgega transferja): smiselno zapolni slot glede na tempo — miren/sproščen = pogosto 1 prazen slot (počitek).
- Na dan prihoda/odhoda/dolg transfer: prazni sloti SO PRAVILNI in zaželeni.
- PREPOVEDANO polniti prazne slote z izmišljenim “programom” samo zato, da so vsi trije timeSlot-i zasedeni.
- Aktivnosti ene baze / dneva NE smejo “prehitevati” naslednje baze (npr. dan v Ao Nangu ≠ trajekt na Koh Phi Phi; to šele na dnevu premika).

FAZE vs DNEVI (brez mešanja):
- itinerar[].pois[] = samo znamenitosti TE faze/baze — vsaka faza MORA imeti ≥1 POI z realnimi lat/lng v istem mestu.
- days[].activities in transportation[] = samo ta koledarski dan.
- Naslednji premik (npr. Ao Nang → Phi Phi) gre na dan ODHODA, ne na prvi dan bivanja.

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

3) MEDMESTNI / OTOŠKI PREVOZ (days[].transportation[] — obvezno ko relevantno):
- Ob letu, vlaku, trajektu, speedboatu ali kombiju med mesti obvezno izpolni transportation[] z vsakim korakom (type, from, to, duration, estimatedPrice).
- transportation[] je OBVEZNO na vsakem dnevu z medmestnim prevozom — UI kartice z ikono letala/trajekta berejo ta array, ne samo opis aktivnosti!
- Vsak zapis v transportation[] mora imeti duration (npr. "1h 10min") — enako kot activities[].duration za isti korak.
- Primer enega dneva z letom:
  "transportation": [{ "type": "flight", "from": "Bangkok BKK", "to": "Chiang Mai CNX", "duration": "1h 10min", "estimatedPrice": 45 }]
- Za otoke: navedi urnike trajektov in hitrih čolnov, sezonske odpovedi, rezervacijo vnaprej, pristanišče in transfer letališče → pristanišče.
- Otok z letališčem na celini: 3 koraki (flight → van → ferry) — glej pravilo spodaj. Otok BREZ piste: nikoli ne izmisli leta na otok; uporabi resnične noge (čoln/kombi/let na celinsko letališče).
- V transportTip ali localWarnings vsak dan eno konkretno lokalno opozorilo (prevara, karta, konica, sezona) — rotiraj, ne isto vsak dan. Ne piši generičnega "uporabite aplikacijo" brez mesta in relacije A→B.
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
 * Cap overnight bases for motorhome/road-trip so itinerar[]+pois fit in the
 * 16k output budget. Calendar days[] must still cover the full trip length
 * via multi-night camps (e.g. 11 days → ~6 bases).
 */
export function motorhomeRoadTripMaxBases(days: number): number {
  if (days <= 0) return 0;
  if (days <= 4) return days;
  return Math.min(days, Math.max(3, Math.ceil(days / 2)));
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
  const locked = params.dayRange?.lockedRoute?.trim();
  return `
RAZPON DNI ZA TA JSON (STROGO — prebije vsa druga pravila o številu dni):
- Generiraj SAMO day_number ${span.start} do ${span.end} — natanko ${span.count} day{} objektov.
- Celotna pot ima ${span.total} koledarskih dni.
${continuation}
- PREPOVEDANO vrniti manj kot ${span.count} day{} ali day_number zunaj ${span.start}–${span.end}.
${locked ? `\n${locked}\n` : ""}
`;
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
- Med mesti načrtuj vožnjo z avtodomom — ne notranjih letov. ZDA: 400–800 km = cel dan vožnje.
- Parkiraj RV izven mestnega jedra; v center z javnim prevozom ali P+R.
- itinerar[] = največ ${maxBases} baz/kampov (to NI število dni!).
- KRITIČNO: ${dayObjectsRule}. Primer: ${span.count} day{} z ${maxBases} kampi = več day{} na istem kampu — NIKOLI samo ${maxBases} day{} objektov.
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
- Ena etapa ≤5 h čiste vožnje (trdo max 7 h). PREPOVEDANO 8–12 h kot en JSON dan. PREPOVEDANO Berat/Tirana → Zagreb v enem dnevu.
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
      : `- Zadnji dan: samo lahki ogledi PRED odhodom (brez ur); check-out/transfer/let vstavi aplikacija za ${params.returnFromIata ?? params.destinationIata}.`;

  const flightReturnClosing =
    !span.includesDeparture || params.groundTransportMode
      ? ""
      : params.flightContext?.inboundDepart
        ? "\n\nZadnji dan: NE generiraj category airport / check-out / transfer vrstic z urami — aplikacija jih vstavi iz IZBRANI LET. trip_metadata.return_flight_eu = natanko te ure."
        : "\n\nZadnji dan: NE generiraj airport/check-out/transfer z izmišljenimi urami — aplikacija vstavi logistiko. trip_metadata.return_flight_eu izpolni samo če imaš zanesljive ure.";

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

  const userStayPlanBlock = buildUserStayPlanPromptBlock(
    wishBlob || customWishes,
    params.days,
  );

  const arrivalCityName =
    lookupDestination(params.destinationIata)?.name ??
    params.destinationPlace ??
    params.destination;
  const arrivalDayNum = 1 + (params.flightContext?.outboundArriveDayOffset ?? 0);
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

  return `${titleLine}
${dayRangePromptBlock(params)}
${span.includesArrival ? teaserBlock : ""}
${travelReqBlock}
${plannerQualityPromptBlock({
  road: Boolean(params.groundTransportMode === "car" || params.groundTransportMode === "motorhome" || roadTrip || carTrip),
  totalDays: params.days,
})}
${userStayPlanBlock ?? ""}
${tvojeZeljeBlock}${motorhomeBlock}${carHotelBlock}${groundTransportBlock}

Let: ${route}.
Datumi: ${dates} (${params.days} dni).
Potniki: ${formatPaxForPrompt(params.pax)}.
Tempo potovanja: ${pace} — spoštuj TEMPO IN OBREMENITEV zgoraj (ne naporen itinerar).
Kaj jih zanima: ${priorities}.
Proračun: ${BUDGET_LABELS[params.budget]}.
${southernAfricaBudgetSteer(params.budget, params.destinationIata, params.destination)}
Posebne zahteve (oznake): ${wishes}.

Obvezna logistična pravila za ta načrt:
- ${
    explicitStayPlan
      ? `Število in vrstni red baz = NATANKO po UPORABNIKOVEM RAZPOREDU zgoraj (ne skrči na tipičnih ${Math.min(4, params.days)} baz).`
      : motorhome
        ? `Načrtuj največ ${maxBases} baz/kampov vzdolž enosmerne poti; ${dayObjectsRule} (več noči na isti bazi = več day{} — NE samo ${maxBases} day{}).`
        : carTrip || roadTrip
          ? `Načrtuj največ ${maxBases} hotelskih baz (mesta) vzdolž enosmerne poti; ${dayObjectsRule} (več noči v istem mestu = več day{} — NE samo ${maxBases} day{}). PREPOVEDANO: kamp/RV/sosta kot nočitev.`
        : `Število baz: glej SMSEL POTI (ne strop 4 baze). ${params.days} dni = dovolj baz za ~2–4 noči, ne 5+ v istem letovišču.`
  }
- ${explicitStayPlan ? "Sledi uporabnikovemu vrstnemu redu mest (vrnitev na odhodni hub je dovoljena, če je v razporedu)." : "Enosmerna geografska pot (en jasen lok); brez vračanja v že obiskana mesta."}
${arrivalDayRule}
${flightReturnLine}
- Za vsako fazo obvezno izpolni city (angleško ime), lat in lng (centrum mesta${motorhome ? " ali kamp ob poti" : ""}).
- Vsaka aktivnost mora imeti category (sightseeing, nature, beach, food, entertainment, hotel, airport) in koordinate za oglede.
- PREPOVEDANO: znamenitosti enega mesta na dnevu v drugem mestu (POI ∈ baza).
- timeSlot je obvezen: "dopoldan", "popoldan" ali "vecer". arrivalTime/departureTime sta neobvezna za oglede — NE izmišljuj ur za mednarodni prihod/odhod (check-out, transfer, letališče, mednarodni let); aplikacija jih vstavi iz izbrane letalske karte.
- ČASOVNA STRUKTURA: glej HIERARHIJA PRAVIL zgoraj — prazni sloti pred/za letom in ob mirnem tempu SO dovoljeni; ne polni dneva na silo.
- Vsak dan obvezno izpolni travelHack (unikaten insider nasvet) in transportTip (dnevni pregled prevoza) — glej podrobna pravila spodaj.
- Za dni z notranjim letom, trajektom, kombijem ali vlakom obvezno izpolni transportation[] (type: flight|ferry|train|van, from, to, duration, estimatedPrice v ${displayCurrency}). Za otok z letališčem na celini (npr. Boracay/MPH) obvezno 3 koraki: let → kombi → trajekt.
- Vsak dan (days[]) mora imeti dailyBudget (EUR), drivingDistanceKm (km vožnje tistega dne) in drivingDurationHours (npr. "3h 45m").
- Polje days[].date mora biti vedno v ISO obliki YYYY-MM-DD (npr. "2026-08-14") — ne slovenskega datuma; day_name je lahko "Sobota, 14. avgust".
- Za vsako fazo (itinerar[]) generiraj pois[] — ${poisPerPhase} z name, description, lat, lng, unsplashQuery, tripAdvisorStyleDetails (highlights, proTip, bestTimeOfDay, rating, reviewSummary). Samo POI te baze.
- UNSPLASH ISKANJE SLIK (obvezno): Za vsako fazo (itinerar[]) izpolni unsplashQuery z čistim angleškim izrazom za mesto (npr. "Dubai", ne "Dubaj"). Za vsak POI (pois[]) in vsako aktivnost z ogledom izpolni unsplashQuery z uradnim angleškim imenom znamenitosti (npr. "Burj Khalifa", ne "Burj Kalifa"). Brez slovenskih črk — samo angleščina, kot jo uporablja Unsplash/Google.
- Vsaka aktivnost z ogledom mora imeti tripAdvisorStyleDetails (razen hotel/airport).
- Na polnih dneh: smiselno število aktivnosti glede na tempo (miren ≈ 1–2, sproščen ≈ 2, intenziven ≈ 3–4). Dan prihoda = lahek program šele po namestitvi. Raje prazen slot kot "jutranji sprehod" / "če imaš energijo".

Opisi aktivnosti: ${motorhome || roadTrip ? "1–2 kratki točki" : "2–4 kratke točke"} v bullets[] (ali "- " vrstice) — nikoli en neformatiran odstavek. Vsaka aktivnost mora imeti estimatedCostEur (realna cifra v ${displayCurrency}). day_name zapisuj s polnimi imeni mesecev (npr. "Sobota, 14. avgust"). season_warning naj bo geografsko natančen za ${params.destination}.

${itineraryHacksAndTransportRules(displayCurrency)}

${selectedFlightBlock}
${lastDayBlock}${flightReturnClosing}`;
}

function lightPacePoisHint(pace?: GenerateTripPlanParams["pace"]): string {
  if (pace === "calm") return "2–4 znamenitosti (ne več)";
  if (pace === "intensive") return "vsaj 3–6 znamenitosti";
  return "3–4 znamenitosti (dovolj za sproščen tempo)";
}

/** Structured trip-plan JSON — override via GEMINI_TRIP_PLAN_MODEL in .env / Vercel. */
export const GEMINI_TRIP_PLAN_MODEL =
  process.env.GEMINI_TRIP_PLAN_MODEL?.trim() || "gemini-2.5-flash";

/** Headroom per stream batch (long trips are split). 16k truncated 16-day catalog JSON at ~2 days. */
export const GEMINI_TRIP_PLAN_MAX_OUTPUT_TOKENS = 32_768;

const google = createGoogleGenerativeAI({
  apiKey: geminiApiKey() ?? undefined,
});

const tripPlanGenerationConfig = {
  maxTokens: GEMINI_TRIP_PLAN_MAX_OUTPUT_TOKENS,
  providerOptions: {
    google: {
      maxOutputTokens: GEMINI_TRIP_PLAN_MAX_OUTPUT_TOKENS,
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
- PREPOVEDANO 8–12 h JSON dan; če je etapa ≥7 h, nočitev vmes.
- trip_metadata.return_flight_eu NE izpolnjuj.`
    : `POVRATEK V EU (obvezno — STROGI JSON):
- Zadnji dan activities[] = samo lahki ogledi/hrana (brez HH:MM, brez category airport / check-out / transfer).
- Aplikacija vstavi celotno letalsko logistiko iz IZBRANI LET.
- trip_metadata.return_flight_eu: kopiraj ure iz IZBRANI LET (ne izmišljuj).`;

  const lastDayTransitException = params.groundTransportMode
    ? "razen zadnjega logističnega dneva (vožnja/vlak nazaj na izhodišče)"
    : "razen zadnjega logističnega dneva na izhodno letališče";

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
- Notranji leti so dovoljeni šele ko potnik zapusti bazo prihoda po vsaj 1–2 polnih dneh tam.
- Odhod nazaj: izhodno letališče je ${returnAirport}${
        returnAirport !== params.destinationIata
          ? " (open-jaw — pot lahko končaš proti temu letališču)"
          : " — končaj pot v isti regiji, ne sili v Bangkok buffer, če ni potreben"
      }.
`;

  return `Si strokovni potovalni agent za aplikacijo skybooplan. Striktno sledi zahtevani JSON shemi.

${dayRangePromptBlock(params)}

${STRICT_LLM_LANGUAGE_RULE}

${STRICT_LLM_CURRENCY_RULE}

JEZIK IZHODA:
${writingRule}

VALUTA (displayCurrency = ${displayCurrency}):
${moneyRule}

${controlRules}

${worldRouteRulesPromptBlock(true)}

${twoStagePromptBlock({
  phase: span.start > 1 ? 2 : 1,
  slo: true,
})}

${plannerQualityPromptBlock({
  road: Boolean(params.groundTransportMode === "car" || params.groundTransportMode === "motorhome" || roadTrip || carTrip),
  totalDays: params.days,
})}

${travelReqBlock}
${arrivalAirportBlock}
${selectedFlightSystemBlock}
${motorhomeRules}

${
  carTrip
    ? `STROGO PRAVILO — AVTO / ROAD TRIP Z HOTELI:
- hotels[] = samo city + nights — UI/PDF odpreta Booking.com. PREPOVEDANO izmišljati imena hotelov.
- PREPOVEDANO kot namestitev: kamp, RV park, campground, sosta, avtodom, "spanje v avtu".
- Med mesti načrtuj vožnjo z avtom — enosmerna pot z realističnimi etapami.
`
    : `STROGO PRAVILO — AVTODOM / RV / CAMPERVAN:
- Če uporabnik v željah (Tvoje želje / customWishes) izrecno navede potovanje z AVTODOMOM, RV-jem, campervanom ali road tripom z najetim avtodomom:
  • Polje hotels MORA biti prazno polje [] — nikoli ne predlagaj hotelov!
  • Za vsak dan dodaj med activities vsaj eno nočitev: RV park / kamp / KOA / campground (category: hotel) z realnim imenom in coordinates.
  • Med mesti načrtuj vožnjo z avtodomom — brez notranjih letov z RV-jem.
  • Route 66 / cestna pot: enosmerna pot vzdolž ceste, postaja za nočitev na kampu ob vsaki etapi.
- Če uporabnik omeni periodične hotel nočitve ("vsak 5 dan hotel"), hotels[] ostane [], hotel omeni le kot izjemo v activities tistega dne.
`
}
OPISI (STROGI JSON — človeško, ne brošura):
- Preferiraj bullets: ["…", "…"] (2–4 kratke točke, vsaka ≤ ~120 znakov) ALI description z vrsticami "- točka".
- PREPOVEDANO: en dolg neformatiran odstavek (wall of text) za večerjo/ogled — aplikacija razbije esej, a raje oddaj že strukturirano.
- description/bullets: kaj narediš + 1 praktičen detajl (odpiralni čas, kako priti, karta, kaj vzeti). Ne 150–300 besed, ne Wikipedia.
- PREPOVEDANO brošurno: "Uživajte v…", "čudovit razgled", "kulturni dragulj", "avtentična kuhinja", "fine dining izkušnja", "lahkoten sprehod v okolici namestitve", "spoznavanje s prvim okoljem".
- travelHack vsak dan = unikaten insider nasvet. NIKOLI ne ponovi istega stavka in NIKOLI ne prepisi pravil iz tega prompta v nasvet.
- HRANA (vse destinacije / vsi jeziki): NE piši generičnega "pojdi na večerjo / lokalna večerja / Abendessen in Kyoto".
  • Zajtrk skoraj nikoli ne načrtuj kot ločeno aktivnost (razen če je destinacijska ikona, npr. znan café).
  • Vsaka food aktivnost = konkretno ime lokala v title (npr. "Večerja: Ichiran", "Dinner: Afuri", "Abendessen: Kyubey") + 1 priporočilo + po želji 1 alternativa.
  • PREPOVEDANO (vse destinacije): "Lokalna večerja", "Mittagessen in Asakusa", "Abendessen in Kyoto", "Lunch in Harajuku", "Dinner near the hotel", "Kosilo v centru", "Café break" / "Pavza v kavarni" kot filler.
  • PREPOVEDANO (vse destinacije): "Jutranji sprehod / kava pred ogledom", "Jutranji sprehod do prve znamenitosti", "Check-in, osvežitev in kratek odmor", "Check-in in varnostni pregled", "če imaš še energijo", "brez hitenja takoj z letališča", "Večernji sprehod in lokalna večerja", "Večerja in koktajli v elegantnem baru", "Morning walk & coffee", "if you still have energy", "Dinner and cocktails in an elegant bar". Večerja MORA imeti ime lokala (npr. "Večerja: Café Comptoir Abel") ali pa slot pusti prazen.
  • MESTO = SAMO TO MESTO: Louvre / Eifflov stolp / Orsay samo na pariških dneh. Lyon = Fourvière, traboule, Vieux Lyon — nikoli Louvre v Lyonu.
  • TEMPO: dan prihoda = samo po hotelu, lahek (brez težkih muzejev). Poln dan = 1 sidro + 1–2 točki. Raje prazen slot kot template.
  • PREPOVEDANO: odrezani stavki z "…" / "höchstens…" in scaffolder "Hauptbesichtigung am Vormittag" / "Glavni dopoldanski ogled".
- Vsaka aktivnost mora imeti estimatedCostEur z realno cifro v ${displayCurrency} (vstopnine, hrana, gorivo — ne 0, razen res brezplačnih). Polje se imenuje estimatedCostEur, vrednost pa je v ${displayCurrency}.
- dailyBudget na vsakem dnevu mora biti realna vsota dnevnih stroškov NA OSEBO v ${displayCurrency} — nikoli 0. Skupinske postavke (gorivo, kamp) deli s številom potnikov. Prilagodi rang državi (npr. večerja na Šrilanki ≈ 5–15 ${displayCurrency === "USD" ? "$" : "€"}, ne 40; EU avtodom tipično 45–90 €/osebo/dan).
${flightReturnEuRule}

STROGA GEOGRAFSKA NATANČNOST:
- season_warning je kratek narativni uvod (teaser + največ 1 dodaten stavek o poti) — ne dolg esej in ne podvajanje spodnjih kartic.
- NE omenjaj pojavov, ki na tej lokaciji ne obstajajo (npr. plimovanje, bioluminiscenca, lagune, tropski monsuni v mestih, kjer tega ni — kot Tokio, Kioto, evropska mesta).

UVODNI VIZUALNI BLOKI (obvezno na korenu JSON — nad dnevnim načrtom):

1) KRITIČNO VARNOSTNO OPozorilo (safetyWarning — nullable):
- Če ima destinacijska država resna notranja tveganja (vojna, izgredi, terorizem, ekstremna inflacija, kolaps infrastrukture/elektrike, pomanjkanje zdravil/hrane — npr. Kuba, Jemen, del Afganistana), vrni objekt:
  "safetyWarning": { "title": "Kritično opozorilo za Kubo", "message": "Država se sooča z izpadi omrežja, pomanjkanjem zdravil in hrane. Potovanje z otroki močno odsvetujemo." }
- Če akutne notranje nevarnosti NI, vrni natanko null: "safetyWarning": null
- Ne izmišljaj nevarnosti za varne turistične destinacije (Španija, Tajska, Japonska …).

2) KARTICA VREME + SEZONA (weatherWidget — obvezno):
- Obvezno izpolni weatherWidget z natanko tremi polji (v jeziku uporabnika):
  • season — sezona/obdobje v času potovanja (npr. "Prehodno / Monsunsko obdobje (Zaliv je suh)")
  • avgTemp — povprečna temperatura (npr. "32°C", "18–24°C")
  • clothing — priporočena oblačila (npr. "Lahkotna oblačila in dežnik za popoldanske plohe")
- Primer:
  "weatherWidget": {
    "season": "Suha sezona / visoka sezona",
    "avgTemp": "32°C",
    "clothing": "Lahkotna oblačila, kapa in voda"
  }
- UI prikaže weatherWidget kot 3-stolpčno kartico — podatke NE ponavljaj v season_warning, travelHack ali dolgem uvodu!

FORMAT DATUMOV:
- Polje day_name mora biti v obliki: "Dan v tednu, številka. mesec" z meseci v celoti in pravilno slovensko, npr. "Petek, 11. september" (ne "Sep.", ne angleške okrajšave).
- Dovoljeni meseci: januar, februar, marec, april, maj, junij, julij, avgust, september, oktober, november, december.

OBVEZNA POLJA MESTA NA VSAKI FAZI (itinerar[] — city, lat, lng):
- Vsaka faza = ena glavna baza/mesto. Obvezno vrni tri polja:
  • city — uradno angleško ime mesta NATANČNO kot ga uporablja Booking.com (npr. "Bangkok", "Chiang Mai", "Koh Samui", "Phuket", "Ho Chi Minh City", "Hanoi", "Kyoto"). Brez države, brez slovenskih imen, brez IATA kod, brez opisnih fraz.
  • lat — WGS84 geografska širina centra tega mesta (realna vrednost, ne 0).
  • lng — WGS84 geografska dolžina centra tega mesta (realna vrednost, ne 0).
- Ta city string gre neposredno v hotel iskalnik — napačno ime pomeni napačne hotele.
- Koordinate faze so primarni marker na zemljevidu za vse dni v tej fazi; aktivnosti lahko imajo lastne coordinates za POI pine.
- phase je slovenski prikazni naslov faze (npr. "Bangkok — glavna mesto"), city pa ostane angleško za API.

OBVEZNA KATEGORIJA ZA VSAKO AKTIVNOST (activities[].category):
- Vsaka aktivnost MORA imeti polje category z natanko eno vrednostjo:
  • sightseeing — zgodovinske znamenitosti, templji, muzeji, mestne ture
  • nature — narava, parki, treking, slapovi, safariji
  • beach — plaže, otoki, snorkeling, čolni
  • food — restavracije, tržnice, street food, kulinarične ture
  • entertainment — zabavišča, nočno življenje, tematski parki, showi
  • hotel — check-in, check-out, nastanitev (brez ogleda)
  • airport — prilet, odlet, transfer na letališče
- Za vsako aktivnost z ogledom/znamenitostjo dodaj točne coordinates (lat, lng) lokacije.
- Vsaka aktivnost MORA imeti timeSlot: natanko "dopoldan", "popoldan" ali "vecer".
- arrivalTime/departureTime sta neobvezna (lahko izpustiš). PREPOVEDANO izmišljevati ure za mednarodni prihod/odhod (check-out, transfer, check-in, mednarodni let) — te ure vstavi aplikacija iz izbrane letalske karte. Na dan prihoda in zadnji dan: IZPUSTI ure in airport/logistics vrstice; samo ogledi + timeSlot.
- category mora ustrezati dejanski vsebini aktivnosti — ne uporabljaj vedno iste kategorije.

ČASOVNA STRUKTURA DNEVA (glej HIERARHIJA PRAVIL — ne polni na silo):
- Na polnih dneh: aktivnosti po tempu (miren/sproščen = manj slotov; prazen slot = počitek OK).
- Na dan prihoda/odhoda/dolg transfer: prazni timeSlot-i PRED/ZA letom so OBVEZNI — ne zapolnjuj z zajtrkom/siesto/plažo pred pristankom.
- Ne piši HH:MM v opise logistike prihoda/odhoda — boarding-pass ure so last kode.

${itineraryHacksAndTransportRules(displayCurrency)}

NOTRANJI PREVOZ (transportation[] — obvezno ob letu/trajektu/vlaku):
- Če dan vključuje notranji let, trajekt ali vlak med mesti, obvezno izpolni days[].transportation[] z natanko enim ali več zapisi:
  • type: "flight" | "ferry" | "train" | "van"
  • from / to: imeni letališč/pristanišč/postaj ali mest
  • duration: realen čas potovanja (npr. "1h 10min", "1h 20m")
  • estimatedPrice: ocena cene v ${displayCurrency} na osebo
- Hkrati mora ustrezna activities[] vsebovati transport_type + duration (0) — oba vira morata biti skladna!

OTOK Z LETALIŠČEM NA CELINI (Boracay/MPH in podobno — obvezno):
- Ko je destinacija otok, dostopen prek bližnjega letališča na celini (npr. Boracay prek MPH/Caticlan), transportation[] MORA vsebovati 3 zaporedne korake — NE piši enega leta neposredno do otoka:
  1. type "flight" — iz prejšnjega mesta do letališča (npr. Manila → Caticlan MPH)
  2. type "van" — iz letališča do pristanišča (npr. Caticlan Airport → Caticlan Jetty Port)
  3. type "ferry" — iz pristanišča na otok (npr. Caticlan Port → Boracay Island)
- Polje city naj ostane ime otoka (Boracay); coordinates (lat/lng) naj kažejo sredi otoka, ne na letališče MPH.

OBVEZNA DNEVNA LOGISTIKA (itinerar[].days[] — za vsak dan):
- PREPOVEDANO pustiti day{} brez activities (prazen dopoldan / „prosti dan“). Če se days[].city spremeni proti prejšnjemu dnevu, MORA biti category transport z A → B (vlak/let/ferry/avto) — ne teleport.
- dailyBudget: ocena dnevnih stroškov v EUR NA OSEBO (ne za celotno skupino). Skupne postavke (gorivo, kamp, cestnine/vinjete) razdeli na število potnikov, nato prištej hrano/vstopnine na osebo. IT/FR/ES/HR avtoceste so drage — ne pozabi cestnin. Tipično EU avtodom: 45–90 €/osebo/dan — NE 150–400.
- drivingDistanceKm: točna ocena dolžine vožnje za ta dan v km (0 le če ni vožnje).
- drivingDurationHours: trajanje vožnje npr. "3h 45m" (0h le če ni vožnje — uporabi "0h").

- Vsaka aktivnost z ogledom/znamenitostjo (category razen hotel/airport) MORA imeti tripAdvisorStyleDetails z realnimi, lokacijsko specifičnimi podatki.

OBVEZNE ZNAMENITOSTI NA FAZO (itinerar[].pois[]):
- Za vsako postojanko generiraj pois[] z natančnimi lat/lng — samo znamenitosti TE baze (ne naslednje!).
- Število: ${lightPacePoisHint(params.pace)} — ne nabijaj seznama.
- Vsaka faza MORA imeti unsplashQuery (angleško ime mesta za iskanje slik, npr. "Dubai", "Bangkok").
- Vsak POI: name (angleško/uradno ime), description (2–3 privlačne stavke), lat, lng, unsplashQuery (angleško ime za Unsplash, npr. "Burj Khalifa", "Grand Palace Bangkok").
- Vsak POI MORA imeti tripAdvisorStyleDetails:
  • highlights: 3–5 kratkih točk (max 12 besed na točko) — kaj je must-see pri tej lokaciji
  • proTip: EN specifičen, praktičen nasvet za TO mesto (npr. "Pridi 30 min pred odprtjem", "Ne fotografiraj proti vzhodu sonca ob poldnevu", "Vstop preko vzhodnega vhoda — krajša vrsta"). Prepovedani generični nasveti!
  • bestTimeOfDay: najboljši čas obiska (npr. "Zgodaj dopoldan ob delavnikih", "Sončni zahod")
  • rating: realistična ocena 3.5–5.0 (decimalno, npr. 4.6)
  • reviewSummary: 1–2 stavka povzetka vtisov popotnikov — specifično za lokacijo, ne generično

TRIPADVISOR PODATKI ZA AKTIVNOSTI (activities[] — obvezno za oglede):
- Vsaka aktivnost s category sightseeing, nature, beach, food ali entertainment MORA imeti tripAdvisorStyleDetails (ista struktura kot pri POI).
- Vsaka aktivnost z ogledom MORA imeti tudi unsplashQuery (angleško ime znamenitosti za Unsplash).
- Za category hotel ali airport tripAdvisorStyleDetails in unsplashQuery izpusti.

${povratekEuBlock}

VEČ DESTINACIJ — LOGIČNA POT:
${
  explicitStayPlan
    ? `- UPORABNIK JE PODAL RAZPORED MEST/DNI — to ima ABSOLUTNO PREDNOST pred vsemi spodnjimi limito-baz in "tipičnimi" Tajskimi potmi.
- Sledi uporabnikovemu vrstnemu redu (npr. Phuket → Khao Sok → Ao Nang → Phi Phi → Patong). Dovoljeno je več kot 4 baze in vrnitev na Phuket/Patong za odhod, če je to v željah.
- PREPOVEDANO zamenjati ta razpored s prednastavljeno potjo, če uporabnik tega ni prosil.
- Vsaka faza (phase) = ena baza iz uporabnikovega razporeda; days[].city mora ujemati.`
    : `- Če je potovanje daljše od 10 dni in destinacija predstavlja celo državo ali večjo regijo, NE omejuj celotnega itinerarja na eno samo mesto — a tudi NE raztegni ene plaže na 5+ noči.
- STROGA GEOGRAFSKA LINEARNOST: enosmerni lok. Prepovedano je:
  • skakanje s severa na jug in nazaj,
  • vračanje v mesta/regije, ki jih je potnik že obiskal (${lastDayTransitException}),
  • ciklična pot ali "zig-zag" brez smisla.
- Sledi SMSEL POTI zgoraj — ne seznamom mest za eno državo. Smeš dodati bazo, če koledar drži.
- Vsaka faza (phase) = ena regija/mesto; dni razporedi sorazmerno.
- Unikatnost mest: Vsako mesto/regija se lahko v celotnem itinerarju pojavi samo enkrat (izjema: zadnji dan — le ${params.groundTransportMode ? "vožnja/vlak nazaj domov" : "tranzit na izhodno letališče"}, brez ogledov).`
}

PRILAGODITEV TRAJANJU — BAZA / REGIJE (obvezno):
${
  explicitStayPlan
    ? `- Število baz = točno po uporabnikovih željah (ne uporabljaj limit 2/3/4 baz).`
    : motorhome
      ? `- ROAD TRIP / AVTODOM: Enosmerna pot z največ ${motorhomeRoadTripMaxBases(params.days)} bazami/kampi (itinerar[]). Število kampov ≠ število dni. days[] (vsota itinerar[].days) = NATANKO ${params.days} koledarskih day{} — združi 2–3 noči na isti bazi (vsaka noč = svoj day{}). Vsak dan: smiselne aktivnosti + kamp/RV park za nočitev. PREPOVEDANO: ena baza na vsak dan (to preseže output limit). PREPOVEDANO: vrniti samo ${motorhomeRoadTripMaxBases(params.days)} day{} za ${params.days}-dnevni izlet.`
      : carTrip || roadTrip
        ? `- ROAD TRIP / AVTO + HOTELI: Enosmerna pot z največ ${motorhomeRoadTripMaxBases(params.days)} hotelskimi bazami (itinerar[]). Število mest ≠ število dni. days[] = NATANKO ${params.days} koledarskih day{} — združi 2–3 noči v istem mestu. Vsak dan: smiselne aktivnosti + hotel nočitev. PREPOVEDANO: kamp/RV/sosta. PREPOVEDANO: vrniti samo ${motorhomeRoadTripMaxBases(params.days)} day{} za ${params.days}-dnevni izlet.`
      : `- Število baz raste z dnevi (glej SMSEL POTI) — ne nategovati ene plaže:
  • 7–9 dni: 2–3 baze,
  • 10–14 dni: 3–4 baze,
  • 15–21 dni: 4–6 baz (vključno hub prihoda/odhoda).
- ~2–4 noči na bazo. Če ostane ≥3 noči, dodaj novo bazo na isti smeri.
- Med bazami en logičen premik; težek hop (≥5–6 h) = transfer dan.`
}

${lastDayBlock}

PRILAGODITEV POTNIKOM IN PRORAČUNU (obvezno):
- Celoten itinerar, tempo, predlagana hrana, aktivnosti, prevoz in finance MORAŠ popolnoma prilagoditi natančni sestavi potnikov (pax) in izbranemu proračunu.
- Otroci: upoštevaj starost vsakega otroka — manjši otroci = krajši dnevi, več odmorov, družinske aktivnosti, varna hrana in manj napornih prevozev.
- Budget (nizki proračun): hostli, javni prevoz, brezplačne/poceni atrakcije, lokalna hrana. Skupaj na destinaciji ≈ ≤1000 €/osebo (brez mednarodnih letov).
- Standard: uravnotežen mix cene in udobja. Skupaj na destinaciji ≈ ≤2000 €/osebo (brez mednarodnih letov). PREPOVEDANO luxury fly-in Okavango / private safari lodges, razen če uporabnik eksplicitno zahteva premium.
- Premium: boljši hoteli, fine dining, zasebni transferji, ekskluzivnejše izkušnje (vključno z lodgi, če sodi).
- Posebne zahteve (npr. vegetarijansko/vegansko, dostopno z vozičkom, najem avtomobila, brez nočnih voženj) moraš dosledno upoštevati v celotnem planu — hrana, aktivnosti in logistika.
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
      schema: tripPlanSchema,
      abortSignal,
      ...tripPlanGenerationConfig,
    });
  }

  return streamObject({
    model: google(GEMINI_TRIP_PLAN_MODEL),
    system: tripPlanSystemPrompt(params),
    prompt,
    schema: tripPlanSchema,
    abortSignal,
    ...tripPlanGenerationConfig,
  });
}

function extractGeneratedObject(error: unknown): unknown | null {
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
        schema: tripPlanSchema,
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
