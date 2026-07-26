# Mixed plan QA ×10 — mixed-10-2026-07-26

Generated: 2026-07-26T10:45:48.391Z

**Totals:** ok 9 · issues 1 · fail 0 · sense-pass 9/10

PDFs also copied to: `/Users/rokkricej/Downloads/skybooplan-qa-mixed-10`

## Motorhome (5)

| ID | Route | Days | Maps | Sense | Map | PDF |
|---|---|---|---|---|---|---|
| MH-01-Mezica-Italija | Mežica → Italija | 11/11 | Mežica → Venice → Namestitev v Camping Piani di Clodia (Lazise), Lake Garda → Lake Garda → Florence → Rome → Bologna → Mežica | OK_WITH_WARNINGS | centers 10/11, driveLegs~5, pinCapBreaches 0 | `MH-01-Mezica-Italija.pdf` |
| MH-02-Ljubljana-Hrvaška | Ljubljana → Hrvaška | 9/9 | Ljubljana → Pula → Popoldan na plaži v Rovinju in povratek v kamp, Pula → Zadar → Omis → Karlovac → Ljubljana | OK_WITH_WARNINGS | centers 8/9, driveLegs~4, pinCapBreaches 0 | `MH-02-Ljubljana-Hrvaška.pdf` |
| MH-03-SG-NorthHolland | Slovenj Gradec → North Holland, NL | 11/11 | Slovenj Gradec → Namestitev v kampu Camping Nord-Sam, Salzburg → Salzburg → St. Goar → Namestitev v kampu Camping Amsterdamse Bos → Amsterdam → Namestitev v kampu Camping Kogerstrand, Texel → Texel → Namestitev v kampu Camping Heidelberg → Heidelberg → North Holland, NL → Slovenj Gradec | OK | centers 10/11, driveLegs~4, pinCapBreaches 0 | `MH-03-SG-NorthHolland.pdf` |
| MH-04-Ljubljana-Spanija | Ljubljana → Španija | 14/14 | Ljubljana → Lazise → Avignon → Sant Pere Pescador → Millau → Annecy → Bled → Ljubljana | OK | centers 14/14, driveLegs~7, pinCapBreaches 0 | `MH-04-Ljubljana-Spanija.pdf` |
| MH-05-Maribor-Albanija | Maribor → Albanija | 12/12 | Maribor → Plitvice Lakes National Park → Split → Kotor → Tirana → Saranda → Podgorica → Maribor | FAIL | centers 9/12, driveLegs~4, pinCapBreaches 0 | `MH-05-Maribor-Albanija.pdf` |

## Flight (5)

| ID | Route | Dest | Days | Pins | Sense | Map | PDF |
|---|---|---|---|---|---|---|---|
| FL-01-MUC-BKK | MUC→BKK | Thailand | 10/10 | 9/10 · 2.3/d | OK | centers 8/10, driveLegs~0, pinCapBreaches 0 | `FL-01-MUC-BKK.pdf` |
| FL-02-LJU-BCN | LJU→BCN | Barcelona | 7/7 | 7/7 · 3.57/d | OK_WITH_WARNINGS | centers 6/7, driveLegs~0, pinCapBreaches 0 | `FL-02-LJU-BCN.pdf` |
| FL-03-VIE-KEF | VIE→KEF | Iceland | 7/7 | 7/7 · 3.29/d | OK_WITH_WARNINGS | centers 6/7, driveLegs~0, pinCapBreaches 0 | `FL-03-VIE-KEF.pdf` |
| FL-04-FRA-NRT | FRA→NRT | Japan | 9/9 | 8/9 · 3.22/d | OK | centers 7/9, driveLegs~0, pinCapBreaches 0 | `FL-04-FRA-NRT.pdf` |
| FL-05-ZRH-DXB | ZRH→DXB | Dubai | 7/7 | 7/7 · 2.57/d | OK_WITH_WARNINGS | centers 6/7, driveLegs~0, pinCapBreaches 0 | `FL-05-ZRH-DXB.pdf` |

## Issues / warnings

- **MH-01-Mezica-Italija** (OK_WITH_WARNINGS): n/a _(warn: last day city "Bologna" may not be home (Mežica))_
- **MH-02-Ljubljana-Hrvaška** (OK_WITH_WARNINGS): n/a _(warn: last day city "Karlovac" may not be home (Ljubljana))_
- **MH-03-SG-NorthHolland**: OK
- **MH-04-Ljubljana-Spanija**: OK
- **MH-05-Maribor-Albanija** (FAIL): map centers only 9/12 _(warn: D2 map missing city center; D3 map missing city center; last day city "Podgorica" may not be home (Maribor))_
- **FL-01-MUC-BKK**: OK
- **FL-02-LJU-BCN** (OK_WITH_WARNINGS): n/a _(warn: D1 arrival clock 04:20 far from flight arrive 09:25)_
- **FL-03-VIE-KEF** (OK_WITH_WARNINGS): n/a _(warn: D1 arrival clock 08:35 far from flight arrive 13:40)_
- **FL-04-FRA-NRT**: OK
- **FL-05-ZRH-DXB** (OK_WITH_WARNINGS): n/a _(warn: D1 arrival clock 06:45 far from flight arrive 18:40)_
