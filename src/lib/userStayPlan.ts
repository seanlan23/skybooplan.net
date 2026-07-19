/**
 * Detect / parse explicit multi-stop stay plans from free-text wishes
 * (e.g. "prvo noč Phuket, 3 dni Khao Sok, 2 dni Ao Nang…").
 */

const WORD_DAYS: Record<string, number> = {
  eno: 1,
  ena: 1,
  en: 1,
  dva: 2,
  dve: 2,
  tri: 3,
  stiri: 4,
  štiri: 4,
  pet: 5,
  sest: 6,
  šest: 6,
  sedem: 7,
  osem: 8,
  devet: 9,
  deset: 10,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
};

/** Common Slovenian / typo → canonical English place for itinerar[].city */
const PLACE_ALIASES: Array<{ test: RegExp; city: string }> = [
  { test: /patronk|patong/i, city: "Patong" },
  { test: /khao\s*sok/i, city: "Khao Sok" },
  { test: /ao\s*nang/i, city: "Ao Nang" },
  { test: /phi\s*phi|phiphi/i, city: "Koh Phi Phi" },
  { test: /railay|railey/i, city: "Railay" },
  { test: /krabi/i, city: "Krabi" },
  { test: /ph+uket|phkuket|hkt/i, city: "Phuket" },
  { test: /bangkok|bkk/i, city: "Bangkok" },
  { test: /chiang\s*mai|cnx/i, city: "Chiang Mai" },
];

export type UserStaySegment = {
  city: string;
  nights: number;
  startDay: number;
  endDay: number;
};

