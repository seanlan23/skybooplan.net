import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getDestinationContext,
  type DestinationContext,
} from "@/lib/tripContext.functions";

export type DestinationContextOpts = {
  returnDate?: string;
  priorities?: string[];
  wishes?: string;
};

export function useDestinationContext(
  destinationIata: string | undefined,
  tripDate: string | undefined,
  language = "sl",
  extra?: DestinationContextOpts,
) {
  const fn = useServerFn(getDestinationContext);
  const [ctx, setCtx] = useState<DestinationContext | null>(null);
  const [loading, setLoading] = useState(false);

  const returnDate = extra?.returnDate;
  const prioritiesKey = extra?.priorities?.join(",") ?? "";
  const wishes = extra?.wishes;

  useEffect(() => {
    if (!destinationIata || !tripDate) {
      setCtx(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fn({
      data: {
        destinationIata,
        tripDate,
        returnDate: returnDate || undefined,
        language,
        priorities: extra?.priorities,
        wishes: wishes?.trim() || undefined,
      },
    })
      .then((res) => {
        if (!cancelled) setCtx(res);
      })
      .catch(() => {
        if (!cancelled) setCtx(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [destinationIata, tripDate, language, returnDate, prioritiesKey, wishes, fn]);

  return { ctx, loading };
}
