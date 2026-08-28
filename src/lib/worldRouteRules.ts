/**
 * Worldwide route sense for the planner LLM.
 * No destination names — the model chooses cities; cards and Mapbox stay unchanged.
 */

const POINTS_SL = [
  "Najprej baze, potem dnevi. Zakleni mesta + nočitve + prevoze; šele nato dopoldan/popoldan/večer.",
  "Število baz raste z dnevi, ne dolžina ene plaže. ~2–4 noči na bazo; 1 noč samo za čisti transfer. Če ostane ≥3 noči presežka, dodaj NOVO bazo na isti smeri — ne 5. dan v istem letovišču.",
  "Enosmerni lok po zemljevidu. Ena dolga os, potem lahko drugi konec, nato hub. PREPOVEDANO vrniti se z notranjim letom ali težkim trajektom v zapuščeno regijo (jug→sever→spet jug, vzhod→zahod→spet vzhod, ali obala→drug otok→spet ista obala). Otok ob prihodnem letališču (kratek trajekt): nočitev takoj po pristanku ALI zadnja baza pred odhodom — nikoli v sredini celinske obalne vožnje. En premik med dvema bazama — naslednji dan je samo nova baza: brez naslova stare regije in brez ponovljenega A→B. Zadnji koledarski dan = mesto mednarodnega IATA leta, ne oddaljen park brez piste.",
  "Težek premik (≥5–6 h vrata–vrata: čoln+kombi+let) poje dan: ni templja ob 09:00 in ni celodnevnega izleta.",
  "Vstopna/izstopna tranzitna metropola: na začetku največ 2–3 noči, ob povratku največ 1–2, skupaj ≤30 % poti. Sproščene dni daj v notranje kulturne/gorske baze in otoke/parke (≥3 noči).",
  "Dolg dostop = dovolj noči ali izpusti. Kraj, do katerega rabiš pol dneva, dobi ≥4 noči — ali ga ni.",
  "Aktivnosti so od mesta, kjer spiš. POI ∈ baza — samo območje te baze, ne drug kraj istega otoka ali države. Ne parkirati znamenitosti naslednje baze na današnji dan.",
  "Dve oddaljeni državi/regiji: najprej zaključi vse nočitve v prvi, potem en dan samo prevoz (let), šele nato program v drugi. Prepovedano: plaža/otok/safari druge države na dnevu, kjer spiš v prvi.",
  "Let > program. Pred pristankom prazno. Zadnji dan samo do ure odhoda.",
  "Mednarodni dolg let: ne izmišljuj pristanka 2 uri po odhodu. Evropa→Azija/Amerika je 10+ ur plus časovni pas — prihod šele popoldan/zvečer istega dne ali naslednje jutro. Ure z izbranega leta zmagajo.",
  "Prepovedani votli naslovi brez opisa (Morning in …, Visit …, City Exploration, Snorkeling Trip, prosti / lokalni dan, Izlet na otok, Raziskovanje območja, Po jutranji kavi se sprehodite). Poln dan v bazi = konkretno ime + opis. Transfer/prihod/odhod sme imeti prazen slot. Ne kopiraj odhodnega mednarodnega leta (domači IATA + ura na vozovnici) na dneve 2…N−1 — ta let je samo dan 1 / dnevi v zraku.",
  "Ne izmišljuj hotelov in restavracij. Ime kraja ali izpusti slot.",
];

const MULTI_WEEK_SL = [
  "ENOSMERNA GEOGRAFSKA LINIJA (brez zig-zag): večdnevna in večtedenska pot teče v ENI logični smeri (sever→jug ALI zahod→vzhod). PREPOVEDANO preskakovanje med oddaljenimi regijami — npr. sever→jug, nazaj na zahod, spet na jug. En lok, ne nihalo.",
  "KVALITETA PRED KVANTITETO BAZ: za 14–21 koledarskih dni največ 4–6 glavnih baz. Vsaka baza 2–4 nočitve; 1 noč samo za čisti transfer. PREPOVEDANO veriga zaporednih 1-nočnih premikov skozi celotno potovanje (safari/več držav enako kot otoki).",
  "KRONOLOGIJA POVRATNEGA DNEVA: dan N (zadnji koledarski dan) = IZKLJUČNO pristanek na domačem letališču in pot domov — ne destinacijski ogledi. Če je nočni let z odhodom na dan N−1 (board 00:00–05:59): na dan N NI dopoldanskih odhodov, odjav ali transferjev NA DESTINACIJI. Checkout + prevoz na letališče sta zvečer dneva N−1; dan N = let v zraku + popoldanski pristanek doma.",
];

