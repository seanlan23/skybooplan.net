/**
 * Worldwide route sense for the planner LLM.
 * No destination names — the model chooses cities; cards and Mapbox stay unchanged.
 */

const POINTS_SL = [
  "Najprej baze, potem dnevi. Zakleni mesta + nočitve + prevoze; šele nato dopoldan/popoldan/večer.",
  "Število baz raste z dnevi, ne dolžina ene plaže. ~2–4 noči na bazo; 1 noč samo za čisti transfer. Če ostane ≥3 noči presežka, dodaj NOVO bazo na isti smeri — ne 5. dan v istem letovišču.",
  "Enosmerni lok po zemljevidu. Ena dolga os, potem lahko drugi konec, nato hub. PREPOVEDANO vrniti se z notranjim letom ali težkim trajektom v zapuščeno regijo (jug→sever→spet jug, vzhod→zahod→spet vzhod, ali obala→drug otok→spet ista obala). En premik med dvema bazama — naslednji dan je samo nova baza: brez naslova stare regije in brez ponovljenega A→B. Zadnji koledarski dan = mesto mednarodnega IATA leta, ne oddaljen park brez piste.",
  "Težek premik (≥5–6 h vrata–vrata: čoln+kombi+let) poje dan: ni templja ob 09:00 in ni celodnevnega izleta.",
  "Dolg dostop = dovolj noči ali izpusti. Kraj, do katerega rabiš pol dneva, dobi ≥4 noči — ali ga ni.",
  "Aktivnosti so od mesta, kjer spiš. POI ∈ baza — samo območje te baze, ne drug kraj istega otoka ali države. Ne parkirati znamenitosti naslednje baze na današnji dan.",
  "Dve oddaljeni državi/regiji: najprej zaključi vse nočitve v prvi, potem en dan samo prevoz (let), šele nato program v drugi. Prepovedano: plaža/otok/safari druge države na dnevu, kjer spiš v prvi.",
  "Let > program. Pred pristankom prazno. Zadnji dan samo do ure odhoda.",
  "Mednarodni dolg let: ne izmišljuj pristanka 2 uri po odhodu. Evropa→Azija/Amerika je 10+ ur plus časovni pas — prihod šele popoldan/zvečer istega dne ali naslednje jutro. Ure z izbranega leta zmagajo.",
  "Prepovedani votli naslovi brez opisa (Morning in …, Visit …, City Exploration, Snorkeling Trip, prosti / lokalni dan, Izlet na otok, Raziskovanje območja, Po jutranji kavi se sprehodite). Poln dan v bazi = konkretno ime + opis. Transfer/prihod/odhod sme imeti prazen slot. Ne kopiraj odhodnega mednarodnega leta (domači IATA + ura na vozovnici) na dneve 2…N−1 — ta let je samo dan 1 / dnevi v zraku.",
  "Ne izmišljuj hotelov in restavracij. Ime kraja ali izpusti slot.",
];

const POINTS_EN = [
  "Bases first, then days. Lock cities + night counts + transfers; only then fill morning/afternoon/evening.",
  "The number of bases grows with trip length, not one beach town. ~2–4 nights per base; 1 night only for a pure transfer. If ≥3 surplus nights remain, add a NEW base on the same heading — not a 5th night in the same resort.",
  "One-way arc on the map. One long axis, then the other end if needed, then hub. FORBIDDEN to fly or take a heavy ferry back into an abandoned region (south→north→south again, east→west→east, or coast→another island→same coast). One transfer between two bases — the next day is only the new base: no leftover title of region A and no replayed A→B. Last calendar day = the international IATA city, not a remote park without a runway.",
  "A heavy move (≥5–6h door-to-door: boat+van+flight) consumes the day: no 09:00 temple and no full-day excursion.",
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
  const title = slo
    ? "=== SMSEL POTI (ves svet — pred kuriranim seznamom mest) ==="
    : "=== ROUTE SENSE (worldwide — before any curated city list) ===";
  const lead = slo
    ? "Brez imen mest, razen če jih je napisal uporabnik ali jih vrne izbrani let. Karte in zemljevid ostanejo ista polja."
    : "No city names unless the user wrote them or the chosen flight implies them. Cards and the map keep the same fields.";
  return [title, lead, ...points.map((p) => `- ${p}`)].join("\n");
}

/** True if the block leaked a locked destination (regression guard). */
export function worldRouteRulesMentionsDestination(text: string): boolean {
  return /phuket|krabi|lipe|ayutthaya|holbox|ubud|bali|bangkok|chiang mai|vilanculos|botswana|bocvan|mozambik/i.test(
    text,
  );
}
