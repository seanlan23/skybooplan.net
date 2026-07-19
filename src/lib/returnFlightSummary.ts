/**
 * Honest return-flight copy for AI plan cards.
 * Never claim "direct" unless stop count is explicitly 0.
 */

export type ReturnFlightStopInfo = {
  /** Number of stops on the return leg; undefined = unknown. */
  stops?: number;
  /** Layover IATA codes, e.g. "AUH". */
  via?: string;
};

export function parsePostankiLeg(
  postanki: string | undefined,
  leg: "outbound" | "inbound",
): ReturnFlightStopInfo {
  const raw = (postanki ?? "").trim();
  if (!raw) return {};

  const parts = raw.includes("/") ? raw.split("/") : [raw];
  const part =
    leg === "outbound" ? (parts[0] ?? "").trim() : (parts[1] ?? parts[0] ?? "").trim();
  if (!part) return {};

  if (part === "0") return { stops: 0 };

  const withVia = part.match(/^(\d+)\|([A-Z]{3}(?:,[A-Z]{3})*)$/i);
  if (withVia) {
    return {
      stops: Number.parseInt(withVia[1]!, 10),
      via: withVia[2]!.toUpperCase(),
    };
  }

  const asNumber = Number.parseInt(part, 10);
  if (Number.isFinite(asNumber) && String(asNumber) === part) {
    return { stops: asNumber };
  }

  return {};
}

/** Rewrite Gemini / stale copy that invents non-stop long-haul flights. */
export function buildReturnFlightSummary(opts: {
  fromIata: string;
  toIata: string;
  language?: string;
  stops?: number;
  via?: string;
  depart?: string;
  arrive?: string;
}): string {
  const slo = !(opts.language && !opts.language.startsWith("sl"));
  const from = opts.fromIata.toUpperCase();
  const to = opts.toIata.toUpperCase();
  const via = opts.via?.replace(/,/g, ", ");
  const times =
    opts.depart && opts.arrive
      ? slo
        ? ` Odhod ${opts.depart}, prihod ${opts.arrive} (lokalni časi).`
        : ` Depart ${opts.depart}, arrive ${opts.arrive} (local times).`
      : "";

  if (opts.stops === 0) {
    return slo
      ? `Direktni let ${from} → ${to}.${times}`
      : `Direct flight from ${from} to ${to}.${times}`;
  }

  if (opts.stops != null && opts.stops > 0) {
    const stopLabel =
      opts.stops === 1
        ? slo
          ? "1 postankom"
          : "1 stop"
        : slo
          ? `${opts.stops} postanki`
          : `${opts.stops} stops`;
    const viaBit = via
      ? slo
        ? ` prek ${via}`
        : ` via ${via}`
      : "";
    return slo
      ? `Let ${from} → ${to} z ${stopLabel}${viaBit}.${times}`
      : `Flight ${from} → ${to} with ${stopLabel}${viaBit}.${times}`;
  }

  // Unknown stop count — never claim direct.
  return slo
    ? `Mednarodni let ${from} → ${to}.${times}`
    : `International flight from ${from} to ${to}.${times}`;
}

/** If summary falsely says "direct", replace with a neutral/honest line. */
export function sanitizeReturnFlightSummary(
  summary: string | undefined,
  opts: {
    fromIata: string;
    toIata: string;
    language?: string;
    stops?: number;
    via?: string;
    depart?: string;
    arrive?: string;
  },
): string {
  const built = buildReturnFlightSummary(opts);
  const raw = (summary ?? "").trim();
  if (!raw) return built;

  const claimsDirect = /direct|non[\s-]?stop|direkt/i.test(raw);
  const knownConnecting = opts.stops != null && opts.stops > 0;
  const unknownStops = opts.stops == null;

  if (claimsDirect && (knownConnecting || unknownStops)) {
    return built;
  }
  if (knownConnecting && !/postank|stop|via|prek/i.test(raw)) {
    return built;
  }
  return raw;
}
