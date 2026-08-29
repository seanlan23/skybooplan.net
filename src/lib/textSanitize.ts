import {
  formatActivityDescription,
  normalizeActivityBullets,
} from "@/lib/activityDescription";
import { localizeTravelCopy } from "@/lib/localizeTravelCopy";

/** Drop raw Markdown table pipes from titles, clocks, and guest copy. */
export function stripMarkdownTablePipes(text: string): string {
  if (!text.includes("|")) return text;
  return text.replace(/\|/g, " ").replace(/[^\S\n]{2,}/g, " ").replace(/\(\s*\)/g, "").trim();
}

/** Strip Cyrillic / wrong-script leaks in Slovenian UI copy. */
export function sanitizeSlText(text: string): string {
  const CYRILLIC_FIX: Record<string, string> = {
    оживи: "oživi",
    ожив: "oživi",
    оживает: "oživi",
  };

  let out = text.replace(/[\u0400-\u04FF]+/g, (match) => {
    const fix = CYRILLIC_FIX[match.toLowerCase()];
    return fix ?? "";
  });

  // Preserve newlines (activity bullets) — only collapse spaces/tabs on a line.
  out = stripMarkdownTablePipes(out);
  out = out
    .replace(/morske sadeve/gi, "morske sadeže")
    .replace(/asistença/gi, "asistenca")
    .replace(/\$(\d{1,2})\s*\/\s*(\d{1,2})\$/g, "$1/$2")
    .replace(/\b2 potnikov\b/g, "2 potnika")
    .replace(/[^\S\n]{2,}/g, " ")
    .replace(/[^\S\n]+([,.])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return out;
}

const SEA_GRAB_COUNTRIES = new Set(["TH", "VN", "PH", "ID", "MY", "SG"]);

/** Strip sunset/evening labels from POI names when the activity is not in the evening slot. */
export function fixPoiNameForSlot(
  name: string,
  slot: "morning" | "afternoon" | "evening",
): string {
  if (slot === "evening") return name;
  const isSunsetName = /sončni zahod|sunset|ob sončnem zahodu|at sunset/i.test(name);
  if (!isSunsetName) return name;
  const stripped = name
    .replace(/\s*\(ob sončnem zahodu\)/gi, "")
    .replace(/\s*\(sunset\)/gi, "")
    .replace(/\s*\(at sunset\)/gi, "")
    .replace(/\s*ob sončnem zahodu/gi, "")
    .replace(/\s*at sunset/gi, "")
    .trim();
  return stripped || name.replace(/\s*\([^)]*zahod[^)]*\)/gi, "").trim() || name;
}

