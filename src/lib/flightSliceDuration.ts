import {
  elapsedMinutesBetweenAirportLocals,
  isoHasExplicitOffset,
} from "@/lib/airportTimeZones";

/** One duration for a Duffel slice. No TZ/naive merge, no “longest wins”. */
export type DuffelSliceDurationInput = {
  duration?: string;
  segments?: Array<{
    duration?: string;
    departing_at?: string;
    arriving_at?: string;
    origin?: { iata_code?: string };
    destination?: { iata_code?: string };
  }>;
};

export function parseIso8601DurationMin(raw: string | undefined): number {
  const iso = (raw ?? "").trim().match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/i);
  if (!iso) return 0;
  return Number.parseInt(iso[1] || "0", 10) * 60 + Number.parseInt(iso[2] || "0", 10);
}

export function utcElapsedMinutes(departIso: string, arriveIso: string): number {
  const a = Date.parse(departIso);
  const b = Date.parse(arriveIso);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.round((b - a) / 60_000);
}

function firstLastElapsedMin(
  departIso: string,
  arriveIso: string,
  fromIata?: string,
  toIata?: string,
): number {
  if (isoHasExplicitOffset(departIso) && isoHasExplicitOffset(arriveIso)) {
    return utcElapsedMinutes(departIso, arriveIso);
  }
  const from = (fromIata ?? "").trim().toUpperCase();
  const to = (toIata ?? "").trim().toUpperCase();
  if (from && to) {
    const zoned = elapsedMinutesBetweenAirportLocals(departIso, arriveIso, from, to);
    if (zoned != null && zoned > 0) return zoned;
  }
  return utcElapsedMinutes(departIso, arriveIso);
}

function segmentAirMin(seg: NonNullable<DuffelSliceDurationInput["segments"]>[number]): number {
  const fromDur = parseIso8601DurationMin(seg.duration);
  if (fromDur > 0) return fromDur;
  if (seg.departing_at && seg.arriving_at) {
    return firstLastElapsedMin(
      seg.departing_at,
      seg.arriving_at,
      seg.origin?.iata_code,
      seg.destination?.iata_code,
    );
  }
  return 0;
}

/** Airborne + layover from consecutive segment timestamps. */
function chainedSliceMinutes(
  segments: NonNullable<DuffelSliceDurationInput["segments"]>,
): number {
  if (segments.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    total += segmentAirMin(seg);
    if (i === 0) continue;
    const prev = segments[i - 1]!;
    if (prev.arriving_at && seg.departing_at) {
      const lay = firstLastElapsedMin(prev.arriving_at, seg.departing_at);
      if (lay > 0) total += lay;
    }
  }
  return total > 0 ? total : 0;
}

/**
 * Duffel owns the minutes.
 * 1. `slice.duration` when it is the full total (not one hop, not a wall-clock gap).
 * 2. Else segment air + layover chain.
 * 3. Else first.departing_at → last.arriving_at (UTC if offsets exist).
 */
export function duffelSliceDurationMin(slice: DuffelSliceDurationInput): number {
  const segments = (slice.segments ?? []).filter(
    (s) => s && (s.departing_at || s.duration || s.arriving_at),
  );
  const official = parseIso8601DurationMin(slice.duration);
  const maxSeg = segments.reduce((m, s) => Math.max(m, segmentAirMin(s)), 0);
  const officialIsOneSegment =
    segments.length > 1 && official > 0 && maxSeg > 0 && official <= maxSeg + 60;

  const first = segments[0];
  const last = segments[segments.length - 1];
  const firstLast =
    first?.departing_at && last?.arriving_at
      ? firstLastElapsedMin(
          first.departing_at,
          last.arriving_at,
          first.origin?.iata_code,
          last.destination?.iata_code,
        )
      : 0;
  const chained = chainedSliceMinutes(segments);

  if (official > 0 && !officialIsOneSegment) {
    // Missing hop: NRT→FRA "11h 20m" is PEK→FRA while chain is ~15h+.
    // Keep Duffel 14h45 when chain is not 3h+ longer (westbound TZ overshoot).
    if (segments.length > 1 && chained > official + 3 * 60) return chained;
    if (official < 8 * 60 && firstLast > official + 60) return firstLast;
    if (official < 8 * 60 && chained > official + 60) return chained;
    return official;
  }
  if (chained > 0) return chained;
  if (firstLast > 0) return firstLast;
  return official;
}
