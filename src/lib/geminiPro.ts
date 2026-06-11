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
import { planTeaserText } from "@/lib/planTeaser";
import { STRICT_LLM_LANGUAGE_RULE } from "@/lib/planLanguages";
import {
  currencyWritingRule,
  normalizePlanCurrency,
  STRICT_LLM_CURRENCY_RULE,
  type PlanCurrency,
} from "@/lib/planCurrency";
import { languageWritingRule } from "@/lib/tripLocale";
import type { Lang } from "@/lib/i18n";

export type {
  GenerateTripPlanParams,
  TripBudgetTier,
  TripPlanPax,
  TripPlanResponse,
  TripWishTag,
} from "@/lib/geminiPro.shared";
export { TRIP_WISH_TAGS, tripPlanSchema, isTripPlanResponse, normalizeTripPlanPax, normalizeIata } from "@/lib/geminiPro.shared";

const BUDGET_LABELS: Record<TripBudgetTier, string> = {
  budget: "Budget (nizki proračun)",
  standard: "Standard",
  premium: "Premium",
};

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
  if (params.groundTransportMode === "motorhome") return true;
  return detectAccommodationMode(wishesBlob(params)) === "motorhome";
}

function isRoadTripRequest(params: GenerateTripPlanParams): boolean {
  return /route\s*66|road\s*trip|roadtrip|cesta\s*66|po\s+poti/i.test(wishesBlob(params));
}

