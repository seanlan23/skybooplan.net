import type { GenerateTripPlanParams } from "@/lib/geminiPro.shared";
import {
  resolveResortDiningModel,
  resortDiningFieldSpec,
  resortDiningPromptRules,
} from "@/lib/resortDiningModel";
import {
  coastalBaseForIata,
  resolveResortCoastalBase,
  resortCoastalSystemRules,
} from "@/lib/resortCoastalBase";
import {
  resolveResortTransferFlavor,
  resortTransferFieldSpec,
  resortTransferPromptRules,
} from "@/lib/resortTransferModel";

/** Shared copy/format rules for every tripStyle. */
export const TRIP_COPY_FORMAT_RULES = `=== COPY & JSON FORMAT (all trip styles) ===
- Valid JSON only. No markdown code fences. No Markdown tables. Never use the "|" character in any string field.
- Temperatures as 30°C — never $30^{\\circ}C$ or $30\\circ C$.
- Slovenian dual: "2 potnika" (never "2 potnikov").
- Always write "24h asistenca" (Slovenian c, never ç) and "morske sadeže" (never "morske sadeve").
- Flight hops as MUC → JFK — never $MUC\\rightarrow JFK \\cdot 1$.`.trim();

export const EXPLORER_ROADTRIP_STYLE_RULES = `=== TRIP STYLE: explorer / roadtrip (classic day-by-day) ===
- Keep the classic daily itinerary: days[] with activities in DOPOLDAN, POPOLDAN, VEČER.
- CITY HEADER CONSISTENCY: days[].city MUST exactly match the city where the traveller sleeps and stays that calendar day. Do not retitle the header to tomorrow’s city until the transfer day.
- First day and last day clocks MUST align with the selected international flights (IZBRANI LET). Start the destination programme in the morning after arrival (or on the arrival afternoon if the landing is late).
- Last transfer arrives at the airport EXACTLY 3 hours before the international departure. FORBIDDEN: a 8–10 hour wait at the airport after an early checkout.
- Evening / late-afternoon return: no morning checkout. Keep a relaxed daytime programme until the transfer.`.trim();

export function singleBaseSystemRules(params: GenerateTripPlanParams): string {
  const dest = params.destinationPlace ?? params.destination ?? params.destinationIata;
  const nights = Math.max(1, params.days - 1);
  const inbound = params.flightContext?.inboundDepart
    ? `Povratni let: odhod ${params.flightContext.inboundDepart}${
        params.flightContext.inboundArrive ? `, prihod ${params.flightContext.inboundArrive}` : ""
      }.`
    : "Povratni let: uskladi transfer z mednarodnim odhodom (prihod na terminal 3 ure pred poletom).";
  const outbound = params.flightContext?.outboundArrive
    ? `Prihod na destinacijo: ${params.flightContext.outboundArrive} (offset ${params.flightContext.outboundArriveDayOffset ?? 0} dni).`
    : "Prihod: uporabi dejanski čas pristanka iz IZBRANI LET.";

  const dining = resolveResortDiningModel({
    destinationIata: params.destinationIata,
    destinationName: params.destination,
    destinationPlace: params.destinationPlace,
  });
  const diningField = resortDiningFieldSpec(dining);
  const transferFlavor = resolveResortTransferFlavor({
    destinationIata: params.destinationIata,
    destinationName: params.destination,
    destinationPlace: params.destinationPlace,
  });
  const coastal =
    resolveResortCoastalBase(params.destination, "resort") ||
    resolveResortCoastalBase(params.destinationPlace, "resort") ||
    coastalBaseForIata(params.destinationIata);

  return `=== TRIP STYLE: single_base (Resort / 1 baza) ===
To NI klasični dnevni itinerar. DESTINACIJA JE ENA BAZA (resort / en otok). Primeri za razumevanje — NE kot if-veja v kodi: Maldivi, Zanzibar, Dominikanska republika, Tajska, en karibski ali indijskooceanski otok.

${resortCoastalSystemRules(coastal)}

${resortDiningPromptRules(dining, dest || params.destinationIata)}

${resortTransferPromptRules(transferFlavor, dest || params.destinationIata || "")}

STROGO PREPOVEDANO:
- days[] z urnikom po urah (10:00, 14:00, 19:00).
- time_slot DOPOLDAN / POPOLDAN / VEČER.
- Selitev med hoteli. hotels[] = NATANKO 1 vrstica (isto mesto/otok, približno ${nights} noči).

Vrni IZKLJUČNO ta JSON (ključi v angleščini, besedila v jeziku uporabnika):

{
  "tripStyle": "single_base",
  "trip_title": "...",
  "overview": "...",
  "arrival_protocol": {
    "visa_and_entry": "vstopni obrazci / viza (npr. IMUGA, E-ticket, ETA, TDAC) — točno kaj izpolniti pred pristankom in kje. Primer (NE if-veja): Tajska — turistični vstop za slovenske/EU državljane je brez vizuma do 60 dni (ne 30), plus TDAC",
    "immigration": "vrsta v vrsti, kaj pokazati, kako dolgo traja",
    "baggage": "kateri trak / kje prevzeti prtljago",
    "transfer_pickup": "${resortTransferFieldSpec()}",
    "cash_and_esim": "gotovina ob prihodu (koliko, kje menjalnica) in eSIM / lokalna kartica"
  },
  "resort_guide": {
    "check_in_out": "prijava in odjava — ure, late check-out, kaj narediti če soba ni pripravljena",
    "all_inclusive_etiquette": "${diningField}",
    "tipping": "napitnine — kje so vključene, kje pustiti drobiž",
    "relaxing_at_resort": "kako preživeti dneve v resortu brez urnika po urah"
  },
  "optional_excursions": [
    { "title": "...", "description": "...", "estimated_cost_eur": 0, "book_safely_where": "kje varno rezervirati (uradni pult / zanesljiv operator)" }
  ],
  "departure_protocol": {
    "return_transfer": "povratni transfer (gliser / hidroplan / kombi) usklajen z mednarodnim letom",
    "airport_lead_time": "prihod na mednarodni terminal NATANKO 3 ure pred odhodom — ne 5–10 ur prej",
    "flight_alignment": "check-out + transfer + let v eni časovnici, brez praznega dopoldneva na letališču"
  },
  "hotels": [{ "city": "${dest}", "nights": ${nights} }],
  "weatherWidget": { "season": "...", "avgTemp": "30°C", "clothing": "..." },
  "safetyWarning": null
}

optional_excursions: NATANKO 4–6 najboljših opcijskih izletov na LOKACIJI (ne vsak dan po en izlet). Vsak: naslov, kratek opis, okvirna cena v EUR, kje varno rezervirati.

${outbound}
${inbound}

Baza: ${dest}. Ena namestitev za celoten postanek. Ne izmišljuj imena hotela — samo city + nights.`;
}
