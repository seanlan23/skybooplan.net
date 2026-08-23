/**
 * Honest return-flight copy for AI plan cards.
 * Never claim "direct" unless stop count is explicitly 0.
 */

import { planLangCopy } from "@/lib/planLangCopy";

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
  const lang = opts.language;
  const from = opts.fromIata.toUpperCase();
  const to = opts.toIata.toUpperCase();
  const via = opts.via?.replace(/,/g, ", ");
  const times =
    opts.depart && opts.arrive
      ? planLangCopy(lang, {
          sl: ` Odhod ${opts.depart}, prihod ${opts.arrive} (lokalni časi).`,
          en: ` Depart ${opts.depart}, arrive ${opts.arrive} (local times).`,
          de: ` Abflug ${opts.depart}, Ankunft ${opts.arrive} (Ortszeit).`,
        })
      : "";

  if (opts.stops === 0) {
    return planLangCopy(lang, {
      sl: `Direktni let ${from} → ${to}.${times}`,
      en: `Direct flight from ${from} to ${to}.${times}`,
      de: `Direktflug ${from} → ${to}.${times}`,
    });
  }

  if (opts.stops != null && opts.stops > 0) {
    const stopLabel =
      opts.stops === 1
        ? planLangCopy(lang, {
            sl: "1 postankom",
            en: "1 stop",
            de: "1 Zwischenstopp",
          })
        : planLangCopy(lang, {
            sl: `${opts.stops} postanki`,
            en: `${opts.stops} stops`,
            de: `${opts.stops} Zwischenstopps`,
          });
    const viaBit = via
      ? planLangCopy(lang, {
          sl: ` prek ${via}`,
          en: ` via ${via}`,
          de: ` über ${via}`,
        })
      : "";
    return planLangCopy(lang, {
      sl: `Let ${from} → ${to} z ${stopLabel}${viaBit}.${times}`,
      en: `Flight ${from} → ${to} with ${stopLabel}${viaBit}.${times}`,
      de: `Flug ${from} → ${to} mit ${stopLabel}${viaBit}.${times}`,
    });
  }

  // Unknown stop count — never claim direct.
  return planLangCopy(lang, {
    sl: `Mednarodni let ${from} → ${to}.${times}`,
    en: `International flight from ${from} to ${to}.${times}`,
    de: `Internationaler Flug ${from} → ${to}.${times}`,
  });
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