function buildTripPlanPrompt(params: GenerateTripPlanParams): string {
  const wishes =
    params.wishTags.length > 0
      ? params.wishTags.join(", ")
      : "brez posebnih zahtev";
  const customWishes = params.customWishes?.trim() ?? "";
  const motorhome = isMotorhomeTrip(params);
  const roadTrip = isRoadTripRequest(params) || params.groundTransportMode === "car";
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

  const maxBases =
    motorhome || roadTrip
      ? params.days
      : params.days <= 9
        ? 2
        : params.days <= 14
          ? 3
          : params.days <= 21
            ? 4
            : 4;

  const tvojeZeljeBlock = customWishes
    ? `

=== TVOJE ŽELJE (obvezno upoštevaj dosledno v celotnem načrtu) ===
${customWishes}
===`
    : "";

  const motorhomeBlock = motorhome
    ? `

NAČIN POTOVANJA: AVTODOM / RV / CAMPERVAN (obvezno)
- Polje hotels v JSON vrni kot prazno polje [] — brez hotelov!
- Namesto hotelov za vsak dan dodaj konkretno aktivnost za nočitev: RV park / kamp / campground (category: hotel) z imenom in lokacijo.
- Med mesti načrtuj vožnjo z avtodomom — ne notranjih letov. ZDA: 400–800 km = cel dan vožnje.
- Parkiraj RV izven mestnega jedra; v center z javnim prevozom ali P+R.
${roadTrip ? "- Road trip (npr. Route 66): enosmerna pot vzdolž ceste, vsak dan nova postaja za nočitev na kampu ob poti." : ""}`
    : "";

  const groundTransportBlock =
    params.groundTransportMode && params.originPlace && params.destinationPlace
      ? groundTransportPromptBlock(
          params.groundTransportMode,
          params.originPlace,
          params.destinationPlace,
        )
      : "";

  const lastDayBlock = lastDayReturnPromptBlock({
    groundTransportMode: params.groundTransportMode,
    originPlace: params.originPlace,
    returnFromIata: params.returnFromIata,
    destinationIata: params.destinationIata,
  });

  const flightReturnLine = params.groundTransportMode
    ? "- Povratek domov mora ustrezati izbranemu prevozu (avto/vlak/avtodom) — glej pravila spodaj, NE let z letališča."
    : `- Zadnji dan izključno prevoz na izhodno letališče (${params.returnFromIata ?? params.destinationIata}) — brez novih ogledov.`;

  const flightReturnClosing = params.groundTransportMode
    ? ""
    : "\n\nZadnji dan logistike: obvezno dodaj aktivnost z category airport z natančno uro odhoda mednarodnega leta nazaj v Evropo (EU) in izpolni trip_metadata.return_flight_eu (departure_time, arrival_time_eu, from_airport, to_airport, summary).";

  const lang = (params.language ?? "sl") as Lang;
  const teaser = planTeaserText(lang);
  const teaserBlock = `
UVODNI TEASER (obvezno — pred 1. dnem):
Na samem začetku polja trip_metadata.season_warning (uvodno besedilo pred dnevnim načrtom) mora biti kot prvi stavek NATANKO ta tekst, v izbranem jeziku uporabnika:
"${teaser}"
Takoj za tem nadaljuj z geografsko natančnim sezonskim opozorilom za destinacijo.`;

  return `Ustvari ${params.days}-dnevni načrt potovanja za lokacijo: ${params.destination} v mesecu ${params.month}.
${teaserBlock}
${tvojeZeljeBlock}${motorhomeBlock}${groundTransportBlock}

Let: ${route}.
Datumi: ${dates} (${params.days} dni).
Potniki: ${formatPaxForPrompt(params.pax)}.
Tempo potovanja: ${pace}.
Kaj jih zanima: ${priorities}.
Proračun: ${BUDGET_LABELS[params.budget]}.
Posebne zahteve (oznake): ${wishes}.

Obvezna logistična pravila za ta načrt:
- ${motorhome || roadTrip ? `Načrtuj ${maxBases} postaj vzdolž enosmerne poti (road trip — vsak dan ali vsak drug dan nova postaja ob cesti).` : `Največ ${maxBases} glavne baze (mesta/regije) za ${params.days} dni — brez skakanja sem in tja po državi.`}
- Enosmerna geografska pot (en jasen lok); brez vračanja v že obiskana mesta.
${flightReturnLine}
- Za vsako fazo obvezno izpolni city (angleško ime), lat in lng (centrum mesta ali kamp ob poti).
- Vsaka aktivnost mora imeti category (sightseeing, nature, beach, food, entertainment, hotel, airport) in koordinate za oglede.
- Vsaka aktivnost mora imeti arrivalTime in departureTime v formatu "HH:MM" (npr. "09:00", "11:30") — realen časovni okvir obiska.
- Vsaka aktivnost mora imeti timeSlot: "dopoldan", "popoldan" ali "vecer".
- STROGA ČASOVNA STRUKTURA: Vsak dan mora obvezno in brez izjeme vsebovati strukturirane aktivnosti za DOPOLDAN, POPOLDAN in VEČER — noben del dneva ne sme ostati prazen! Ure obiska (arrivalTime, departureTime) morajo biti tekoče in realistične, brez prekrivanj.
- transportTip / rubriko "Kako se premikati" generiraj SAMO IN IZKLJUČNO, če obstaja kakšen specifičen, edinstven nasvet za tisti konkretni dan (npr. nasvet o parkiranju avtodoma, opozorilo o lokalnem prometu). Če ni posebnosti, rubriko popolnoma izpusti!
- Za dni z notranjim letom, trajektom, kombijem ali vlakom obvezno izpolni transportation[] (type: flight|ferry|train|van, from, to, duration, estimatedPrice v EUR). Za otok z letališčem na celini (npr. Boracay/MPH) obvezno 3 koraki: let → kombi → trajekt.
- Vsak dan (days[]) mora imeti dailyBudget (EUR), drivingDistanceKm (km vožnje tistega dne) in drivingDurationHours (npr. "3h 45m").
- Polje days[].date mora biti vedno v ISO obliki YYYY-MM-DD (npr. "2026-08-14") — ne slovenskega datuma; day_name je lahko "Sobota, 14. avgust".
- Za vsako fazo (itinerar[]) obvezno generiraj pois[] — vsaj 3–6 znamenitosti z name, description, lat, lng, unsplashQuery, tripAdvisorStyleDetails (highlights, proTip, bestTimeOfDay, rating, reviewSummary).
- UNSPLASH ISKANJE SLIK (obvezno): Za vsako fazo (itinerar[]) izpolni unsplashQuery z čistim angleškim izrazom za mesto (npr. "Dubai", ne "Dubaj"). Za vsak POI (pois[]) in vsako aktivnost z ogledom izpolni unsplashQuery z uradnim angleškim imenom znamenitosti (npr. "Burj Khalifa", ne "Burj Kalifa"). Brez slovenskih črk — samo angleščina, kot jo uporablja Unsplash/Google.
- Vsaka aktivnost z ogledom mora imeti tripAdvisorStyleDetails (razen hotel/airport).
- Vsak dan mora imeti vsaj 2–4 smiselne aktivnosti z opisi — prazni dnevi niso dovoljeni.

Opisi aktivnosti morajo biti izjemno podrobni, zanimivi in dolgi vsaj 3–4 stavke (ne kratki!). Vsaka aktivnost mora imeti estimatedCostEur (realna cifra v EUR). day_name zapisuj s polnimi imeni mesecev (npr. "Sobota, 14. avgust"). season_warning naj bo geografsko natančen za ${params.destination}.

${lastDayBlock}${flightReturnClosing}`;
}