/** Replace US Niagara names and strip Grab outside SEA. */
/** Align timing tips in description with the slot the activity landed in. */
export function fixSlotTimeMismatch(
  description: string,
  slot: "morning" | "afternoon" | "evening",
  name = "",
): string {
  let out = description;
  if (slot === "evening") {
    out = out
      .replace(/najboljši čas za obisk je dopoldne[^.!?]*/gi, "zvečer uživaj v razsvetlitvi in atmosferi")
      .replace(/najboljši čas[^.!?]{0,50}popold(?:an|ne)[^.!?]*/gi, "zvečer je prijeten sprehod in atmosfera")
      .replace(/najboljši čas za obisk je zjutraj[^.!?]*/gi, "zvečer je prijeten sprehod in atmosfera ulic")
      .replace(/najbolje obiskati zjutraj[^.!?]*/gi, "zvečer je prijeten sprehod in atmosfera ulic")
      .replace(/idealen za jutranji obisk[^.!?]*/gi, "zvečer je prijeten sprehod po okolici")
      .replace(
        /best (to visit |visited )?(early )?in the morning[^.!?]*/gi,
        "pleasant evening stroll and street atmosphere",
      )
      .replace(/zjutraj je mirneje[^.!?]*/gi, "zvečer je živahno")
      .replace(/priporočamo obisk zjutraj[^.!?]*/gi, "zvečer je prijeten sprehod po okolici")
      .replace(/priporočamo obisk v zgodnjih urah[^.!?]*/gi, "zvečer uživaj v atmosferi okolice");
  } else if (slot === "morning") {
    out = out
      .replace(/ob sončnem zahodu[^.!?]*/gi, "dopoldanski obisk — manj gneče in boljša svetloba")
      .replace(/at sunset[^.!?]*/gi, "morning visit — best light and fewer crowds")
      .replace(/sončni zahod[^.!?]*/gi, "dopoldanski obisk")
      .replace(/idealna? za prvi večern[^.!?]*/gi, "dopoldanski sprehod — kavarne in butiki so odprti tudi zjutraj")
      .replace(/prvi večern[^.!?]*sprehod[^.!?]*/gi, "dopoldanski sprehod po peš coni")
      .replace(/ideal for (?:an |your )?first evening[^.!?]*/gi, "morning stroll — cafés and shops open from early hours")
      .replace(/najboljši čas za obisk je zjutraj[^.!?]*/gi, "dopoldanski obisk je idealen")
      .replace(/najboljši čas[^.!?]{0,50}popold(?:an|ne)[^.!?]*/gi, "dopoldan je najboljši čas za obisk")
      .replace(/best time.*afternoon[^.!?]*/gi, "morning is the best time to visit")
      .replace(/idealen za popoldanski obisk[^.!?]*/gi, "dopoldan je mirneje in manj gneče");
  } else if (slot === "afternoon") {
    out = out
      .replace(/idealna? za prvi večern[^.!?]*/gi, "popoldanski sprehod — promenada je mirnejša pred večerno gnečo")
      .replace(/prvi večern[^.!?]*sprehod[^.!?]*/gi, "popoldanski sprehod po peš coni")
      .replace(/ideal for (?:an |your )?first evening[^.!?]*/gi, "afternoon stroll before the evening crowd")
      .replace(/najboljši čas za obisk je zjutraj[^.!?]*/gi, "popoldanski obisk je mogoč; zjutraj je mirnejše")
      .replace(/najboljši čas za obisk je dopoldne[^.!?]*/gi, "dopoldanski obisk je idealen — popoldan je še vedno primeren")
      .replace(/najboljši čas za obisk je dopoldne[^.!?]*/gi, "dopoldanski obisk je idealen — popoldan je še vedno primeren")
      .replace(/idealen za jutranji obisk[^.!?]*/gi, "popoldan je primeren za obisk")
      .replace(/najbolje obiskati zjutraj[^.!?]*/gi, "popoldanski obisk je prijeten")
      .replace(/best.*morning[^.!?]*/gi, "afternoon visit works well");
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

/** Strip leaked template phrases from other trip types (Spain motorhome, etc.). */
export function stripRawGoogleMapsDirUrls(text: string): string {
  if (!text) return text;
  return text
    .replace(/https?:\/\/(?:www\.)?google\.[^\s<>"]+\/maps\/dir\/[^\s<>"]+/gi, "")
    .replace(/\s*[—–-]\s*Začetek in konec sta označena kot[^.!?\n]*[.!?]?/gi, "")
    .replace(/\s*[—–-]\s*Start and end are labeled[^.!?\n]*[.!?]?/gi, "")
    .replace(/\bYour%20hotel\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+[—–-]\s*$/g, "")
    .trim();
}

export function sanitizeLegacyTemplateLeak(text: string): string {
  return stripRawGoogleMapsDirUrls(
    sanitizeTransitCardLeak(text)
    .replace(/\s*\(Barcelona\s*\/\s*Madrid\)/gi, "")
    .replace(/\s*\(barcelona\s*\/\s*madrid\)/gi, "")
    .replace(/\bBarcelona\s*\/\s*Madrid\b/gi, "")
    .replace(/ne v centru mesta\s*—/gi, "ne v centru mesta —")
    // LLM invents "Uber lunch/coffee" as a verb (meant "grab") — keep real Uber rides.
    .replace(
      /\bUber\s+(a\s+)?(coffee|snack|lunch|dinner|bite|sweet\s+treat|pastry|bagel)\b/gi,
      "grab $1$2",
    )
    .replace(/\bUber\s+(lunch|dinner|coffee|brunch)\s+near\b/gi, "grab $1 near")
    // "no Grab" / locale leak mangled into "no Uber in Canada" (Uber works in CA cities).
    .replace(
      /\b(Uber\s+or\s+transit\s+back\s*[-–—:]?\s*)?no\s+Uber\s+in\s+Canada\b/gi,
      "Uber or transit back",
    )
    .replace(/\bno\s+Uber\s+in\s+(Toronto|Vancouver|Montreal|Ottawa|Calgary|Banff)\b/gi, "Uber works here")
    .replace(/[^.!?\n]*če imaš še energijo[^.!?\n]*[.!?]?/gi, "")
    .replace(/[^.!?\n]*if you (?:still )?have (?:the )?energy[^.!?\n]*[.!?]?/gi, "")
    .replace(/[^.!?\n]*brez hitenja takoj z letališča[^.!?\n]*[.!?]?/gi, "")
    .replace(/[^.!?\n]*don't rush straight from the airport[^.!?\n]*[.!?]?/gi, "")
    .replace(/[^.!?\n]*osvežitev in kratek odmor[^.!?\n]*[.!?]?/gi, "")
    .replace(/[^.!?\n]*kava pred ogledom[^.!?\n]*[.!?]?/gi, "")
    .replace(/[^.!?\n]*coffee before the (?:main )?sight[^.!?\n]*[.!?]?/gi, "")
    .replace(/[^.!?\n]*lahkoten sprehod v okolici (vaše )?namestitve[^.!?\n]*[.!?]?/gi, "")
    .replace(/[^.!?\n]*spoznavanje s prvim okoljem[^.!?\n]*[.!?]?/gi, "")
    .replace(/[^.!?\n]*uživajte v (avtentični|fine dining|prijetni|čudoviti)[^.!?\n]*[.!?]?/gi, "")
    .replace(/[^.!?\n]*kulturni in zgodovinski dragulj[^.!?\n]*[.!?]?/gi, "")
    .replace(/[^.!?\n]*raje 2 noči v [^.!?\n]*[.!?]?/gi, "")
    .replace(/[^.!?\n]*prefer 2 nights in [^.!?\n]*[.!?]?/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim(),
  );
}

/**
 * Planner rules ("don't do a day trip to X") must never appear in user-facing copy.
 */
export function stripPlannerMetaCopy(text: string): string {
  if (!text) return text;
  let out = text
    .replace(/[^.!?\n]*\bne\s+(?:delaj\s+)?(?:enodnevn[ei]\s+)?izlet(?:a)?[^.!?\n]*[.!?]?/gi, "")
    .replace(/[^.!?\n]*\bnot\s+a\s+day\s+trip\s+to[^.!?\n]*[.!?]?/gi, "")
    .replace(/[^.!?\n]*\bkein\s+tagesausflug[^.!?\n]*[.!?]?/gi, "")
    .replace(/[^.!?\n]*\bnon\s+un['’]?escursione\s+di\s+un\s+giorno[^.!?\n]*[.!?]?/gi, "")
    .replace(/[^.!?\n]*\bno\s+una\s+excursi[oó]n\s+de\s+un\s+d[ií]a[^.!?\n]*[.!?]?/gi, "")
    .replace(/[^.!?\n]*\bpas\s+d['’]excursion\s+d['’]une\s+journ[eé]e[^.!?\n]*[.!?]?/gi, "")
    .replace(/[^.!?\n]*tam že imaš večdnevno bivanje[^.!?\n]*[.!?]?/gi, "")
    .replace(/[^.!?\n]*you already stay there overnight[^.!?\n]*[.!?]?/gi, "")
    .replace(/[^.!?\n]*Prtljago vzemi s seboj[^.!?\n]*[.!?]?/gi, "")
    .replace(/[^.!?\n]*Take your bags[^.!?\n]*[.!?]?/gi, "")
    .replace(/[^.!?\n]*Na letališču si že od prejšnjega večera[^.!?\n]*[.!?]?/gi, "")
    .replace(/[^.!?\n]*already at the airport from the previous evening[^.!?\n]*[.!?]?/gi, "")
    .replace(/[^.!?\n]*brez ponovnega transferja[^.!?\n]*[.!?]?/gi, "")
    .replace(/[^.!?\n]*Zadnji dan nima večernega transferja[^.!?\n]*[.!?]?/gi, "")
    .replace(/[^.!?\n]*There is no evening airport transfer on this last day[^.!?\n]*[.!?]?/gi, "")
    .replace(/[^.!?\n]*ne zjutraj na dan leta[^.!?\n]*[.!?]?/gi, "")
    .replace(/[^.!?\n]*not on the morning of departure[^.!?\n]*[.!?]?/gi, "")
    .replace(/\bPREPOVEDANO:?\s*/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .trim();
  return out;
}

/** London transit cards leaked onto NYC (and other non-UK) days. */
export function sanitizeTransitCardLeak(text: string): string {
  if (!text) return text;
  const nyc =
    /new york|\bnyc\b|manhattan|brooklyn|harlem|times square|\bjfk\b|\bewr\b|\blga\b/i.test(
      text,
    );
  if (!nyc) return text;
  return text
    .replace(/\bOyster Cards?\b/gi, "OMNY / contactless")
    .replace(/\bTravelcards?\b/gi, "OMNY")
    .replace(/\bOyster\b/gi, "OMNY")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Neutralize crude Phra Nang / fertility-shrine wording from LLM copy. */
export function scrubInappropriatePoiCopy(text: string): string {
  if (!text) return text;
  return text
    .replace(/\bpenis\s+temple\b/gi, "Phra Nang Cave Beach")
    .replace(/\bpenis\s+shrine\b/gi, "seaside shrine")
    .replace(/\bphallic\s+(symbols?|carvings?|offerings?|shrine|rocks?)\b/gi, "shrine offerings")
    .replace(/\bfertility\s+shrine\b/gi, "seaside shrine")
    .replace(/\blingams?\b/gi, "shrine symbols")
    .replace(/\bpenises?\b/gi, "carved symbols")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Motorhome / Italy copy fixes:
 * - "Titova jama" (Broz) → Tiberijeva jama / Villa di Tiberio
 * - Centro Vacanze San Francesco only when day is San Daniele (camp is in Caorle)
 */
/** Never pin a concrete Bangkok hotel brand on the shared Kwai day-trip. */
export function stripConcreteBangkokHotelBrands(text: string): string {
  if (!text) return text;
  return text
    .replace(/\bTinidee\s+Trendy\s+Bangkok(?:\s+Khaosan)?\b/gi, "tvoj hotel")
    .replace(/\bTinidee\s+Trendy\b/gi, "tvoj hotel")
    .replace(/\bTinidee\b/gi, "tvoj hotel")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Gemini often cuts activity copy mid-sentence with "…" / "...".
 * Prefer the last complete sentence; otherwise drop dangling connectors.
 * "5." is an ordinal, not a sentence end ("znameniti 5. avenija").
 */
export function isOrdinalPeriod(text: string, periodIndex: number): boolean {
  if (text[periodIndex] !== ".") return false;
  return periodIndex > 0 && /\d/.test(text[periodIndex - 1]!);
}

export function lastSentenceEndIndex(text: string): number {
  for (let i = text.length - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === "!" || ch === "?") return i;
    if (ch === "." && !isOrdinalPeriod(text, i)) return i;
  }
  return -1;
}

/** Start index of the last real sentence (skips "5." ordinals). */
function lastClauseStart(text: string): number {
  for (let i = text.length - 2; i >= 1; i--) {
    const ch = text[i];
    if ((ch === "." || ch === "!" || ch === "?") && text[i + 1] === " ") {
      if (ch === "." && isOrdinalPeriod(text, i)) continue;
      return i + 2;
    }
  }
  return 0;
}

/** Leftover declined adjective / ordinal after a naive cut-at-period. */
export function looksLikeCutStemSentence(text: string): boolean {
  const t = text.trim();
  const last = t.slice(lastClauseStart(t));
  const words = last.replace(/[.!?…]+$/u, "").trim().split(/\s+/).filter(Boolean);
  const lastWord = words[words.length - 1] ?? "";
  // "Odhod 14:00." is a boarding-pass clock, not a cut ordinal ("znameniti 5.").
  if (/\d{1,2}:\d{2}\.?\s*$/.test(last)) return false;
  if (/\d+\.\s*$/.test(last) && words.length <= 6) return true;
  if (/\s+in\s+\S{3,14}\.\s*$/i.test(last) && words.length <= 6) return true;
  if (
    words.length <= 5 &&
    /(ega|imi|emu|ove|ovi|eva|išo|jšo|ožjo|ejšo|ajšo)$/i.test(lastWord)
  ) {
    return true;
  }
  // "Zlatni." — cut adjective leftover, not a finished place name.
  if (words.length <= 2 && /ni$/i.test(lastWord) && lastWord.length <= 8) {
    return true;
  }
  // "otok." / "Narodnemu parku." — leftover noun after a mid-title cut.
  // Do not flag a finished phrase like "Izlet na otok."
  if (words.length === 1 && /^(otok|parku|gradu|plaži|mostu|cerkvi)$/i.test(lastWord)) {
    return true;
  }
  if (
    words.length === 2 &&
    /^(otok|parku)$/i.test(lastWord) &&
    /(emu|ega|ove|ovi|ni)$/i.test(words[0] ?? "")
  ) {
    return true;
  }
  return false;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Never slice a title/sentence in the middle of a word. */
export function clipAtWordBoundary(text: string, maxChars: number): string {
  const t = text.trim();
  if (!t || maxChars <= 0 || t.length <= maxChars) return t;
  const slice = t.slice(0, maxChars);
  const sp = slice.lastIndexOf(" ");
  if (sp >= Math.floor(maxChars * 0.45)) {
    return slice.slice(0, sp).replace(/[,:;–—-]+$/u, "").trim();
  }
  const firstSpace = t.indexOf(" ");
  return firstSpace === -1 ? t : t.slice(0, firstSpace);
}

/**
 * If Gemini cut a headline ("Zlatni.", "Dioklecijanove") but the full name
 * still sits in the description, finish the title on a word boundary.
 */
export function expandHeadlineFromContext(title: string, hint = ""): string {
  const raw = title.trim();
  const stem = raw.replace(/[.!?…]+$/u, "").trim();
  if (stem.length < 3 || !hint.trim()) return raw;
  // Skip a leading copy of the title so we don't glue the day city onto a stub
  // ("Obisk trž" + "Obisk trž Chiang Mai" must stay truncated, not "Obisk trž Chiang").
  let body = hint.trim();
  try {
    const prefix = new RegExp(`^${escapeRegExp(stem)}[.!?…]*\\s*`, "iu");
    body = body.replace(prefix, "").trim();
  } catch {
    return raw;
  }
  if (!body) return raw;
  let extra = "";
  try {
    const re = new RegExp(
      `${escapeRegExp(stem)}((?:\\s+[^\\s.!?,;:]{1,40}){0,5})`,
      "iu",
    );
    extra = body.match(re)?.[1]?.trim() ?? "";
  } catch {
    return raw;
  }
  if (!extra) return raw;
  const extraWords: string[] = [];
  for (const w of extra.split(/\s+/).filter(Boolean)) {
    if (
      /^(ki|kjer|in|je|so|z|s|na|v|po|pri|do|za|ob|iz|se|si|da|ter|and|or|the|a|an|with|that|which)$/i.test(
        w,
      )
    ) {
      break;
    }
    extraWords.push(w);
    if (extraWords.length >= 4) break;
  }
  if (!extraWords.length) return raw;
  return `${stem} ${extraWords.join(" ")}`.replace(/\s+/g, " ").trim();
}

export function repairTruncatedCopy(text: string): string {
  if (!text) return text;
  const glued = text.replace(/\s*–\s*,\s*/g, " ").replace(/\n,\s*/g, " ");
  return glued
    .split("\n")
    .map((line) => repairTruncatedLine(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function repairTruncatedLine(line: string): string {
  let t = line.replace(/[^\S\n]+/g, " ").trim();
  if (!t) return "";
  t = t.replace(/^,\s+/, "").replace(/\s+[-–—]\s*$/u, "").trim();
  if (/^(preizkusite|try|probieren)\.?$/i.test(t)) return "";
  if (t.length <= 3 && !/\d/.test(t)) return "";

  const bareWords = t.replace(/[.!?…]+$/u, "").trim().split(/\s+/);
  const lastBare = bareWords[bareWords.length - 1] ?? "";
  const lastIsPlace = /^[A-ZÁÉÍÓÚÄÖÜČŠŽ]/.test(lastBare);
  if (
    bareWords.length <= 2 &&
    t.replace(/[.!?…]+$/u, "").length <= 28 &&
    /^(obiščite|obiscite|obisk|visit|besuche?n|odpravite|raziščite|raziscite)\b/i.test(t) &&
    !lastIsPlace
  ) {
    return "";
  }

  // Unclosed "(" — Gemini cut mid-terminal: "Puerto Juarez ali Embar"
  const lastOpen = t.lastIndexOf("(");
  const lastClose = t.lastIndexOf(")");
  // "Wat Plai Laem in Hin Ta Hin." — second POI cut to short Title-Case tokens.
  t = t.replace(
    /\s+\bin\s+(?:[A-ZÁÉÍÓÚČŠŽ][a-záéíóúäöüčšž]{1,4}\s+){1,2}[A-ZÁÉÍÓÚČŠŽ][a-záéíóúäöüčšž]{1,4}\.\s*$/u,
    ".",
  );

  if (lastOpen >= 0 && lastOpen > lastClose) {
    t = t.slice(0, lastOpen).trim().replace(/[–—,:;]+\s*$/u, "").trim();
    if (t && !/[.!?]$/.test(t) && t.split(/\s+/).length >= 5) t = `${t}.`;
  }

  // Finished sentence then a stub token: "...Yucatánu. Cen" / "...Holbox. Kopajte"
  t = t.replace(/\.\s+[A-ZÁÉÍÓÚÄÖÜČŠŽ][A-Za-zÁÉÍÓÚÄÖÜáéíóúäöüčšž]{1,10}\s*$/u, ".");

  const danglingPrep =
    /\s+\b(v|na|po|pri|do|za|ob|iz|proti|čez|skozi|at|to|in)\.+\s*$/iu.test(t) ||
    /\s+\b(v|na|po|pri|do|za|ob|iz|proti|čez|skozi)\s*$/iu.test(t);

  if (danglingPrep) {
    const clause = t.search(/,?\s+(kjer|where|wo)\b/i);
    if (clause >= 20) {
      const head = t.slice(0, clause).replace(/[,\s]+$/u, "").trim();
      return head ? (/[.!?]$/.test(head) ? head : `${head}.`) : "";
    }
    t = t.replace(/\s+\b(v|na|po|pri|do|za|ob|iz|proti|čez|skozi|at|to|in)\.+\s*$/iu, "").trim();
    t = t.replace(/\s+\b(v|na|po|pri|do|za|ob|iz|proti|čez|skozi)\s*$/iu, "").trim();
    if (!t) return "";
    return /[.!?]$/.test(t) ? t : `${t}.`;
  }

  const danglingEnd =
    /\b(zu|to|the|of|a|an|die|der|das|den|dem|und|and|mit|with|für|for|besonders|optional|höchstens|maritime|ein|eine|einen|einer|eines|primerno)\.\s*$/i.test(
      t,
    ) ||
    /,\s*(das|die|der|den|dem|the|a|an|zu|to|ein|eine|primerno)\.\s*$/i.test(t) ||
    /\b(in|ali|ter|and|or)\s+(si\s+)?[A-Za-zÁÉÍÓÚÄÖÜáéíóúäöüčšž]{2,16}\.\s*$/i.test(t);

  const lastWord = t.split(/\s+/).pop() ?? "";
  const lastWordBare = lastWord.replace(/[.…!?]+$/u, "").toLowerCase();
  const completeShortWord = new Set([
    "let",
    "dan",
    "dni",
    "noč",
    "noc",
    "ura",
    "uri",
    "ure",
    "ur",
    "km",
    "flight",
    "flug",
    "volo",
    "vuelo",
    "vol",
    "hotel",
    "park",
    "transfer",
  ]).has(lastWordBare);
  const noStop = !/[.!?…]$/u.test(t);
  const danglingVerb =
    noStop &&
    /\b(traja|lasts|dauert|vključuje|includes|umfasst|preizkusite|probieren|pripravijo)\s*$/i.test(
      t,
    ) &&
    t.length > 12;
  // "ulicah Hol" — 2–3 letter Title-Case stubs, not real 4-letter places (Krka, Brač).
  const shortCapStub =
    noStop &&
    /^[A-ZÁÉÍÓÚÄÖÜČŠŽ][a-záéíóúäöüčšž]{1,2}$/u.test(lastWord) &&
    t.length > lastWord.length + 12;
  // "pripravijo va" / "zadnjem raz" — Gemini cut a lowercase stem.
  const shortLowerStub =
    noStop &&
    !completeShortWord &&
    lastWord.length <= 3 &&
    /^[a-záéíóúäöüčšž]+$/u.test(lastWord) &&
    t.length > lastWord.length + 16;

  const danglingAdjStop =
    /\s+v\s+(čudovit\w*|prelep\w*|elegantn\w*|beautiful|wonderful|wunderschön\w*)\.\s*$/iu.test(
      t,
    );
  // "Po vrnitvi v let" / "in prefinjenem ambient" — Gemini cut the noun.
  const cutReturnFlight = /\bpo vrnitvi v let\.?\s*$/iu.test(t);
  const cutAdjNoun =
    /\s+in\s+\w{4,14}(?:em|im)\s+[a-záéíóúäöüčšž]{4,10}\.?\s*$/iu.test(t);
  const hasEllipsis = /…|\.\.\./.test(t);
  const cutMidWord =
    noStop &&
    !completeShortWord &&
    lastWord.length >= 4 &&
    lastWord.length <= 8 &&
    /^[a-záéíóúäöüčšž]+$/u.test(lastWord) &&
    t.length > lastWord.length + 20;
  const truncated =
    hasEllipsis ||
    /…\s*$/u.test(t) ||
    /\.\.\.\s*$/.test(t) ||
    shortCapStub ||
    shortLowerStub ||
    danglingVerb ||
    danglingAdjStop ||
    cutReturnFlight ||
    cutAdjNoun ||
    cutMidWord;

  if (looksLikeCutStemSentence(t)) {
    const start = lastClauseStart(t);
    if (start > 12) {
      const head = t.slice(0, start).trim();
      return /[.!?]$/.test(head) ? head : `${head}.`;
    }
    const stripped = t.replace(/\s+\S+\.?\s*$/u, "").replace(/[,\s]+$/u, "").trim();
    if (!stripped || stripped.split(/\s+/).length < 4) return "";
    if (looksLikeCutStemSentence(`${stripped}.`)) return "";
    return /[.!?]$/.test(stripped) ? stripped : `${stripped}.`;
  }

  if (!truncated && !danglingEnd) return t;

  t = t.replace(/\s*…\s*$/u, "").replace(/\s*\.\.\.\s*$/, "").trim();
  if (hasEllipsis) {
    const idx = t.search(/…|\.\.\./);
    if (idx >= 20) {
      const head = t.slice(0, idx).trim().replace(/[,:;–—-]+\s*$/u, "").trim();
      return head ? (/[.!?]$/.test(head) ? head : `${head}.`) : "";
    }
    t = t.replace(/…|\.\.\./g, " ").replace(/\s+/g, " ").trim();
  }
  if (danglingEnd) {
    let lastGood = -1;
    for (let i = t.length - 2; i >= 1; i--) {
      if ((t[i] === "." || t[i] === "!" || t[i] === "?") && t[i + 1] === " ") {
        if (t[i] === "." && isOrdinalPeriod(t, i)) continue;
        lastGood = i;
        break;
      }
    }
    if (lastGood >= 20) {
      const head = t.slice(0, lastGood + 1).trim();
      if (!looksLikeCutStemSentence(head)) return head;
    }
    let next = t
      .replace(/\s+\b(?:die|der|das|den|dem|the|a|an)\s+(?:maritime|besonders)\.\s*$/iu, ".")
      .replace(/\s+\b(?:maritime|besonders|optional|höchstens|primerno)\.\s*$/iu, ".")
      .replace(/\s+\bau?sklingen\s+zu\.\s*$/iu, ".")
      .replace(/,\s*(?:das|die|der|den|dem|the|a|an|ein|eine|primerno)(?:\s+\w+)?\.\s*$/iu, ".")
      .replace(/\s+\b(?:in|ali|ter|and|or)\s+(?:si\s+)?[A-Za-zÁÉÍÓÚÄÖÜáéíóúäöüčšž]{2,16}\.\s*$/iu, ".")
      .replace(/\s+\b(?:zu|to|und|and|mit|with|für|for|die|der|das|the)\.\s*$/iu, ".")
      .replace(/,\s*\.\s*$/u, ".")
      .trim();
    if (next.length < 20 || /\b(?:die|der|das|the|zu|to|ein|eine)\.\s*$/i.test(next)) {
      return "";
    }
    next = next.replace(/[,\s]+$/u, "").trim();
    return /[.!?]$/.test(next) ? next : `${next}.`;
  }

  if (cutReturnFlight) {
    t = t.replace(/\s*\bpo vrnitvi v let\.?\s*$/iu, "").trim();
    if (!t) return "";
    return /[.!?]$/.test(t) ? t : `${t}.`;
  }
  if (cutAdjNoun) {
    t = t.replace(/\s+in\s+\w{4,14}(?:em|im)\s+[a-záéíóúäöüčšž]{4,10}\.?\s*$/iu, "").trim();
    if (!t) return "";
    return /[.!?]$/.test(t) ? t : `${t}.`;
  }
  if (danglingAdjStop) {
    t = t.replace(/\s+v\s+(čudovit\w*|prelep\w*|elegantn\w*|beautiful|wonderful|wunderschön\w*)\.\s*$/iu, ".").trim();
  } else if (shortCapStub || shortLowerStub || cutMidWord) {
    t = t.slice(0, t.length - lastWord.length).trim();
    t = t.replace(/\s+\b(ali|or|and|in|ter|za|to)\s*$/i, "").trim();
    t = t.replace(/,\s+(ki|that|die|der|who)\s+\S{1,16}\s*$/iu, ".").trim();
    t = t.replace(/\s+(in|and|ter|und)\s+(zadnjem|last|letzten)\s*$/iu, ".").trim();
  } else {
    t = t
      .replace(
        /\s+(in|and|ter|or|ali|za|to|with|z|s|the|a|an|po|na|ob|morda|maybe|perhaps)\s*$/i,
        "",
      )
      .trim();
    t = t.replace(/,\s+(ki|that|die|der|who)\s+\S{1,16}\s*$/iu, ".").trim();
  }
  t = t.replace(/,\s*$/, "").trim();

  const last = lastSentenceEndIndex(t);
  if (last >= 24) {
    const head = t.slice(0, last + 1).trim();
    if (!looksLikeCutStemSentence(head)) return head;
  }
  if (!t) return "";
  if (shortCapStub && t.split(/\s+/).length < 6) return t ? `${t.replace(/[,:;]+$/, "")}.` : "";
  if (t && !/[.!?]$/.test(t) && t.split(/\s+/).length >= 6) {
    const next = `${t}.`;
    return looksLikeCutStemSentence(next) ? t : next;
  }
  return t;
}

/** Finish Gemini-cut departure titles: "… / mednarodni." → "… / mednarodni let". */
export function completeTruncatedHeadline(text: string, hint = ""): string {
  if (!text) return text;
  let t = text
    .replace(/\/\s*mednarodni\.+$/i, "/ mednarodni let")
    .replace(/\/\s*international\.+$/i, "/ international flight")
    .replace(/\/\s*internationaler\.+$/i, "/ internationaler Flug");
  const blob = `${t}\n${hint}`;
  if (/\bTop of\.?$/i.test(t) && /Rockefeller|Top of the Rock/i.test(blob)) {
    t = t.replace(/\bTop of\.?$/i, "Top of the Rock");
  }
  if (/\bWalk of\.?$/i.test(t) && /Hollywood/i.test(blob)) {
    t = t.replace(/\bWalk of\.?$/i, "Walk of Fame");
  }
  if (/\bCanal\.?$/i.test(t) && /Canal Walk|Indianapolis/i.test(blob)) {
    t = t.replace(/\bCanal\.?$/i, "Canal Walk");
  }
  const expanded = expandHeadlineFromContext(t, hint);
  return expanded || t;
}

/** Finish "v Labuan." when the day city is Labuan Bajo — do not invent a new place. */
export function completeTruncatedPlaceName(text: string, place: string): string {
  if (!text || !place) return text;
  const ended = /[.!?]\s*$/.test(text);
  const body = text.replace(/[.!?\s]+$/u, "");
  const placeTrim = place.trim();
  const placeLc = placeTrim.toLowerCase();
  const words = body.split(/\s+/);
  for (let n = Math.min(3, words.length); n >= 1; n--) {
    const chunk = words.slice(-n).join(" ");
    if (chunk.length < 2) continue;
    const chunkLc = chunk.toLowerCase();
    if (!placeLc.startsWith(chunkLc) || placeTrim.length <= chunk.length) continue;
    const head = words.slice(0, -n).join(" ").trim();
    const next = `${head} ${placeTrim}`.replace(/\s+/g, " ").trim();
    return ended ? `${next}.` : next;
  }
  return text;
}

function isSlotStub(raw: string): boolean {
  const t = raw.trim();
  return t.length > 0 && t.length <= 3 && !/\d/.test(t);
}

const PLACEHOLDER_WHOLE =
  /^(TODO|TBD|N\/A|n\/a|xxx+|placeholder|coming soon|tba|lorem ipsum)\b/i;
const PLACEHOLDER_BRACKET = /\[(?:TODO|TBD|PLACEHOLDER|INSERT|XXX)[^\]]*\]/i;

/** True when copy is a stub, still has '...', or is an obvious placeholder. */
export function isPlaceholderOrTruncatedCopy(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/…|\.{3}/.test(t)) return true;
  if (PLACEHOLDER_WHOLE.test(t) || PLACEHOLDER_BRACKET.test(t)) return true;
  return false;
}

/** Structured slot is renderable only with a real body — title-only stubs are omitted. */
export function activityHasRenderableBody(opts: {
  description?: string | null;
  bullets?: string[] | null;
}): boolean {
  const desc = (opts.description ?? "").trim();
  if (desc && !isPlaceholderOrTruncatedCopy(desc) && !isDaypartSlotLabel(desc)) return true;
  return (opts.bullets ?? []).some(
    (b) =>
      typeof b === "string" &&
      b.trim().length > 0 &&
      !isPlaceholderOrTruncatedCopy(b) &&
      !isDaypartSlotLabel(b),
  );
}

const DAYPART_SLOT_LABEL =
  /^(dopoldan|popoldan|večer|vecer|morning|afternoon|evening|mattina|pomeriggio|sera|morgen|nachmittag|abend|matin|après-midi|apres-midi|soir|mañana|tarde|noche|nuit)$/i;

/** Slot pill labels — never use as activity title/description fallbacks ("Večer: Večer"). */
export function isDaypartSlotLabel(raw: string | undefined | null): boolean {
  if (!raw?.trim()) return false;
  const t = raw.trim();
  if (DAYPART_SLOT_LABEL.test(t)) return true;
  const parts = t.split(/\s*[:|/]\s*/);
  return (
    parts.length === 2 &&
    DAYPART_SLOT_LABEL.test(parts[0]!.trim()) &&
    DAYPART_SLOT_LABEL.test(parts[1]!.trim())
  );
}

/**
 * Drop "Večer" / "Evening: Evening" titles. If the slot has a real description,
 * use its first sentence so the card/PDF is not titled with a day-part pill.
 */
export function sanitizeActivityTitle(title: string, description?: string): string {
  const t = title.trim();
  const desc = (description ?? "").trim();
  if (t && !isDaypartSlotLabel(t) && !isPlaceholderOrTruncatedCopy(t)) {
    const done = completeTruncatedHeadline(t, desc);
    return done.trim() || t;
  }
  if (!desc || isDaypartSlotLabel(desc) || isPlaceholderOrTruncatedCopy(desc)) return "";
  const first = desc.split(/[.!?]/)[0]?.trim() ?? "";
  if (first.length >= 8 && !isDaypartSlotLabel(first) && !isPlaceholderOrTruncatedCopy(first)) {
    return clipAtWordBoundary(completeTruncatedHeadline(first, desc), 90);
  }
  return "";
}

/** Ellipsis was removed but no missing words were filled in — still an unfinished title. */
function ellipsisWasOnlyStripped(original: string, repaired: string): boolean {
  if (!/…|\.{3}/.test(original)) return false;
  const norm = (s: string) =>
    s
      .replace(/…|\.{3}/g, "")
      .replace(/[.!?\s]+$/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  return Boolean(norm(original)) && norm(original) === norm(repaired);
}

/** Guest-facing plan copy: language sanitizers (SL dual, seafood, LaTeX dates, …). */
export function sanitizePlanGuestCopy(
  plan: {
    summary?: string;
    days?: Array<{
      title?: string;
      morning?: string;
      afternoon?: string;
      evening?: string;
      travelHack?: string;
      transportationTips?: string;
      localWarnings?: string;
      localTips?: string;
      activities?: {
        morning?: Array<{
          name?: string;
          description?: string;
          bullets?: string[];
          priceLabel?: string;
        }>;
        afternoon?: Array<{
          name?: string;
          description?: string;
          bullets?: string[];
          priceLabel?: string;
        }>;
        evening?: Array<{
          name?: string;
          description?: string;
          bullets?: string[];
          priceLabel?: string;
        }>;
      };
      mapPins?: Array<{ name?: string; description?: string }>;
    }>;
    returnFlightEu?: { summary?: string };
  },
  langCode: string,
): void {
  const run = (raw: string | undefined): string =>
    raw ? sanitizeForLang(raw, langCode) : "";
  if (plan.summary) plan.summary = run(plan.summary);
  if (plan.returnFlightEu?.summary) {
    plan.returnFlightEu.summary = run(plan.returnFlightEu.summary);
  }
  for (const day of plan.days ?? []) {
    for (const key of [
      "title",
      "morning",
      "afternoon",
      "evening",
      "travelHack",
      "transportationTips",
      "localWarnings",
      "localTips",
    ] as const) {
      const cur = day[key];
      if (cur) day[key] = run(cur);
    }
    if (day.activities) {
      for (const slot of ["morning", "afternoon", "evening"] as const) {
        for (const a of day.activities[slot] ?? []) {
          if (a.name) a.name = run(a.name);
          if (a.description) a.description = run(a.description);
          if (a.priceLabel) a.priceLabel = run(a.priceLabel);
          if (a.bullets?.length) a.bullets = a.bullets.map((b) => run(b));
        }
      }
    }
    for (const pin of day.mapPins ?? []) {
      if (pin.name) pin.name = run(pin.name);
      if (pin.description) pin.description = run(pin.description);
    }
  }
}

/** Apply truncation repair across day/activity copy (all trip modes). */
export function stripTruncatedCopyFromPlan(plan: {
  days?: Array<{
    morning?: string;
    afternoon?: string;
    evening?: string;
    travelHack?: string;
    transportationTips?: string;
    localWarnings?: string;
    localTips?: string;
    title?: string;
    city?: string;
    focusName?: string;
    activities?: {
      morning?: Array<{ name?: string; description?: string; bullets?: string[] }>;
      afternoon?: Array<{ name?: string; description?: string; bullets?: string[] }>;
      evening?: Array<{ name?: string; description?: string; bullets?: string[] }>;
    };
    mapPins?: Array<{ name?: string; description?: string }>;
  }>;
}): number {
  let fixed = 0;
  const fixStr = (
    raw: string | undefined,
    assign: (v: string) => void,
    hint?: string,
    city?: string,
  ) => {
    if (typeof raw !== "string" || !raw) return;
    let next = isSlotStub(raw) ? "" : completeTruncatedHeadline(raw, hint ?? "");
    if (city && next) next = completeTruncatedPlaceName(next, city);
    if (next) next = repairTruncatedCopy(next);
    if (next !== raw) {
      assign(next);
      fixed += 1;
    }
  };

  for (const day of plan.days ?? []) {
    const place = (day.city || day.focusName || "").trim();
    const titleHint = [place, day.morning, day.afternoon, day.evening]
      .filter(Boolean)
      .join(" ");
    const titleBefore = day.title;
    for (const key of [
      "title",
      "morning",
      "afternoon",
      "evening",
      "travelHack",
      "transportationTips",
      "localWarnings",
      "localTips",
    ] as const) {
      fixStr(
        day[key],
        (v) => {
          day[key] = v;
        },
        key === "title" ? titleHint : undefined,
        key === "title" ? place : undefined,
      );
    }
    if (titleBefore?.trim() && !(day.title ?? "").trim() && place) {
      day.title = place;
      fixed += 1;
    }
    if (day.activities) {
      for (const slot of ["morning", "afternoon", "evening"] as const) {
        for (const a of day.activities[slot] ?? []) {
          if (a.name && a.name.trim().length <= 2) {
            a.name = "";
            fixed += 1;
          } else if (a.name) {
            const originalName = a.name;
            let named = completeTruncatedHeadline(
              a.name,
              `${a.description ?? ""} ${place}`,
            );
            if (place) named = completeTruncatedPlaceName(named, place);
            named = repairTruncatedCopy(named);
            if (
              isPlaceholderOrTruncatedCopy(named) ||
              ellipsisWasOnlyStripped(originalName, named)
            ) {
              named = "";
            }
            if (named !== a.name) {
              a.name = named;
              fixed += 1;
            }
          }
          fixStr(a.description, (v) => {
            a.description = v;
          });
          if (a.description && isPlaceholderOrTruncatedCopy(a.description)) {
            a.description = "";
            fixed += 1;
          }
          if (a.bullets?.length) {
            a.bullets = a.bullets.map((b) => {
              const next = repairTruncatedCopy(b);
              if (next !== b) fixed += 1;
              return next;
            });
          }
        }
        const kept = (day.activities[slot] ?? []).filter((a) => (a.name ?? "").trim());
        if (kept.length !== (day.activities[slot] ?? []).length) {
          day.activities[slot] = kept;
          fixed += 1;
        }
      }
    }
    for (const pin of day.mapPins ?? []) {
      fixStr(pin.description, (v) => {
        pin.description = v;
      });
      fixStr(pin.name, (v) => {
        pin.name = v;
      });
    }
  }
  return fixed;
}

export function fixMotorhomeCopyErrors(text: string, city = ""): string {
  if (!text) return text;
  let out = text
    .replace(/\bTitov[ae]\s+jam[aeo]\b/gi, "Tiberijeva jama (Villa di Tiberio)")
    .replace(/\bTitovo\s+jamo\b/gi, "Tiberijevo jamo (Villa di Tiberio)")
    .replace(/\bTito'?s?\s+Cave\b/gi, "Villa di Tiberio (Tiberius Grotto)")
    .replace(/\bTito\s+Grotto\b/gi, "Villa di Tiberio")
    // Hotel language is wrong on RV trips — rewrite to camp/stay.
    .replace(/okolico\s+hotela/gi, "okolico kampa")
    .replace(/blizu\s+hotela/gi, "blizu kampa")
    .replace(/pri\s+hotelu/gi, "pri kampu")
    .replace(/v\s+hotelu/gi, "v kampu")
    .replace(/izpred\s+hotela/gi, "iz kampa")
    .replace(/\btvoj(?:ega)?\s+hotel[au]?\b/gi, "tvoj kamp")
    .replace(/\bnear\s+the\s+hotel\b/gi, "near the campsite")
    .replace(/\bexplore\s+near\s+the\s+hotel\b/gi, "explore near the campsite")
    .replace(/\byour\s+hotel\b/gi, "your campsite")
    .replace(/\bthe\s+hotel\b/gi, "the campsite")
    .replace(/\bback\s+to\s+(?:the\s+)?hotel\b/gi, "back to camp");

  const c = city.toLowerCase();
  const nearSanDaniele =
    /san\s*daniele/.test(c) || /san\s*daniele/.test(out.toLowerCase());
  if (nearSanDaniele) {
    out = out
      .replace(
        /\b(?:Kamp\s+)?Centro\s+Vacanze\s+San\s+Francesco\b/gi,
        "Area sosta camper San Daniele del Friuli",
      )
      .replace(
        /\bCamping\s+(?:Village\s+)?San\s+Francesco\b/gi,
        "Area sosta camper San Daniele del Friuli",
      );
  }

  return repairTruncatedCopy(out.replace(/\s{2,}/g, " ").trim());
}

/** Strip repeated long arrival-offset labels from activity/day copy. */
export function stripArrivalLabelSpam(text: string): string {
  if (!text) return text;
  return text
    .replace(
      /\s*\(\+\d+\s*(?:dan|dni|day|days)(?:\s+od odhoda|\s+from departure)?(?:,?\s*lokalni čas(?:\s+na destinaciji)?|,?\s*local time(?:\s+at destination)?)?\)/gi,
      "",
    )
    .replace(/\s*\(\+\d+d(?:,?\s*lokalni čas|,?\s*local)?\)/gi, "")
    // Per-line collapse — never flatten activity bullet newlines into one paragraph.
    .split("\n")
    .map((line) => line.replace(/[^\S\n]{2,}/g, " ").replace(/[^\S\n]+([,.])/g, "$1").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const BOILERPLATE_SENTENCE_RE =
  /(?:če imaš še energijo|if you (?:still )?have (?:the )?energy|z grabom|grab nazaj|s tuk-?tukom|tuk-?tukom nazaj|grab or tuk-?tuk|with (?:a )?tuk-?tuk)/i;

function sentenceKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9čšžćđäöüáéíóú\s]/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/** Core place tokens for same-day activity dedupe (Gastown lunch ≈ Gastown explore). */
export function sameDayActivityCoreKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]s\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(
      /\b(morning|afternoon|evening|lunch|dinner|brunch|breakfast|kosilo|večerja|zajtrk|explore|wander|visit|tour|walk|stroll|historic|streets?|street|neighbourhood|neighborhood|sosesk\w*|and|the|in|of|a|an|near|around|day)\b/g,
      " ",
    )
    .replace(/\b\w\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type DayAct = { name?: string; description?: string };

/** Drop near-duplicate sights within a single day (same core place, different fluff title). */
export function dedupeSameDayActivities(plan: {
  days: Array<{
    activities?: {
      morning?: DayAct[];
      afternoon?: DayAct[];
      evening?: DayAct[];
    };
  }>;
}): void {
  for (const day of plan.days) {
    if (!day.activities) continue;
    const seen = new Set<string>();
    for (const slot of ["morning", "afternoon", "evening"] as const) {
      const list = day.activities[slot];
      if (!list?.length) continue;
      day.activities[slot] = list.filter((act) => {
        const key = sameDayActivityCoreKey(act.name ?? "");
        if (!key || key.length < 4) return true;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }) as typeof list;
    }
  }
}

/**
 * Drop repeated Grab/tuk-tuk / “če imaš še energijo” sentences after the first 2 occurrences
 * across the whole plan.
 */
export function dedupeCrossDayBoilerplate(plan: {
  days: Array<{
    transportationTips?: string;
    travelHack?: string;
    localTips?: string;
    activities?: {
      morning?: Array<{ description?: string; bullets?: string[] }>;
      afternoon?: Array<{ description?: string; bullets?: string[] }>;
      evening?: Array<{ description?: string; bullets?: string[] }>;
    };
  }>;
}): void {
  const seen = new Map<string, number>();

  const scrubLine = (text: string): string => {
    const parts = text.split(/(?<=[.!?…])\s+/);
    const kept: string[] = [];
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      if (!BOILERPLATE_SENTENCE_RE.test(trimmed)) {
        kept.push(trimmed);
        continue;
      }
      const key = sentenceKey(trimmed);
      const count = seen.get(key) ?? 0;
      if (count < 2) {
        seen.set(key, count + 1);
        kept.push(trimmed);
      }
    }
    return kept.join(" ").replace(/[^\S\n]{2,}/g, " ").trim();
  };

  /** Scrub Grab/tuk-tuk spam without collapsing bullet newlines into one paragraph. */
  const scrub = (text: string | undefined): string | undefined => {
    if (!text?.trim()) return text;
    if (!text.includes("\n")) return scrubLine(text);
    return text
      .split("\n")
      .map((line) => scrubLine(line))
      .filter((line, i, arr) => line.length > 0 || (i > 0 && i < arr.length - 1))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };

  for (const day of plan.days) {
    if (day.transportationTips) day.transportationTips = scrub(day.transportationTips) ?? "";
    if (day.travelHack) day.travelHack = scrub(day.travelHack) ?? "";
    if (day.localTips) day.localTips = scrub(day.localTips) ?? "";
    if (!day.activities) continue;
    for (const slot of ["morning", "afternoon", "evening"] as const) {
      for (const act of day.activities[slot] ?? []) {
        if (Array.isArray(act.bullets) && act.bullets.length > 0) {
          // bullets[] is source of truth — never let sentence-join flatten them.
          act.description = formatActivityDescription(
            act.bullets.map((b) => scrubLine(b)).filter(Boolean),
          );
          continue;
        }
        if (act.description) {
          act.description = stripArrivalLabelSpam(scrub(act.description) ?? act.description);
        }
      }
    }
  }
}

export function sanitizeDestinationText(text: string, country?: string): string {
  let out = text;
  out = out.replace(/maid of the mist/gi, "Hornblower Niagara City Cruises");
  out = out.replace(/cave of the winds/gi, "Journey Behind the Falls");
  if (country && !SEA_GRAB_COUNTRIES.has(country)) {
    out = out
      .replace(/\bz Grabom\b/gi, "z Uberjem")
      .replace(/\bGrab nazaj\b/gi, "Uber nazaj")
      .replace(/\bGrab do\b/gi, "Uber do")
      .replace(/\bGrab\b/g, "Uber");
  }
  return out;
}

export function sanitizeForLang(text: string, langCode: string, country?: string): string {
  if (!text) return text;
  let out = scrubInappropriatePoiCopy(
    sanitizeLegacyTemplateLeak(sanitizeDestinationText(text, country)),
  );
  // Do NOT run fixMotorhomeCopyErrors here — it rewrites "hotel" → "campsite" and
  // poisoned normal hotel trips (Paris/Lyon PDFs). Motorhome paths call it explicitly.
  out = stripConcreteBangkokHotelBrands(out);
  out = stripPlannerMetaCopy(out);
  out = stripMarkdownTablePipes(out);
  out = localizeTravelCopy(out, langCode);
  if (langCode === "sl" || langCode.startsWith("sl")) {
    out = sanitizeSlText(out);
  }
  return out;
}

/** Hotel trips: undo LLM / legacy "campsite" lodging wording. */
export function fixHotelCopyErrors(text: string): string {
  if (!text) return text;
  return text
    .replace(/\bnear\s+the\s+campsite\b/gi, "near the hotel")
    .replace(/\bexplore\s+near\s+the\s+campsite\b/gi, "explore near the hotel")
    .replace(/\byour\s+campsite\b/gi, "your hotel")
    .replace(/\bthe\s+campsite\b/gi, "the hotel")
    .replace(/\bback\s+to\s+(?:the\s+)?(?:campsite|camp)\b/gi, "back to the hotel")
    .replace(/\bCheck-?in at (?:the )?campsite\b/gi, "Hotel check-in")
    .replace(/\bprihod na kamp\b/gi, "Prihod v hotel")
    .replace(/\bv kampu\b/gi, "v hotelu")
    .replace(/\bpri kampu\b/gi, "pri hotelu")
    .replace(/\bblizu kampa\b/gi, "blizu hotela")
    .replace(/\bokolico kampa\b/gi, "okolico hotela")
    .replace(/\btvoj(?:ega)?\s+kamp[au]?\b/gi, "tvoj hotel")
    .replace(/\s{2,}/g, " ")
    .trim();
}

type ActivityLike = {
  name: string;
  description: string;
  bullets?: string[];
  priceLabel?: string;
  price?: string;
  type?: string;
};

export function sanitizeActivity<T extends ActivityLike>(
  act: T,
  langCode: string,
  country?: string,
  _city?: string,
): T {
  const run = (s: string) => sanitizeForLang(s, langCode, country);
  const bullets = normalizeActivityBullets({
    description: act.description,
    bullets: act.bullets,
  }).map(run);
  return {
    ...act,
    name: run(act.name),
    description: formatActivityDescription(bullets) || run(act.description ?? ""),
    bullets: bullets.length > 0 ? bullets : undefined,
    priceLabel: act.priceLabel ? run(act.priceLabel) : act.priceLabel,
  };
}

/** Fix template leaks — e.g. Phuket Town copy-pasted while the day is in Krabi/Koh Lipe. */
export function rewriteActivityCityLeak(text: string, city: string): string {
  if (!text || !city) return text;
  const c = city.toLowerCase();
  let out = text;
  const mentionsPhuket =
    /phuket\s*town|nočni trg v phuket|phuket town night market/i.test(out) ||
    (/phuket/i.test(out) && !c.includes("phuket"));

  if (mentionsPhuket) {
    if (c.includes("krabi") || c.includes("ao nang") || c.includes("railay")) {
      out = out
        .replace(/phuket\s*town/gi, "Ao Nang")
        .replace(/nočni trg v phuket/gi, "večerja v Ao Nang")
        .replace(/phuket town night market/gi, "Ao Nang promenade");
    } else if (c.includes("lipe")) {
      out = out
        .replace(/phuket\s*town/gi, "Walking Street na Koh Lipeju")
        .replace(/nočni trg v phuket/gi, "Walking Street na Koh Lipeju")
        .replace(
          /večerja z morskimi sadeži ali nočni trg v phuket town/gi,
          "Večerja na Walking Street — morski sadeži in ulična hrana na Koh Lipeju",
        )
        .replace(
          /seafood dinner or phuket town night market/gi,
          "Walking Street seafood dinner on Koh Lipe",
        )
        .replace(
          /večerja z morskimi sadeži ali nočni trg v phuket/gi,
          "Večerja na Walking Street — morski sadeži in ulična hrana na Koh Lipeju",
        )
        .replace(/morski sadeži ali nočni trg v phuket/gi, "morski sadeži na Walking Street");
    } else if (c.includes("manila") || c.includes("makati") || c.includes("pasay")) {
      out = out
        .replace(/phuket\s*town/gi, "Binondo")
        .replace(/nočni trg v phuket/gi, "nočni trg v Binondu")
        .replace(
          /večerja z morskimi sadeži ali nočni trg v phuket town/gi,
          "Večerja z morskimi sadeži ali ulična hrana v Binondu / Roxas Boulevard",
        )
        .replace(
          /seafood dinner or phuket town night market/gi,
          "Seafood dinner or Binondo night market in Manila",
        )
        .replace(
          /večerja z morskimi sadeži ali nočni trg v phuket/gi,
          "Večerja z morskimi sadeži ali ulična hrana v Binondu",
        );
    } else if (c.includes("boracay")) {
      out = out
        .replace(/phuket\s*town/gi, "D'Mall / White Beach")
        .replace(/nočni trg v phuket/gi, "D'Talipapa tržnica")
        .replace(
          /večerja z morskimi sadeži ali nočni trg v phuket town/gi,
          "Večerja z morskimi sadeži ob White Beach ali D'Talipapa",
        );
    } else if (c.includes("el nido") || c.includes("palawan")) {
      out = out
        .replace(/phuket\s*town/gi, "El Nido Town")
        .replace(/nočni trg v phuket/gi, "nočni trg v El Nido Town")
        .replace(
          /večerja z morskimi sadeži ali nočni trg v phuket town/gi,
          "Večerja z morskimi sadeži v El Nido Town",
        );
    } else {
      out = out
        .replace(/phuket\s*town/gi, city)
        .replace(/nočni trg v phuket/gi, `nočni trg v ${city}`)
        .replace(
          /večerja z morskimi sadeži ali nočni trg v phuket town/gi,
          `Večerja z morskimi sadeži ali lokalni večerni trg v ${city}`,
        )
        .replace(
          /seafood dinner or phuket town night market/gi,
          `Seafood dinner or local night market in ${city}`,
        );
    }
  }
  return out;
}

/** Strip Vietnam food copy on non-VN trips (e.g. pho on Boracay). */
export function rewriteCountryFoodLeak(text: string, country?: string): string {
  if (!text || country === "VN") return text;
  let out = text;
  if (country === "PH") {
    out = out
      .replace(/pho ali banh mi/gi, "tapsilog ali sinangag")
      .replace(/pho, banh mi/gi, "tapsilog, sinangag")
      .replace(/\bpho\b/gi, "tapsilog")
      .replace(/\bbanh mi\b/gi, "sinangag")
      .replace(/vietnamsk/i, "filipinsk");
  }
  return out;
}

function rewriteActivityFields<T extends ActivityLike>(act: T, city: string): T {
  return {
    ...act,
    name: rewriteActivityCityLeak(act.name, city),
    description: rewriteActivityCityLeak(act.description, city),
    priceLabel: act.priceLabel
      ? rewriteActivityCityLeak(act.priceLabel, city)
      : act.priceLabel,
    price: act.price ? rewriteActivityCityLeak(act.price, city) : act.price,
  };
}

export function mentionsForeignCity(text: string, city: string): boolean {
  const c = city.toLowerCase();
  const t = text.toLowerCase();
  if (/phuket/i.test(t) && !c.includes("phuket")) return true;
  if (/bangkok/i.test(t) && !c.includes("bangkok")) return true;
  return false;
}

export function sanitizeDaySlots<T extends { morning: ActivityLike[]; afternoon: ActivityLike[]; evening: ActivityLike[] }>(
  slots: T,
  langCode: string,
  country?: string,
  city?: string,
): T {
  const clean = (list: ActivityLike[]) =>
    list.map((a) => {
      let base = sanitizeActivity(a, langCode, country);
      if (country) {
        base = {
          ...base,
          name: rewriteCountryFoodLeak(base.name, country),
          description: rewriteCountryFoodLeak(base.description, country),
          priceLabel: base.priceLabel
            ? rewriteCountryFoodLeak(base.priceLabel, country)
            : base.priceLabel,
        };
      }
      if (!city) return base;
      return rewriteActivityFields(base, city);
    });
  return {
    ...slots,
    morning: clean(slots.morning),
    afternoon: clean(slots.afternoon),
    evening: clean(slots.evening),
  };
}
