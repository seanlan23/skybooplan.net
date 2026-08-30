import { parsePostankiLeg } from "@/lib/returnFlightSummary";
import { planLangCopy } from "@/lib/planLangCopy";

export type FlightLayover = {
  iata: string;
  minutes?: number;
};

export type TransitConnection = {
  airport: string;
  minutes?: number;
  leg: "outbound" | "inbound";
};

export type TransitTimingBand = "short" | "optimal" | "long";

export type TransitGuide = {
  title: string;
  baggageLabel: string;
  baggage: string;
  protocolLabel: string;
  protocol: string;
  timingLabel: string;
  connections: Array<{
    airport: string;
    leg: "outbound" | "inbound";
    minutes?: number;
    waitLabel?: string;
    timingBand?: TransitTimingBand;
    timing?: string;
  }>;
};

/** <2h short · 2h–5h optimal (covers the 2–4h band and the unspecified 4–5h gap) · ≥5h long. */
export function transitTimingBand(minutes: number): TransitTimingBand {
  if (minutes < 120) return "short";
  if (minutes < 300) return "optimal";
  return "long";
}

export function formatTransitWait(minutes: number, lang?: string): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) {
    return planLangCopy(lang, {
      sl: `${h} h ${m} min`,
      en: `${h} h ${m} min`,
      de: `${h} Std. ${m} Min.`,
    });
  }
  if (h > 0) {
    return planLangCopy(lang, {
      sl: `${h} h`,
      en: `${h} h`,
      de: `${h} Std.`,
    });
  }
  return planLangCopy(lang, {
    sl: `${m} min`,
    en: `${m} min`,
    de: `${m} Min.`,
  });
}

function iatasFromVia(via?: string): string[] {
  return (via ?? "")
    .split(/[,/|]/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z]{3}$/.test(s));
}

function connectionsForLeg(
  leg: "outbound" | "inbound",
  layovers?: FlightLayover[],
  via?: string,
  stops?: number,
): TransitConnection[] {
  if (layovers?.length) {
    return layovers
      .map((l) => ({
        airport: (l.iata ?? "").trim().toUpperCase(),
        minutes:
          typeof l.minutes === "number" && Number.isFinite(l.minutes) && l.minutes > 0
            ? Math.round(l.minutes)
            : undefined,
        leg,
      }))
      .filter((c) => /^[A-Z]{3}$/.test(c.airport));
  }
  const viaAirports = iatasFromVia(via);
  if (viaAirports.length) {
    return viaAirports.map((airport) => ({ airport, leg }));
  }
  if (stops != null && stops > 0) {
    return [{ airport: "", leg }];
  }
  return [];
}

export function connectionsFromFlightContext(ctx?: {
  outboundStops?: number;
  inboundStops?: number;
  outboundVia?: string;
  inboundVia?: string;
  outboundLayovers?: FlightLayover[];
  inboundLayovers?: FlightLayover[];
} | null): TransitConnection[] {
  if (!ctx) return [];
  return [
    ...connectionsForLeg("outbound", ctx.outboundLayovers, ctx.outboundVia, ctx.outboundStops),
    ...connectionsForLeg("inbound", ctx.inboundLayovers, ctx.inboundVia, ctx.inboundStops),
  ];
}

export function connectionsFromMakeFlight(flight: {
  postanki?: string;
  outbound_layovers?: FlightLayover[];
  inbound_layovers?: FlightLayover[];
}): TransitConnection[] {
  const out = parsePostankiLeg(flight.postanki, "outbound");
  const inn = parsePostankiLeg(flight.postanki, "inbound");
  return connectionsFromFlightContext({
    outboundStops: out.stops,
    inboundStops: inn.stops,
    outboundVia: out.via,
    inboundVia: inn.via,
    outboundLayovers: flight.outbound_layovers,
    inboundLayovers: flight.inbound_layovers,
  });
}

export function makeFlightStopContext(
  flight: {
    postanki?: string;
    outbound_layovers?: FlightLayover[];
    inbound_layovers?: FlightLayover[];
  },
  includeInbound: boolean,
): {
  outboundStops?: number;
  inboundStops?: number;
  outboundVia?: string;
  inboundVia?: string;
  outboundLayovers?: FlightLayover[];
  inboundLayovers?: FlightLayover[];
} {
  const out = parsePostankiLeg(flight.postanki, "outbound");
  const inn = parsePostankiLeg(flight.postanki, "inbound");
  return {
    ...(out.stops != null ? { outboundStops: out.stops } : {}),
    ...(includeInbound && inn.stops != null ? { inboundStops: inn.stops } : {}),
    ...(out.via ? { outboundVia: out.via } : {}),
    ...(includeInbound && inn.via ? { inboundVia: inn.via } : {}),
    ...(flight.outbound_layovers?.length ? { outboundLayovers: flight.outbound_layovers } : {}),
    ...(includeInbound && flight.inbound_layovers?.length
      ? { inboundLayovers: flight.inbound_layovers }
      : {}),
  };
}

