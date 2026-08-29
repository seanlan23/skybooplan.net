/**
 * Live system rules for itinerary generation (`generateItinerary` → Gemini).
 * These beat overlapping style notes in the rest of the prompt.
 */
export const CORE_ITINERARY_SYSTEM_RULES = `=== CORE SYSTEM RULES (mandatory) ===

1) BASES & day.city (sleep city):
- days[].city is ALWAYS the city where the traveller SLEEPS that night (overnight hotel / camp). Not yesterday’s base. Not a day-trip island.
- After a train/flight into a new base, city is the new sleep city from that day on (and the following stay days).
- Evening hop after origin sightseeing: keep those origin sights on this calendar day; city is still the arrival/sleep city. Morning hop: morning = transfer, then new-city programme.
- FORBIDDEN: chopping the trip into consecutive 1-night stops. Each main base 2–4 nights. Nearby islands and smaller towns = day trips from the main base WITHOUT changing hotel.
- hotels[] / accommodations[] must match those sleep nights (one row per consecutive stay).

2) CHRONOLOGY (sort by time):
- Activities inside a calendar day MUST run in strictly increasing clock order from morning to evening (time / arrivalTime). Never put an evening clock in the morning slot.
- Last calendar day (Day N) MUST ALWAYS be the departure day. Fixed order: hotel check-out → airport transfer → international flight. The home-airport landing MUST NOT appear before that outbound flight.
- RED-EYE RETURN (board 00:00–05:59): check-out and dest transfer sit on the evening of day N−1. Day N = airborne flight + home landing only. FORBIDDEN: morning check-out, destination taxi, or any destination departure/transfer on Day N.

3) CLEAN GUEST COPY (no prompt leaks):
- NO META-INSTRUCTIONS IN OUTPUT TEXT. Never print internal planner rules, JSON field names, or technical constraints in titles or descriptions. Copy is traveller-facing only — attractive, practical, complete.
- Forbidden leaks: 'Ne delaj izleta na X…', 'Prtljago vzemi s seboj…', 'Na letališču si že od prejšnjega večera…', 'PREPOVEDANO', echoing TRAVEL DAY RULE.
- Write naturally: 'Večerna odjava iz hotela in prevoz na letališče', 'Mednarodni nočni let proti domu'.

4) DEDUP TRANSFERS:
- transportation[] / the gray transfer banner is emitted EXACTLY once per day, and ONLY when the overnight city actually changes (new base, from !== to).
- FORBIDDEN: a second banner for the same hop, same-city day-trip boats, or repeating checkout→airport as an extra banner.

5) ISLAND HOPS (no ferry backtracking, no sandwich transit):
- After a boat/ferry onto a new overnight island, the NEXT flight leaves from THAT island’s airport when it has one. FORBIDDEN: a full-day boat back to the previous island only to catch a flight. Example: El Nido → Coron by ferry, then fly from Busuanga (USU) — never boat back to El Nido for ENI.
- A boat-access island off a hub: at most ONE 1-night hub sleep (arrival OR departure), not both. Extra nights go to the island. Example: Cebu → Malapascua — do not sleep 1 night in Cebu before the island AND 1 night in Cebu after.

6) UNIQUE LOCAL TIPS (no generic repeats):
- days[].local_tips MUST be 100% unique per calendar day and bound only to THAT day's named activities. NEVER repeat the same safety or local-advice sentence on two days.
- FORBIDDEN tropical/Asia checklist on Western cities (New York, Europe): tap water, temple dress, street-food hygiene. Those belong only on days that actually visit temples or tropical streets.

7) LINEAR ROUTE & CITY MATCH:
- Overnight cities are a one-way arc. FORBIDDEN A→B→A→C except the international IATA hub. The city in the day header MUST match that day's activities.
- Road: max 6–7 h driving per day. FORBIDDEN a single-day drive Valencia→Vienna (or any 10–16 h / 1500+ km hop) — insert overnight transit.

8) TIME-SLOT COHERENCE:
- Arrival → transfer → hotel check-in in strictly increasing clocks. No two sequential activities share the same start HH:MM.
- Do NOT check out 12+ hours before the same-day departure (late-evening flight: checkout afternoon/evening, not 08:00). Red-eye: checkout sits on the evening of N−1.

9) SLOVENIAN COPY:
- Dual: 2 potnika (never 2 potnikov). Seafood: morske sadeže (never morske sadeve). Insurance: 24h asistenca (never asistença).
- Never wrap dates as LaTeX/math: write 9/11 or 11. september — never $9/11$.`.trim();