/** Fast, cost-efficient model for structured trip-plan JSON. */
export const GEMINI_TRIP_PLAN_MODEL = "gemini-3.5-flash";

/** Enough headroom for multi-day catalog JSON — prevents truncated streams. */
export const GEMINI_TRIP_PLAN_MAX_OUTPUT_TOKENS = 8192;

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
  const motorhome = isMotorhomeTrip(params);
  const roadTrip = isRoadTripRequest(params);
  const motorhomeRules = motorhome ? motorhomePromptRules(true) : "";
  const lastDayBlock = lastDayReturnPromptBlock({
    groundTransportMode: params.groundTransportMode,
    originPlace: params.originPlace,
    returnFromIata: params.returnFromIata,
    destinationIata: params.destinationIata,
  });
  const flightReturnEuRule = params.groundTransportMode
    ? `- Če je prevoz avto/vlak/avtodom: trip_metadata.return_flight_eu NE izpolnjuj — potnik se vrne z istim prevozom na izhodišče (${params.originPlace ?? "domov"}), ne z letalom.`
    : `- Na zadnjem dnevu logistike obvezno generiraj točno uro mednarodnega leta nazaj v Evropo (EU) in izpolni trip_metadata.return_flight_eu.`;
  const povratekEuBlock = params.groundTransportMode
    ? `POVRATEK DOMOV (obvezno — ${params.groundTransportMode === "train" ? "VLAK" : "AVTO/AVTODOM"}):
- Zadnji dan: vožnja/vlak nazaj na izhodiščno lokacijo — NE mednarodni let z letališča.
- trip_metadata.return_flight_eu NE izpolnjuj.`
    : `POVRATEK V EU (obvezno):
- Zadnji dan logistike: aktivnost category airport z natančno uro odhoda in prihoda v EU.
- Izpolni trip_metadata.return_flight_eu (departure_time, arrival_time_eu, from_airport, to_airport, summary).`;

  const lastDayTransitException = params.groundTransportMode
    ? "razen zadnjega logističnega dneva (vožnja/vlak nazaj na izhodišče)"
    : "razen zadnjega logističnega dneva na izhodno letališče";

  const lang = (params.language ?? "sl") as Lang;
  const displayCurrency: PlanCurrency = normalizePlanCurrency(params.currency);
  const writingRule = languageWritingRule(lang);
  const moneyRule = currencyWritingRule(displayCurrency);

  return `Si strokovni potovalni agent za aplikacijo skybooplan. Striktno sledi zahtevani JSON shemi.

${STRICT_LLM_LANGUAGE_RULE}

${STRICT_LLM_CURRENCY_RULE}

JEZIK IZHODA:
${writingRule}

VALUTA (displayCurrency = ${displayCurrency}):
${moneyRule}

${motorhomeRules}

STROGO PRAVILO — AVTODOM / RV / CAMPERVAN:
- Če uporabnik v željah (Tvoje želje / customWishes) izrecno navede potovanje z AVTODOMOM, RV-jem, campervanom ali road tripom z najetim avtodomom:
  • Polje hotels MORA biti prazno polje [] — nikoli ne predlagaj hotelov!
  • Za vsak dan dodaj med activities vsaj eno nočitev: RV park / kamp / KOA / campground (category: hotel) z realnim imenom in coordinates.
  • Med mesti načrtuj vožnjo z avtodomom — brez notranjih letov z RV-jem.
  • Route 66 / cestna pot: enosmerna pot vzdolž ceste, postaja za nočitev na kampu ob vsaki etapi.
- Če uporabnik omeni periodične hotel nočitve ("vsak 5 dan hotel"), hotels[] ostane [], hotel omeni le kot izjemo v activities tistega dne.

HITROST — bogati, privlačni opisi (obvezno):
- Polje description pri vsaki aktivnosti mora biti izjemno podrobno, zanimivo in dolgo vsaj 3–4 stavke (150–300 besed skupaj na dan).
- Vsaka aktivnost mora imeti estimatedCostEur z realno cifro v ${displayCurrency} (vstopnine, hrana, gorivo — ne 0, razen res brezplačnih). Polje se imenuje estimatedCostEur, vrednost pa je v ${displayCurrency}.
- dailyBudget na vsakem dnevu mora biti realna vsota dnevnih stroškov v ${displayCurrency} — nikoli 0. Prilagodi rang državi (npr. večerja na Šrilanki ≈ 5–15 ${displayCurrency === "USD" ? "$" : "€"}, ne 40).
${flightReturnEuRule}

STROGA GEOGRAFSKA NATANČNOST:
- season_warning mora biti 100 % specifičen za izbrano lokacijo in mesec (vreme, sezona, lokalni dogodki).
- NE omenjaj pojavov, ki na tej lokaciji ne obstajajo (npr. plimovanje, bioluminiscenca, lagune, tropski monsuni v mestih, kjer tega ni — kot Tokio, Kioto, evropska mesta).
- Če za lokacijo ni resnega sezonskega tveganja, napiši kratko, realno opozorilo (npr. vročina, dež, sezona turistov) ali nevtralen stavek — brez izmišljanja.

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
- Za vsako aktivnost obvezno arrivalTime in departureTime (HH:MM) — realen urnik dneva.
- Vsaka aktivnost MORA imeti timeSlot: natanko "dopoldan", "popoldan" ali "vecer" — brez izjeme!
- category mora ustrezati dejanski vsebini aktivnosti — ne uporabljaj vedno iste kategorije.

OBVEZNA ČASOVNA STRUKTURA DNEVA (brez izjeme):
- Vsak dan MORA vsebovati strukturirane aktivnosti za DOPOLDAN (timeSlot: "dopoldan"), POPOLDAN ("popoldan") in VEČER ("vecer").
- Noben del dneva ne sme ostati prazen — vsaj ena smiselna aktivnost na vsak časovni okvir.
- Ure obiska (arrivalTime, departureTime) morajo biti tekoče in realistične, brez prekrivanj (npr. 09:00–11:30 dopoldan, 13:00–16:00 popoldan, 19:00–21:30 večer).

NASVET ZA PREMIK (transportTip / rubrika "Kako se premikati" — izbirno, samo na ravni dneva):
- Rubriko "Kako se premikati" (polje days[].transportTip) generiraj SAMO IN IZKLJUČNO takrat, ko obstaja kakšen specifičen, edinstven nasvet za tisti konkretni dan (npr. nasvet o parkiranju avtodoma, opozorilo o lokalnem prometu, zaprta cesta, poplave, močan veter).
- Če ni nobenih posebnosti, to rubriko popolnoma izpusti — ne generiraj generičnih nasvetov o javnem prevozu, taxijih, metrou ali Grabu!
- Ne ponavljaj istih nasvetov na več dneh — vsak transportTip mora biti edinstven za tisti dan ali ga sploh ne vključi.

LOKALNI PREVOZ DO AKTIVNOSTI (obvezno v opisih):
- Za vsako znamenitost ali aktivnost obvezno navedi, KAKO najlažje priti do tja (npr. "Uporabi aplikacijo Grab", "Vzemi lokalni TukTuk", "Pojdi z Uberjem", "Uporabi Metro", "Peš 10 min od hotela").
- Ta lokalni logistični nasvet vključi direktno v polje description aktivnosti — ne v generično ponavljajočo rubriko transportTip!

NOTRANJI PREVOZ (transportation[] — obvezno ob letu/trajektu/vlaku):
- Če dan vključuje notranji let, trajekt ali vlak med mesti, obvezno izpolni days[].transportation[] z natanko enim ali več zapisi:
  • type: "flight" | "ferry" | "train" | "van"
  • from / to: imeni letališč/pristanišč/postaj ali mest
  • duration: realen čas potovanja (npr. "1h 20m")
  • estimatedPrice: ocena cene v EUR na osebo

OTOK Z LETALIŠČEM NA CELINI (Boracay/MPH in podobno — obvezno):
- Ko je destinacija otok, dostopen prek bližnjega letališča na celini (npr. Boracay prek MPH/Caticlan), transportation[] MORA vsebovati 3 zaporedne korake — NE piši enega leta neposredno do otoka:
  1. type "flight" — iz prejšnjega mesta do letališča (npr. Manila → Caticlan MPH)
  2. type "van" — iz letališča do pristanišča (npr. Caticlan Airport → Caticlan Jetty Port)
  3. type "ferry" — iz pristanišča na otok (npr. Caticlan Port → Boracay Island)
- Polje city naj ostane ime otoka (Boracay); coordinates (lat/lng) naj kažejo sredi otoka, ne na letališče MPH.

OBVEZNA DNEVNA LOGISTIKA (itinerar[].days[] — za vsak dan):
- dailyBudget: ocena dnevnih stroškov v EUR (gorivo, hrana, kamping pristojbine) — realna številka, ne 0.
- drivingDistanceKm: točna ocena dolžine vožnje za ta dan v km (0 le če ni vožnje).
- drivingDurationHours: trajanje vožnje npr. "3h 45m" (0h le če ni vožnje — uporabi "0h").

- Vsaka aktivnost z ogledom/znamenitostjo (category razen hotel/airport) MORA imeti tripAdvisorStyleDetails z realnimi, lokacijsko specifičnimi podatki.

OBVEZNE ZNAMENITOSTI NA FAZO (itinerar[].pois[]):
- Za vsako postojanko generiraj pois[] z natančnimi lat/lng — glavne znamenitosti, ki jih bomo obiskali.
- Vsaka faza MORA imeti unsplashQuery (angleško ime mesta za iskanje slik, npr. "Dubai", "Bangkok").
- Vsak POI: name (angleško/uradno ime), description (2–3 privlačne stavke), lat, lng, unsplashQuery (angleško ime za Unsplash, npr. "Burj Khalifa", "Grand Palace Bangkok").
- Vsak POI MORA imeti tripAdvisorStyleDetails (obvezno, brez izjeme):
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

VEČ DESTINACIJ — LOGIČNA, ENOSMERNA POT (brez skakanja):
- Če je potovanje daljše od 10 dni in destinacija predstavlja celo državo ali večjo regijo (npr. Japonska, Tajska, Italija, Španija), NE omejuj celotnega itinerarja na eno samo mesto — a tudi NE raztegni na preveč regij.
- STROGA GEOGRAFSKA LINEARNOST (obvezno): Pot mora potekati enosmerno v enem jasnem geografskem smernem loku. Prepovedano je:
  • skakanje s severa na jug in nazaj (npr. Bangkok → Chiang Mai → južni otoki → spet Bangkok — NAROBE),
  • vračanje v mesta/regije, ki jih je potnik že obiskal (${lastDayTransitException}),
  • ciklična pot ali "zig-zag" preko celega ozemlja brez smisla.
- Primeri DOVOLJENIH poti za Tajsko (izberi EN sam smerni lok, ne mešaj obeh):
  • severni lok: Bangkok → Ayutthaya → Chiang Mai → Chiang Rai → odhod iz Chiang Mai ali Bangkoka,
  • južni lok: Bangkok → Ayutthaya → Krabi/Phuket/Koh Lanta → odhod iz južnega letališča ali Bangkoka,
  • osrednji lok: Bangkok → Ayutthaya → Chiang Mai (brez skoka na otroke) ALI Bangkok → Hua Hin → juž — nikoli oboje v istem načrtu.
- Primer za Japonsko: Tokio → Hakone → Kjoto → Osaka (enosmerno proti zahodu/jugu, brez vračanja v Tokio sredi poti).
- Vsaka faza (phase) = ena regija/mesto; dni razporedi sorazmerno glede na velikost lokacije.
- Unikatnost mest: Vsako mesto/regija se lahko v celotnem itinerarju pojavi samo enkrat (izjema: zadnji dan — le ${params.groundTransportMode ? "vožnja/vlak nazaj domov" : "tranzit na izhodno letališče"}, brez ogledov).

PRILAGODITEV TRAJANJU — MANJ REGIJ, VEČ ČASA NA KRAJ (obvezno):
${motorhome || roadTrip ? `- ROAD TRIP / AVTODOM: Načrtuj enosmerno pot z ${params.days} postajami vzdolž ceste. Vsak dan mora imeti smiselne aktivnosti + kamp/RV park za nočitev. Ne združuj več dni v eno mesto, razen če uporabnik izrecno želi.` : `- Število glavnih baz (mest/regij, kjer potnik prespi več dni) MORAŠ omejiti glede na dolžino poti — manj regij = manj prevozev, več uživanja:
  • 7–9 dni: največ 2 glavni bazi (+ morebitna kratka postaja),
  • 10–14 dni: največ 3 glavne baze (NE 4, 5 ali več — uporabnik ne sme preživeti dopusta na letalih/vlakih),
  • 15–21 dni: največ 4 glavne baze.
