# Sense review — mixed-10-2026-07-26

Live Gemini ×10 (5 avtodom + 5 klasični), PDF-ji v  
`/Users/rokkricej/Downloads/skybooplan-qa-mixed-10`  
in `plan-exports/mixed-10-2026-07-26/`.

Avtomatika: ure (overlap), MH return-home Maps, A14 spam, ellipsis (vključno mapPins), ferry→Amsterdam, map centers + drive legs, hop km.

| ID | Sense | Pregled |
|---|---|---|
| MH-01 Mežica→Italija | OK + warn | Maps se zapre v Mežico. Zadnji itinerar-dan je Bologna (povratek v naslovu/Maps OK). Drive legs ~5. |
| MH-02 LJ→Hrvaška | OK + warn | Ellipsis očiščen. Zadnji dan Karlovac — Maps se vrne v LJ. Drive legs ~4. |
| MH-03 SG→North Holland | **OK** | Čisto. Salzburg / Texel / Heidelberg. Maps start+end SG. |
| MH-04 LJ→Španija | **OK** | Celoten loop LJ→…→LJ, 14/14 centerjev, 7 drive legs. |
| MH-05 Maribor→Albanija | **FAIL / mejni** | Manjkajo 3 map centri (slabi city labell); pot se ne konča v Mariboru (Podgorica). Maps return home je dodan, ampak itinerar-dnevi ne. |
| FL-01 MUC→BKK | **OK** | Kwai/struktura OK, pine OK. |
| FL-02 LJU→BCN | OK + warn | Barcelona smiselna. D1 ura prihoda ne ujame flightContext (04:20 vs 09:25). |
| FL-03 VIE→KEF | OK + warn | Island OK. D1 clock drift. |
| FL-04 FRA→NRT | **OK** | Tokyo/Kyoto OK po čiščenju ellipsis (tudi mapPins). |
| FL-05 ZRH→DXB | OK + warn | Dubai OK. D1 clock daleč od flight arrive. |

## Skupaj

- **Sense-pass:** 9/10  
- **Brez opozoril:** 4/10 (MH-03, MH-04, FL-01, FL-04)  
- **Ne bi oddal stranki tako:** MH-05 (povratek + mapa)  
- **Časi:** ni time-overlap failov; pri letih D1 ure še niso zanesljivo vezane na flightContext  
- **Mapbox / ceste:** MH načrti imajo `drive` legIn (4–7 dni) — kamera po mestih, max ~4 pini. Dejanska Mapbox Directions črta se riše v UI (TripMap), ne v PDF.

## Motor popravki iz tega batcha

- Truncation repair na vseh planih (vključno `mapPins`) prek `applyItineraryGuards`  
- Albanija / Črna gora kot country-only Maps stop  
- (prej) A14 tip, Texel ferry → Amsterdam  
