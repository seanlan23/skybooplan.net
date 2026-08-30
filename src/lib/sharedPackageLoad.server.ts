import {
  asShareGuests,
  asShareIata,
  asShareIsoDate,
  asShareStyle,
  type ShareOgMeta,
  type SharePlanParams,
} from "@/lib/sharePlan";
import {
  destinationNameFromOgTitle,
  normalizeShareToken,
  planFromSharePayload,
  unquoteShareValue,
  type SharedPackageSnapshot,
} from "@/lib/sharedPackageSnapshot";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import { createSharedPackagesClient } from "@/lib/sharedPackageDb.server";

const ShareRowSelect =
  "id, payload, og_title, og_description, og_image, from_iata, to_iata, depart_date, return_date, trip_style, hotel_id, guests" as const;

type SharedPackageRow = {
  id: string;
  payload: unknown;
  og_title: string;
  og_description: string;
  og_image: string | null;
  from_iata: string | null;
  to_iata: string | null;
  depart_date: string | null;
  return_date: string | null;
  trip_style: string | null;
  hotel_id: string | null;
  guests: number | null;
};

function snapshotFromRow(row: SharedPackageRow): SharedPackageSnapshot {
  const payload = (row.payload ?? {}) as {
    plan?: AiTripPlan;
    params?: SharePlanParams;
    og?: ShareOgMeta;
  };
  const plan = planFromSharePayload(payload.plan, {
    destinationName: destinationNameFromOgTitle(row.og_title),
    destinationIata: row.to_iata ?? undefined,
    originIata: row.from_iata ?? undefined,
    tripStyle: row.trip_style,
  });
  return {
    id: row.id,
    plan,
    params: {
      from: asShareIata(row.from_iata) ?? payload.params?.from,
      to: asShareIata(row.to_iata) ?? payload.params?.to,
      depart: asShareIsoDate(row.depart_date) ?? payload.params?.depart,
      return: asShareIsoDate(row.return_date) ?? payload.params?.return,
      style: asShareStyle(row.trip_style) ?? payload.params?.style,
      hotelId: unquoteShareValue(row.hotel_id ?? payload.params?.hotelId ?? "") || undefined,
      guests: asShareGuests(row.guests) ?? payload.params?.guests,
      s: row.id,
    },
    og: {
      title: row.og_title || payload.og?.title || plan.destinationName,
      description: row.og_description || payload.og?.description || "",
      image: row.og_image || payload.og?.image || "",
    },
  };
}

export async function loadSharedPackageSnapshot(opts: {
  id?: string;
  hotelId?: string;
  to?: string;
  depart?: string;
}): Promise<SharedPackageSnapshot | null> {
  const id = normalizeShareToken(opts.id ?? "");
  const hotelId = unquoteShareValue(opts.hotelId ?? "");
  const to = asShareIata(opts.to);
  const depart = asShareIsoDate(opts.depart);
  const db = createSharedPackagesClient();

  if (/^[a-zA-Z0-9_-]{6,32}$/.test(id)) {
    const { data: row, error } = await db
      .from("shared_packages")
      .select(ShareRowSelect)
      .eq("id", id)
      .maybeSingle();
    if (error) console.error("[sharedPackage] load by id failed:", error.message);
    if (row) return snapshotFromRow(row as SharedPackageRow);
  }

  if (hotelId) {
    const ids = [...new Set([hotelId, `"${hotelId}"`])];
    for (const hid of ids) {
      let query = db.from("shared_packages").select(ShareRowSelect).eq("hotel_id", hid);
      if (to) query = query.eq("to_iata", to);
      if (depart) query = query.eq("depart_date", depart);
      const { data: row, error } = await query
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) console.error("[sharedPackage] load by hotel failed:", error.message);
      if (row) return snapshotFromRow(row as SharedPackageRow);
    }
  }

  return null;
}
