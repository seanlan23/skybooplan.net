# Plan QA ×10 — 2026-07-24

Generated: 2026-07-24T09:11:22.168Z

**Totals:** ok 10 · issues 0 · fail 0 · avg pins/day 3.33

| ID | Region | Route | Dest | Days | Pins | Status | PDF |
|---|---|---|---|---|---|---|---|
| 01-MUC-BKK | Asia | MUC→BKK | Tajska | 8/8 | 6/8 · 2.25/d | ok | `01-MUC-BKK.pdf` |
| 02-LJU-BCN | Europe | LJU→BCN | Barcelona | 6/6 | 6/6 · 4.67/d | ok | `02-LJU-BCN.pdf` |
| 03-FRA-NRT | Asia | FRA→NRT | Japonska | 8/8 | 6/8 · 3.75/d | ok | `03-FRA-NRT.pdf` |
| 04-VIE-KEF | Europe | VIE→KEF | Islandija | 6/6 | 6/6 · 1.83/d | ok | `04-VIE-KEF.pdf` |
| 05-CDG-JFK | USA | CDG→JFK | New York | 7/7 | 7/7 · 3.29/d | ok | `05-CDG-JFK.pdf` |
| 06-AMS-CPT | Africa | AMS→CPT | Cape Town | 8/8 | 7/8 · 4.88/d | ok | `06-AMS-CPT.pdf` |
| 07-ZRH-DXB | Middle East | ZRH→DXB | Dubai | 6/6 | 6/6 · 2.83/d | ok | `07-ZRH-DXB.pdf` |
| 08-FCO-ATH | Europe | FCO→ATH | Grčija | 7/7 | 6/7 · 3/d | ok | `08-FCO-ATH.pdf` |
| 09-MAD-LIM | South America | MAD→LIM | Peru | 9/9 | 9/9 · 3.56/d | ok | `09-MAD-LIM.pdf` |
| 10-WAW-LIS | Europe | WAW→LIS | Portugal | 7/7 | 7/7 · 3.29/d | ok | `10-WAW-LIS.pdf` |

## Nonsense found & fixed
1. Same-day arrival overwrote origin depart time (MAD→LIM Day1 18:15 instead of 12:40) — fixed in `patchArrivalActivityClockTimes`.
2. In-flight activity had swapped depart/arrive — fixed.
3. Last day stranded off-hub (Krabi while returning via BKK) — inject domestic hop + retitle to hub.
4. `generateObject` timeout 120s→180s (WAW→LIS had timed out).

## Notes
- MUC→BKK: full 8/8 days OK.
- PDFs in this folder.
- In-flight days may have 0 pins (expected).
