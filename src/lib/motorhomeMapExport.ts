import type { AiTripPlan } from "@/lib/aiPlan.functions";
import {
  collectMotorhomeMapStops,
  type MotorhomeMapStop,
} from "@/lib/motorhomeRoute";

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** KML placemarks for overnight / start / return — open in Google My Maps for titled pins + notes. */
export function buildMotorhomeStopsKml(
  stops: MotorhomeMapStop[],
  opts?: { tripName?: string },
): string {
  const name = xmlEscape(opts?.tripName?.trim() || "Skybooplan motorhome");
  const placemarks = stops
    .filter((s) => s.lat != null && s.lng != null)
    .map((s, i) => {
      const title = xmlEscape(s.title);
      const desc = xmlEscape(
        [s.note, s.placeQuery !== s.title ? s.placeQuery : ""]
          .filter(Boolean)
          .join("\n\n"),
      );
      return `    <Placemark>
      <name>${i + 1}. ${title}</name>
      <description>${desc}</description>
      <Point><coordinates>${s.lng},${s.lat},0</coordinates></Point>
    </Placemark>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${name}</name>
    <description>Overnight stops from Skybooplan. Import into Google My Maps for pins with notes.</description>
${placemarks}
  </Document>
</kml>
`;
}

export function motorhomeStopsKmlFromPlan(plan: AiTripPlan, lang = "sl"): string {
  const stops = collectMotorhomeMapStops(plan, lang);
  return buildMotorhomeStopsKml(stops, {
    tripName: plan.destinationName || "Skybooplan",
  });
}

export function downloadMotorhomeStopsKml(plan: AiTripPlan, lang = "sl"): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  const stops = collectMotorhomeMapStops(plan, lang);
  const withCoords = stops.filter((s) => s.lat != null && s.lng != null);
  if (withCoords.length < 1) return false;
  const kml = buildMotorhomeStopsKml(stops, {
    tripName: plan.destinationName || "Skybooplan",
  });
  const blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safe = (plan.destinationName || "route").replace(/[^\w\-]+/g, "_").slice(0, 40);
  a.href = url;
  a.download = `skybooplan-${safe}-stops.kml`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return true;
}

export function countMotorhomeStopsWithCoords(plan: AiTripPlan, lang = "sl"): number {
  return collectMotorhomeMapStops(plan, lang).filter((s) => s.lat != null && s.lng != null).length;
}
