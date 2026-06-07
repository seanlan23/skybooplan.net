export type AccommodationMode = "hotel" | "motorhome";

/** e.g. "vsak 5 dan hotel", "hotel na 3 dni" → interval */
export function detectHotelRestInterval(wishes?: string, customPrompt?: string): number | null {
  const text = `${wishes ?? ""} ${customPrompt ?? ""}`.toLowerCase();
  const patterns = [
    /vsak(?:ih)?\s*(\d+)\s*dan(?:a|ov)?(?:\s+\w+){0,10}\s*(?:v\s+)?hotelu?/i,
    /hotelu?\s+na\s+(\d+)\s+dni/i,
    /(\d+)\s*dni(?:v|h)?\s*(?:v\s+)?hotelu?/i,
    /hotelu?(?:\s+\w+){0,10}\s*vsak(?:ih)?\s*(\d+)\s*dan/i,
    /every\s*(\d+)\s*days?\s*(?:in\s+)?(?:a\s+)?hotel/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 2 && n <= 14) return n;
  }
  return null;
}

export function isHotelRestDay(
  tripDay: number,
  interval: number,
  opts?: { totalDays?: number },
): boolean {
  if (tripDay <= 0 || interval < 2) return false;
  if (opts?.totalDays != null && tripDay >= opts.totalDays) return false;
  return tripDay % interval === 0;
}

export function motorhomeCampingHint(city: string, slo: boolean): string {
  return slo
    ? `Parkiraj avtodom na avtokampu izven jedra mesta ${city} — ne v centru. V center z javnim prevozom ali P+R; RV pusti na kampu.`
    : `Park the motorhome at a campsite outside ${city} — not downtown. Use transit or P+R into the centre; leave the RV at camp.`;
}

export function motorhomeLocalTransportTips(city: string, slo: boolean): string {
  return slo
    ? `Iz avtokampa pri ${city} v center z metrojem ali avtobusom (15–35 €). RV ne voziš v jedro mesta — parkiranje na kampu.`
    : `From camp near ${city} use metro/bus into the centre (€15–35). Do not drive the RV downtown — park at camp.`;
}

/** Single source of truth for motorhome + periodic hotel nights (UI + budget). */
export function resolveTripAccommodation(opts: {
  accommodationMode?: AccommodationMode;
  hotelRestEveryNDays?: number;
  wishes?: string;
  customPrompt?: string;
}): { accommodationMode: AccommodationMode; hotelRestEveryNDays?: number } {
  const accommodationMode =
    opts.accommodationMode ?? detectAccommodationMode(opts.wishes, opts.customPrompt);
  const hotelRestEveryNDays =
    opts.hotelRestEveryNDays ??
    (accommodationMode === "motorhome"
      ? detectHotelRestInterval(opts.wishes, opts.customPrompt) ?? undefined
      : undefined);
  return { accommodationMode, hotelRestEveryNDays };
}

export function detectAccommodationMode(wishes?: string, customPrompt?: string): AccommodationMode {
  const text = `${wishes ?? ""} ${customPrompt ?? ""}`.toLowerCase();
  if (
    /avtodom|motorhome|campervan|camper van|\bcamper\b|wohnmobil|autocaravana|rv rental|najem avtodoma|najeli bi avtodom|najela bi avtodom|najel[a]?\s+bova?\s+avtodom|bova\s+najel|imeli bi avtodom|majhen avtodom|route\s*66/i.test(
      text,
    )
  ) {
    return "motorhome";
  }
  return "hotel";
}

export function motorhomeTransportBetween(
  km: number,
  fromCity: string,
  toCity: string,
): { type: string; duration: string; costLabel: string; howTo: string } {
  const driveH = Math.max(2, Math.round(km / 75));
  const fuelEur = Math.round(km * 0.22);
  return {
    type: "drive",
    duration: km >= 400 ? `${driveH}–${driveH + 2}h` : `${Math.max(1, driveH - 1)}–${driveH + 1}h`,
    costLabel: `${fuelEur}–${fuelEur + 40} €`,
    howTo: `Vožnja z avtodomom ${fromCity} → ${toCity} (${Math.round(km)} km). Parkiraj na avtokampu izven mestnega jedra; v center z javnim prevozom.`,
  };
}

export function motorhomeTravelDayDescription(km: number, destCity: string): string {
  return `Celodnevna vožnja z avtodomom (cca. ${Math.round(km)} km) do avtokampa pri ${destCity}. Brez mestnih hotelov — parkiraj izven jedra, center z metro/avtobusom.`;
}

export function motorhomePromptRules(slo: boolean): string {
  return slo
    ? "NAČIN: AVTODOM — parkiraj na kampih IZVEN mestnih jeder. NE mestni hoteli. Med mesti samo VOŽNJA (ZDA: 400–800 km = cel dan, ne 'lokalni 1h30'). Nikoli notranji let z RV. V mesto javni prevoz/P+R."
    : "MODE: MOTORHOME — campgrounds outside city centers. Inter-city = DRIVING full days (US hops 400–800 km are NOT 90-minute local trips). No domestic flights with RV.";
}
