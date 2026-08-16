import { normalizePlanLangCode } from "@/lib/planLanguages";

type Pair = [RegExp, string];

/** Common English itinerary phrases Gemini leaks into Slovenian plans. */
const EN_TO_SL: Pair[] = [
  [/^Departure from\s+(.+)$/i, "Odhod iz $1"],
  [/^Arrival in\s+(.+)$/i, "Prihod v $1"],
  [/^Arrive in\s+(.+)$/i, "Prihod v $1"],
  [/^Drive to\s+(.+)$/i, "Vožnja proti $1"],
  [/^Driving to\s+(.+)$/i, "Vožnja proti $1"],
  [/^Morning drive\b(.*)$/i, "Jutranja vožnja$1"],
  [/^Afternoon drive\b(.*)$/i, "Popoldanska vožnja$1"],
  [/^Scenic drive\b(.*)$/i, "Razgledna vožnja$1"],
  [/^Lunch stop en route$/i, "Kosilo na poti"],
  [/^Lunch stop\b(.*)$/i, "Postanek za kosilo$1"],
  [/^Dinner stop\b(.*)$/i, "Postanek za večerjo$1"],
  [/^Coffee stop\b(.*)$/i, "Postanek za kavo$1"],
  [/^Fuel stop\b(.*)$/i, "Postanek za gorivo$1"],
  [/^Campsite check-?in\b(.*)$/i, "Prihod na kamp$1"],
  [/^Check-?in at (?:the )?campsite\b(.*)$/i, "Prihod na kamp$1"],
  [/^Overnight (?:at|in)\s+(.+)$/i, "Prenočišče: $1"],
  [/^Rest break\b(.*)$/i, "Pavza$1"],
  [/^Free time\b(.*)$/i, "Prosti čas$1"],
  [/^International flight$/i, "Mednarodni let"],
  [/^Still en route\b/i, "Še na poti"],
  [/\ben route\b/gi, "na poti"],
  [/\bmotorhome journey\b/gi, "potovanje z avtodomom"],
  [/\broad trip\b/gi, "cestno potovanje"],
  [/\bcampground\b/gi, "kamp"],
  [/\bcampsite\b/gi, "kamp"],
  [/\bstart(?:ing)? (?:the )?day\b/gi, "začetek dneva"],
  [/\bcomfortable shoes\b/gi, "udobni čevlji"],
  [/\blight clothes\b/gi, "lahka oblačila"],
];

const EN_TO_DE: Pair[] = [
  [/^Departure from\s+(.+)$/i, "Abflug von $1"],
  [/^Arrival in\s+(.+)$/i, "Ankunft in $1"],
  [/^Arrive in\s+(.+)$/i, "Ankunft in $1"],
  [/^Airport arrival$/i, "Ankunft am Flughafen"],
  [/^Drive to\s+(.+)$/i, "Fahrt nach $1"],
  [/^Driving to\s+(.+)$/i, "Fahrt nach $1"],
  [/^Morning drive\b(.*)$/i, "Morgenfahrt$1"],
  [/^Afternoon drive\b(.*)$/i, "Nachmittagsfahrt$1"],
  [/^Scenic drive\b(.*)$/i, "Aussichtsfahrt$1"],
  [/^Lunch stop en route$/i, "Mittagspause unterwegs"],
  [/^Lunch stop\b(.*)$/i, "Mittagspause$1"],
  [/^Dinner stop\b(.*)$/i, "Abendessen-Pause$1"],
  [/^Coffee stop\b(.*)$/i, "Kaffeepause$1"],
  [/^Fuel stop\b(.*)$/i, "Tankstopp$1"],
  [/^Campsite check-?in\b(.*)$/i, "Check-in am Campingplatz$1"],
  [/^Overnight (?:at|in)\s+(.+)$/i, "Übernachtung: $1"],
  [/^Rest break\b(.*)$/i, "Pause$1"],
  [/^Free time\b(.*)$/i, "Freizeit$1"],
  [/^International flight$/i, "Internationaler Flug"],
  [/^Still en route\b/i, "Noch unterwegs"],
  [/^Check-in, refresh, and short rest$/i, "Check-in, frisch machen und kurze Pause"],
  [/^Hotel arrival$/i, "Ankunft im Hotel"],
  [/^Arrival at camp$/i, "Ankunft auf dem Camp"],
  [/^Transfer to hotel\b(.*)$/i, "Transfer zum Hotel$1"],
  [/^Your flight lands at\b/i, "Dein Flug landet um"],
  [/^Clear immigration, collect luggage\b/i, "Einreise, Gepäck holen"],
  [/^Check your ticket — you arrive at\b/i, "Prüfe dein Ticket — Ankunft auf"],
  [/^Home airport\b/i, "Heimatflughafen"],
  [/^flight departs\b/i, "Abflug"],
  [/^Arrive 2-3 hours early\b/i, "2–3 Stunden früher am Flughafen sein"],
  [/^Driving\?/i, "Mit dem Auto?"],
  [/\ben route\b/gi, "unterwegs"],
  [/\bmotorhome journey\b/gi, "Wohnmobilreise"],
  [/\bcampground\b/gi, "Campingplatz"],
  [/\bcampsite\b/gi, "Campingplatz"],
];

function applyPairs(text: string, pairs: Pair[]): string {
  let out = text;
  for (const [re, repl] of pairs) {
    out = out.replace(re, repl);
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

/**
 * When UI language is SL/DE, rewrite common English Gemini titles/phrases.
 * Proper nouns (place names) stay intact via capture groups.
 */
export function localizeTravelCopy(text: string, langCode: string): string {
  if (!text?.trim()) return text;
  const lang = normalizePlanLangCode(langCode);
  if (lang === "en") return text;
  if (lang === "sl") return applyPairs(text, EN_TO_SL);
  if (lang === "de") return applyPairs(text, EN_TO_DE);
  return text;
}

/** True when text looks like English prose (for stricter title fixes). */
export function looksMostlyEnglish(text: string): boolean {
  const t = text.trim();
  if (t.length < 8) return false;
  if (/[čšžćđ]/i.test(t)) return false;
  return /\b(the|and|from|to|with|your|stop|drive|lunch|departure|arrival|route|morning|afternoon)\b/i.test(
    t,
  );
}
