/** Shared LLM rules — when to suggest flight vs car/train/bus by distance. */
export const DISTANCE_TRANSPORT_RULES = `
DISTANCE-BASED TRANSPORT SELECTION (mandatory — applies to ALL legs, including day 1 arrival and inter-city hops):

Never suggest flying between cities that are less than 500 km apart or less than 1 hour flight time. Instead recommend driving with estimated drive time and cost, or train connections where available.

Distance rules:
- Under 300 km → ALWAYS suggest CAR or BUS — NEVER a flight. Include estimated drive time, fuel/toll cost, and parking tips.
- 300–500 km → Prefer CAR or TRAIN; mention flight ONLY if it is significantly faster (save 3+ hours) AND still note the drive/train alternative with time and cost.
- Over 500 km → Flight may be the primary option; still mention ground alternatives when reasonable (e.g. overnight train).

Regional overrides:
- Croatia: Ljubljana → any Croatian coast city (Zadar, Split, Dubrovnik, Rijeka, Pula, Šibenik) = CAR only (typically 2–4 h drive, cheaper and more convenient than flying). Same for Zagreb → Croatian coast when under 400 km.
- Slovenia neighbors (Austria, Italy, Hungary, Croatia inland): prefer CAR or TRAIN for cross-border trips under 500 km — e.g. Ljubljana–Vienna, Ljubljana–Venice, Ljubljana–Zagreb, Ljubljana–Budapest.
- Short-hop flights (e.g. LJU–ZAD ~220 km) are WRONG — use transportation[] type "car" (road trip) or "train" with realistic drive duration (e.g. "3h 30min") and estimatedPrice for fuel/tolls, NOT type "flight". Never label a self-drive road stage as type "van".
- transportation[] / transfer: ONLY when the overnight city changes (new base). Never a FLIGHT/VAN/FERRY banner for same-city day trips (island/bay excursions). Airport→hotel is not a base hop.
- Andaman / south Thailand local hops: Phuket (HKT) → Krabi / Ao Nang = ALWAYS ferry/speedboat OR road van/taxi (~2.5h). NEVER a flight (HKT–KBV is a useless hop plus two airport transfers).
- Koh Lanta has NO airport. Flights for that area operate from Krabi (KBV), then van + ferry/speedboat to the island. NEVER invent a Lanta runway or a direct flight onto Koh Lanta.
- Yucatán: if Isla Mujeres is on the trip, overnight there immediately after landing in Cancún OR as the last base before departure (20-min ferry). NEVER splice it into the middle of the mainland coast (Cancún → Isla Mujeres → Playa del Carmen → Tulum → Valladolid → Cancún).

When recommending car: fill drivingDistanceKm and drivingDurationHours on that day; use transportation[] with type "car" and activities with transport_type "car" or omit flight entirely.
`.trim();