- Med bazami načrtuj le en logičen premik; izogibaj se dnevnim dolgim preskokom (>4–5 h prevoza) razen ob enem preselitvenem dnevu med bazami.
- Če je pot krajša od 10 dni, ostani v 1–2 mestih/regijah — ne raztezaj na celo državo.`}

${lastDayBlock}

PRILAGODITEV POTNIKOM IN PRORAČUNU (obvezno):
- Celoten itinerar, tempo, predlagana hrana, aktivnosti, prevoz in finance MORAŠ popolnoma prilagoditi natančni sestavi potnikov (pax) in izbranemu proračunu.
- Otroci: upoštevaj starost vsakega otroka — manjši otroci = krajši dnevi, več odmorov, družinske aktivnosti, varna hrana in manj napornih prevozev.
- Budget (nizki proračun): hostli, javni prevoz, brezplačne/poceni atrakcije, lokalna hrana.
- Standard: uravnotežen mix cene in udobja.
- Premium: boljši hoteli, fine dining, zasebni transferji, ekskluzivnejše izkušnje.
- Posebne zahteve (npr. vegetarijansko/vegansko, dostopno z vozičkom, najem avtomobila, brez nočnih voženj) moraš dosledno upoštevati v celotnem planu — hrana, aktivnosti in logistika.`;
}

/** Streaming Gemini generation — keeps HTTP connection alive (avoids serverless timeout). */
export function createTripPlanStream(params: GenerateTripPlanParams) {
  pipelineLog("gemini:streamObject START");
  return streamObject({
    model: google(GEMINI_TRIP_PLAN_MODEL),
    system: tripPlanSystemPrompt(params),
    prompt: buildTripPlanPrompt(params),
    schema: tripPlanSchema,
    ...tripPlanGenerationConfig,
  });
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

    return payload as TripPlanResponse;
  } catch (error) {
    if (error instanceof Error && error.name === "OperationTimeoutError") {
      console.error("Gemini Pro timeout:", error.message);
      throw new Error("Generiranje načrta je preseglo časovno mejo. Poskusi znova.");
    }
    console.error("Gemini Pro napaka:", error);
    throw new Error("Napaka pri generiranju načrta preko Gemini Pro");
  }
}