const MULTI_WEEK_EN = [
  "ONE-WAY GEOGRAPHIC LINE (no zig-zag): multi-day and multi-week trips run in ONE logical direction (north→south OR west→east). FORBIDDEN hopping distant regions — e.g. north→south, back west, then south again. One arc, not a pendulum.",
  "QUALITY OVER QUANTITY OF BASES: for 14–21 calendar days, at most 4–6 main bases. Each base 2–4 nights; 1 night only for a pure transfer. FORBIDDEN a chain of consecutive 1-night hops through the whole trip (safari / multi-country same as islands).",
  "RETURN-DAY CHRONOLOGY: Day N (last calendar day) = ONLY landing at the home airport and travel home — no destination sightseeing. If the overnight flight boarded on day N−1 (board 00:00–05:59): Day N has NO morning departures, check-outs, or transfers AT THE DESTINATION. Check-out + airport transfer sit on the evening of day N−1; Day N = airborne flight + afternoon landing at home.",
];

const POINTS_EN = [
  "Bases first, then days. Lock cities + night counts + transfers; only then fill morning/afternoon/evening.",
  "The number of bases grows with trip length, not one beach town. ~2–4 nights per base; 1 night only for a pure transfer. If ≥3 surplus nights remain, add a NEW base on the same heading — not a 5th night in the same resort.",
  "One-way arc on the map. One long axis, then the other end if needed, then hub. FORBIDDEN to fly or take a heavy ferry back into an abandoned region (south→north→south again, east→west→east, or coast→another island→same coast). A short-ferry island next to the arrival airport is overnight right after landing OR the last overnight before departure — never spliced into the middle of a mainland coastal drive. One transfer between two bases — the next day is only the new base: no leftover title of region A and no replayed A→B. Last calendar day = the international IATA city, not a remote park without a runway.",
  "A heavy move (≥5–6h door-to-door: boat+van+flight) consumes the day: no 09:00 temple and no full-day excursion.",
  "Entry/exit transit metropolis: at most 2–3 nights at the start, 1–2 at the return, ≤30% of the trip in total. Give leftover nights to interior cultural/mountain bases and islands/parks (≥3 nights each).",
  "Long access = enough nights or skip. A place that takes half a day to reach gets ≥4 nights — or it is not on the trip.",
  "Activities belong to the city you sleep in. POI ∈ that base's area — not another town on the same island or country. Do not park the next base's sights on today's card.",
  "Two distant countries/regions: finish every night in the first, then one travel-only day (flight), then the second region's programme. Forbidden: the other country's beach/island/safari on a day you still sleep in the first.",
  "Flight beats programme. Empty before landing. Last day only until departure.",
  "Long-haul: do not invent a landing 2 hours after departure. Europe→Asia/Americas is 10+ hours plus timezone — arrive afternoon/evening the same day or next morning. The chosen ticket wins.",
  "Forbidden hollow titles without a description (Morning in …, Visit …, City Exploration, Snorkeling Trip, free / local day, Island trip, Area exploration). A full base day needs a real name + description. Transfer/arrival/departure days may leave a slot empty. Never copy the origin international departure (home IATA + boarding-pass HH:MM) onto days 2…N−1 — that flight exists only on day 1 / in-flight days.",
  "Do not invent hotel or restaurant names. A real venue or omit the slot.",
];

export function worldRouteRulesPromptBlock(slo: boolean): string {
  const points = slo ? POINTS_SL : POINTS_EN;
  const multi = slo ? MULTI_WEEK_SL : MULTI_WEEK_EN;
  const title = slo
    ? "=== SMSEL POTI (ves svet — pred kuriranim seznamom mest) ==="
    : "=== ROUTE SENSE (worldwide — before any curated city list) ===";
  const lead = slo
    ? "Brez imen mest, razen če jih je napisal uporabnik ali jih vrne izbrani let. Karte in zemljevid ostanejo ista polja."
    : "No city names unless the user wrote them or the chosen flight implies them. Cards and the map keep the same fields.";
  const multiTitle = slo
    ? "=== VEČDRŽAVNA & SAFARI PRAVILA (14+ dni — obvezno) ==="
    : "=== MULTI-COUNTRY & SAFARI RULES (14+ days — mandatory) ===";
  return [
    title,
    lead,
    ...points.map((p) => `- ${p}`),
    multiTitle,
    ...multi.map((p) => `- ${p}`),
  ].join("\n");
}

/** True if the block leaked a locked destination (regression guard). */
export function worldRouteRulesMentionsDestination(text: string): boolean {
  return /phuket|krabi|lipe|ayutthaya|holbox|ubud|bali|bangkok|chiang mai|vilanculos|botswana|bocvan|mozambik/i.test(
    text,
  );
}