function parseDayCount(raw: string): number {
  const key = raw.trim().toLowerCase();
  if (WORD_DAYS[key] != null) return WORD_DAYS[key]!;
  const n = Number.parseInt(key, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function normalizePlace(raw: string): string {
  const cleaned = raw
    .replace(/[.,;:!]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  for (const { test, city } of PLACE_ALIASES) {
    if (test.test(cleaned)) return city;
  }
  // Title-case leftover tokens (keep short)
  return cleaned
    .split(" ")
    .slice(0, 4)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** True when the user spelled out a multi-stop day/night allocation. */
export function hasExplicitStayPlan(wishes?: string): boolean {
  const t = (wishes ?? "").toLowerCase();
  if (!t.trim()) return false;
  const dayHits = (
    t.match(
      /\b(?:\d+|eno|ena|en|dva|dve|tri|štiri|stiri|pet|šest|sest|sedem|osem|devet|deset|one|two|three|four|five)\s*(?:dn[ieiyá]|days?|no[cč])/gi,
    ) ?? []
  ).length;
  const firstNight = /(?:prvo|eno|first)\s+no[cč]|first\s+night/i.test(t);
  return dayHits >= 2 || (firstNight && dayHits >= 1);
}

/**
 * Parse ordered stay segments from free text.
 * Supports SL: "prvo noč Phuket, 3 dni Khao Sok, dva dni Patong"
 * and EN: "1 night Phuket, 3 days Khao Sok".
 */
export function parseStayPlanFromWishes(wishes: string): Array<{ city: string; nights: number }> {
  const t = wishes.normalize("NFC");
  type Hit = { city: string; nights: number; index: number };
  const hits: Hit[] = [];

  const push = (nights: number, placeRaw: string, index: number) => {
    if (nights <= 0) return;
    const city = normalizePlace(placeRaw);
    if (!city || city.length < 2) return;
    hits.push({ city, nights, index });
  };

  for (const m of t.matchAll(
    /(?:prvo|eno|1)\s+no[cč]\w*\s+([A-Za-zČčŠšŽžÁáÉéÍíÓóÚúÜüÄäÖö0-9][A-Za-zČčŠšŽžÁáÉéÍíÓóÚúÜüÄäÖö0-9\s-]{1,40}?)(?=\s*[,.]|\s+in\s+|\s+\d|\s*$)/gi,
  )) {
    push(1, m[1] ?? "", m.index ?? 0);
  }

  for (const m of t.matchAll(
    /(\d+|eno|ena|en|dva|dve|tri|štiri|stiri|pet|šest|sest|sedem|osem|devet|deset|one|two|three|four|five)\s*(?:dn[ieiyá]\w*|days?|nights?|no[cč]\w*)\s+(?:v\s+|in\s+|na\s+)?([A-Za-zČčŠšŽžÁáÉéÍíÓóÚúÜüÄäÖö0-9][A-Za-zČčŠšŽžÁáÉéÍíÓóÚúÜüÄäÖö0-9\s-]{1,40}?)(?=\s*[,.]|\s+in\s+|\s+\d|\s*$)/gi,
  )) {
    push(parseDayCount(m[1] ?? ""), m[2] ?? "", m.index ?? 0);
  }

  hits.sort((a, b) => a.index - b.index);

  // Drop near-duplicates (same city consecutive from overlapping regexes).
  const out: Array<{ city: string; nights: number }> = [];
  for (const h of hits) {
    const prev = out[out.length - 1];
    if (prev && prev.city.toLowerCase() === h.city.toLowerCase() && prev.nights === h.nights) {
      continue;
    }
    out.push({ city: h.city, nights: h.nights });
  }
  return out;
}

export function staySegmentsToDayPlan(
  segments: Array<{ city: string; nights: number }>,
  totalDays: number,
): UserStaySegment[] {
  if (segments.length === 0 || totalDays <= 0) return [];
  let day = 1;
  const result: UserStaySegment[] = [];
  for (const seg of segments) {
    if (day > totalDays) break;
    const span = Math.max(1, seg.nights);
    const startDay = day;
    const endDay = Math.min(totalDays, day + span - 1);
    result.push({ city: seg.city, nights: endDay - startDay + 1, startDay, endDay });
    day = endDay + 1;
  }
  // Stretch / assign leftover days to the last stop (return buffer).
  if (result.length && day <= totalDays) {
    const last = result[result.length - 1]!;
    last.endDay = totalDays;
    last.nights = last.endDay - last.startDay + 1;
  }
  return result;
}

/** Prompt block — absolute priority over curated Thailand graphs. */
export function buildUserStayPlanPromptBlock(
  wishes: string | undefined,
  totalDays: number,
): string | undefined {
  if (!hasExplicitStayPlan(wishes)) return undefined;
  const parsed = parseStayPlanFromWishes(wishes ?? "");
  const plan = staySegmentsToDayPlan(parsed, totalDays);
  if (plan.length < 2) {
    return `
=== UPORABNIKOV RAZPORED (ABSOLUTNA PREDNOST) ===
Uporabnik je v željah natančno navedel mesta in število dni/noči.
PREPOVEDANO: ignorirati ta razpored in uporabiti "tipično" Phuket/Andaman kurirano pot (Koh Lipe ipd.), če uporabnik tega NI prosil.
Razporedi itinerar[] faze in days[].city NATANKO po njegovem besedilu želja.
===`;
  }

  const lines = plan
    .map((s) =>
      s.startDay === s.endDay
        ? `  • Dan ${s.startDay}: ${s.city}`
        : `  • Dan ${s.startDay}–${s.endDay}: ${s.city}`,
    )
    .join("\n");

  return `
=== UPORABNIKOV RAZPORED BAZ (ABSOLUTNA PREDNOST — pred kurirano potjo) ===
Uporabnik je SAM določil vrstni red in število dni. To NI predlog — to je OBVEZEN blueprint.

regionBlueprint (itinerar[] faze + days[].city MORATA slediti):
${lines}

Pravila:
- PREPOVEDANO zamenjati ta razpored s kurirano potjo (npr. Phuket→Krabi→Koh Lipe), če uporabnik ni prosil za ta mesta.
- Vsak dan v razponu mora imeti city = mesto iz vrstice zgoraj (Patong šteje kot baza na Phuketu — city "Patong" ali "Phuket (Patong)").
- Med fazami obvezno transportation[] (kombi/trajekt/let) z realnimi časi — SAMO na dnevu premika, ne na prejšnjem dnevu bivanja.
- pois[] faze smejo vsebovati samo znamenitosti TE baze — ne trajekta/aktivnosti naslednje baze (npr. Ao Nang faza NE sme imeti “Koh Phi Phi” POI, dokler ni dan odhoda na Phi Phi).
- Če vsota noči ≠ ${totalDays}, prilagodi SAMO zadnjo bazo (buffer za odhod), ne spreminjaj vrstnega reda.
===`;
}
