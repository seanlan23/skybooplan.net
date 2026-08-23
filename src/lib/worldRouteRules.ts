/**
 * Worldwide route sense for the planner LLM.
 * No destination names — the model chooses cities; cards and Mapbox stay unchanged.
 */

const POINTS_SL = [
  "Najprej baze, potem dnevi. Zakleni mesta + nočitve + prevoze; šele nato dopoldan/popoldan/večer.",
  "Število baz raste z dnevi, ne dolžina ene plaže. ~2–4 noči na bazo; 1 noč samo za čisti transfer. Če ostane ≥3 noči presežka, dodaj NOVO bazo na isti smeri — ne 5. dan v istem letovišču.",
  "Enosmerni lok po zemljevidu. Nazaj na hub samo zadnjo noč pred mednarodnim letom.",
  "Težek premik (≥5–6 h vrata–vrata: čoln+kombi+let) poje dan: ni templja ob 09:00 in ni celodnevnega izleta.",
  "Dolg dostop = dovolj noči ali izpusti. Kraj, do katerega rabiš pol dneva, dobi ≥4 noči — ali ga ni.",
  "Aktivnosti so od mesta, kjer spiš. POI ∈ baza. Ne parkirati znamenitosti naslednje baze na današnji dan.",
  "Let > program. Pred pristankom prazno. Zadnji dan samo do ure odhoda.",
  "Ne izmišljuj hotelov in restavracij. Ime kraja ali izpusti slot.",
];

const POINTS_EN = [
  "Bases first, then days. Lock cities + night counts + transfers; only then fill morning/afternoon/evening.",
  "The number of bases grows with trip length, not one beach town. ~2–4 nights per base; 1 night only for a pure transfer. If ≥3 surplus nights remain, add a NEW base on the same heading — not a 5th night in the same resort.",
  "One-way arc on the map. Return to the hub only on the last night before the international flight.",
  "A heavy move (≥5–6h door-to-door: boat+van+flight) consumes the day: no 09:00 temple and no full-day excursion.",
  "Long access = enough nights or skip. A place that takes half a day to reach gets ≥4 nights — or it is not on the trip.",
  "Activities belong to the city you sleep in. POI ∈ base. Do not park the next base's sights on today's card.",
  "Flight beats programme. Empty before landing. Last day only until departure.",
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
  return /phuket|krabi|lipe|ayutthaya|holbox|ubud|bali|bangkok|chiang mai/i.test(text);
}