function timingCopy(band: TransitTimingBand, lang?: string): string {
  if (band === "short") {
    return planLangCopy(lang, {
      sl: "⚠️ Kratek prestop: Po pristanku pojdite neposredno skozi tranzitni varnostni pregled do svojega izhoda brez zadrževanja.",
      en: "⚠️ Tight connection: After landing go straight through transit security to your gate — do not linger.",
      de: "⚠️ Kurzer Umstieg: Nach der Landung direkt durch die Transit-Sicherheitskontrolle zum Gate — ohne Aufenthalt.",
    });
  }
  if (band === "long") {
    return planLangCopy(lang, {
      sl: "🛋️ Daljši prestop: Priporočamo uporabo letališkega salona (Lounge) ali počivalnih con v terminalu.",
      en: "🛋️ Long layover: Use an airport lounge or rest areas in the terminal.",
      de: "🛋️ Langer Umstieg: Lounge oder Ruhezonen im Terminal nutzen.",
    });
  }
  return planLangCopy(lang, {
    sl: "✅ Optimalen prestop: Dovolj časa za miren prehod, kratek počitek in obisk restavracij/trgovin v tranzitni coni.",
    en: "✅ Comfortable connection: Enough time for a calm transfer, a short rest, and food or shops in transit.",
    de: "✅ Guter Umstieg: Genug Zeit für einen ruhigen Wechsel, eine kurze Pause und Restaurants/Shops im Transit.",
  });
}

function titleFor(connections: TransitConnection[], lang?: string): string {
  const airports = [...new Set(connections.map((c) => c.airport).filter(Boolean))];
  const via = airports.length ? ` · ${airports.join(", ")}` : "";
  return planLangCopy(lang, {
    sl: `Nasveti za prestop${via}`,
    en: `Connection tips${via}`,
    de: `Umstiegs-Tipps${via}`,
  });
}

export function buildTransitGuide(
  connections: TransitConnection[],
  lang?: string,
): TransitGuide | null {
  if (!connections.length) return null;

  return {
    title: titleFor(connections, lang),
    baggageLabel: planLangCopy(lang, {
      sl: "Prtljaga",
      en: "Baggage",
      de: "Gepäck",
    }),
    baggage: planLangCopy(lang, {
      sl: "Oddana prtljaga gre avtomatsko do končne destinacije (ni je treba dvigovati med prestopom).",
      en: "Checked bags are usually tagged through to your final destination — you do not collect them during the connection.",
      de: "Aufgabegepäck läuft in der Regel bis zum Endziel durch — beim Umstieg nicht abholen.",
    }),
    protocolLabel: planLangCopy(lang, {
      sl: "Tranzitni protokol",
      en: "Transit protocol",
      de: "Transit-Protokoll",
    }),
    protocol: planLangCopy(lang, {
      sl: "Po pristanku sledite rumenim tablam 'Transfers / Connecting Flights'. Na zaslonih poiščite številko naslednjega izhoda (Gate).",
      en: "After landing follow the yellow 'Transfers / Connecting Flights' signs. Check screens for your next gate number.",
      de: "Nach der Landung den gelben Schildern 'Transfers / Connecting Flights' folgen. Am Monitor das nächste Gate suchen.",
    }),
    timingLabel: planLangCopy(lang, {
      sl: "Časovna ocena",
      en: "Timing",
      de: "Zeitfenster",
    }),
    connections: connections.map((c) => {
      const waitLabel =
        c.minutes != null && c.minutes > 0 ? formatTransitWait(c.minutes, lang) : undefined;
      const timingBand = c.minutes != null && c.minutes > 0 ? transitTimingBand(c.minutes) : undefined;
      return {
        airport: c.airport,
        leg: c.leg,
        minutes: c.minutes,
        waitLabel,
        timingBand,
        timing: timingBand ? timingCopy(timingBand, lang) : undefined,
      };
    }),
  };
}

export function formatTransitGuidePdfLines(guide: TransitGuide): string[] {
  const lines: string[] = [guide.title];
  lines.push(`${guide.baggageLabel}: ${guide.baggage}`);
  lines.push(`${guide.protocolLabel}: ${guide.protocol}`);
  for (const c of guide.connections) {
    if (!c.timing) continue;
    const where = [c.airport, c.waitLabel].filter(Boolean).join(" · ");
    const prefix = where ? `${where} — ` : "";
    lines.push(`${guide.timingLabel}: ${prefix}${c.timing}`);
  }
  if (lines.length === 1) return lines;
  return lines;
}

export function formatTransitGuideProtocolText(guide: TransitGuide): string {
  const bits = [
    `${guide.baggageLabel}: ${guide.baggage}`,
    `${guide.protocolLabel}: ${guide.protocol}`,
    ...guide.connections
      .filter((c) => c.timing)
      .map((c) => {
        const where = [c.airport, c.waitLabel].filter(Boolean).join(" · ");
        return where ? `${where} — ${c.timing}` : c.timing!;
      }),
  ];
  return bits.join("\n\n");
}
