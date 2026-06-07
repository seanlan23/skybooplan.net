import { z } from "zod";

export type FlightSliceInput = {
  from: string;
  to: string;
  departDate: string;
};

export const FlightSliceSchema = z.object({
  from: z.string().length(3).regex(/^[A-Z]{3}$/),
  to: z.string().length(3).regex(/^[A-Z]{3}$/),
  departDate: z.string().min(10).max(10),
});

export const FlightSearchSchema = z
  .object({
    from: z.string().length(3).regex(/^[A-Z]{3}$/).optional(),
    to: z.string().length(3).regex(/^[A-Z]{3}$/).optional(),
    departDate: z.string().min(10).max(10).optional(),
    returnDate: z.string().min(10).max(10).optional().or(z.literal("")),
    tripType: z.enum(["return", "oneway", "multicity"]).optional(),
    slices: z.array(FlightSliceSchema).min(2).max(6).optional(),
    pax: z.number().min(1).max(9),
    cabinClass: z.enum(["economy", "premium_economy", "business", "first"]).optional(),
  })
  .superRefine((data, ctx) => {
    const multi = data.tripType === "multicity" || (data.slices?.length ?? 0) >= 2;
    if (multi) {
      if (!data.slices || data.slices.length < 2) {
        ctx.addIssue({ code: "custom", message: "multicity requires at least 2 legs" });
        return;
      }
      for (let i = 1; i < data.slices.length; i++) {
        const prev = data.slices[i - 1]!.departDate;
        const cur = data.slices[i]!.departDate;
        if (cur < prev) {
          ctx.addIssue({ code: "custom", message: "leg dates must be ascending" });
        }
      }
      return;
    }
    if (!data.from || !data.to || !data.departDate) {
      ctx.addIssue({ code: "custom", message: "from, to and departDate required" });
    }
    if (data.tripType === "return" && !data.returnDate?.trim()) {
      ctx.addIssue({ code: "custom", message: "returnDate required" });
    }
    if (data.returnDate && data.departDate && data.returnDate <= data.departDate) {
      ctx.addIssue({ code: "custom", message: "return before depart" });
    }
  });

export type FlightSearchInput = z.infer<typeof FlightSearchSchema>;

/** Build Duffel API slices from classic or multi-city input. */
export function buildDuffelSlices(data: FlightSearchInput): Array<{
  origin: string;
  destination: string;
  departure_date: string;
}> {
  if (data.slices && data.slices.length >= 2) {
    return data.slices.map((s) => ({
      origin: s.from,
      destination: s.to,
      departure_date: s.departDate,
    }));
  }
  const slices = [
    {
      origin: data.from!,
      destination: data.to!,
      departure_date: data.departDate!,
    },
  ];
  if (data.returnDate?.trim()) {
    slices.push({
      origin: data.to!,
      destination: data.from!,
      departure_date: data.returnDate,
    });
  }
  return slices;
}

export function isMultiCitySearch(data: Pick<FlightSearchInput, "tripType" | "slices">): boolean {
  return data.tripType === "multicity" || (data.slices?.length ?? 0) >= 2;
}

export function isClassicRoundTrip(
  outbound: { from: string; to: string },
  inbound?: { from: string; to: string },
): boolean {
  if (!inbound) return false;
  return inbound.from === outbound.to && inbound.to === outbound.from;
}

/** Endpoints for the return / second slice — open-jaw uses actual leg IATA codes. */
export function resolveInboundRoute(
  outbound: { from: string; to: string },
  inbound?: { from: string; to: string },
  tripKind?: "oneway" | "roundtrip" | "multicity",
): { from: string; to: string } | undefined {
  if (!inbound) return undefined;
  if (tripKind === "roundtrip" || isClassicRoundTrip(outbound, inbound)) {
    return { from: outbound.to, to: outbound.from };
  }
  return { from: inbound.from, to: inbound.to };
}
