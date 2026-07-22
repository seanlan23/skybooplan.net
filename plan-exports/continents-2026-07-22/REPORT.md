# Continental plan QA — 22 Jul 2026

## Destinations

| ID | Continent | Route | Destination | Days | Map pins (days with / avg) | PDF |
|---|---|---|---|---|---|---|
| EU-LIS | Europe | LJU→LIS | Portugal | 7 | 7/7 · 3.0/day | `EU-LIS.pdf` |
| US-JFK | USA | MUC→JFK | New York | 7 | 7/7 · 3.3/day | `US-JFK.pdf` |
| AS-BKK | Asia | VIE→BKK | Thailand | 9 | 8/9 · 3.1/day | `AS-BKK.pdf` |
| SA-LIM | South America | MAD→LIM | Peru | 9 | 9/9 · 2.9/day | `SA-LIM.pdf` |
| AU-SYD | Australia | FRA→SYD | Sydney | 9 | 7/9 · 2.2/day | `AU-SYD.pdf` |

## Mapbox pin fixes

Problem: Gemini often returned 0–1 `mapPins`; activity coords were only used when pins were empty, so maps looked sparse. Day-trips past ~55 km were dropped; arrival days with only logistics had zero pins.

Changes in `itineraryMapModel.ts`:
- Always backfill pins from activities (up to 7/day)
- Fan-out near city center when an activity has no coords
- Raise radius to 120 km (Sintra / Blue Mountains)
- City hub pin when a non–in-flight day would otherwise be empty
- Added region hubs: Lisbon/Porto/Sintra, Lima/Cusco/Machu Picchu, Bondi

PDF export: Node-safe DejaVu font loading for Vitest/scripts.

## Notes

- Long-haul in-flight days can still show 0 pins (expected).
- Unsplash photos still need a valid `UNSPLASH_ACCESS_KEY` for pin photos.
- PDFs are Slovenian, 2 pax, mid budget.
