import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { AiPlanView } from "@/components/AiPlanView";
import { generatePlanPdf, offerPdfDownload } from "@/lib/pdf-export";
import {
  absoluteShareUrl,
  buildShareOgMeta,
  buildSharePlanPath,
  parseSharePlanSearch,
  resolveSharePlanSearch,
  type SharePlanParams,
} from "@/lib/sharePlan";
import { getSharedPackage } from "@/lib/sharedPackage.functions";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/plan")({
  validateSearch: (search: Record<string, unknown>) => parseSharePlanSearch(search ?? {}),
  loader: async ({ search, location }) => {
    const params = resolveSharePlanSearch(search, location.href || location.searchStr);
    const token = params.s?.trim() ?? "";
    const snapshot = token ? await getSharedPackage({ data: { id: token } }) : null;
    return { snapshot, search: params };
  },
  head: ({ loaderData }) => {
    const search = loaderData?.search ?? parseSharePlanSearch(null);
    const snapshot = loaderData?.snapshot;
    const og =
      snapshot?.og ??
      buildShareOgMeta({
        destinationIata: search.to,
        depart: search.depart,
        return: search.return,
        pricePerPerson: 0,
        lang: "sl",
      });
    const canonical = absoluteShareUrl(buildSharePlanPath(search as SharePlanParams));
    const title = og.title || "Skybooplan";
    const description = og.description;
    const image = og.image;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:image", content: image },
        { property: "og:url", content: canonical },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
      ],
      links: [{ rel: "canonical", href: canonical }],
    };
  },
  component: SharedPlanPage,
});

function SharedPlanPage() {
  const { t } = useI18n();
  const { snapshot, search } = Route.useLoaderData();
  const [downloading, setDownloading] = useState(false);
  const plan = snapshot?.plan ?? null;
  const hotelId = snapshot?.params.hotelId ?? search.hotelId;
  const guests = snapshot?.params.guests ?? search.guests ?? 2;

  const downloadPdf = async () => {
    if (!plan) return;
    setDownloading(true);
    try {
      const pdf = await generatePlanPdf({
        title: plan.destinationName,
        destination: plan.destinationPlace || plan.destinationName,
        start_date: snapshot?.params.depart ?? search.depart ?? null,
        end_date: snapshot?.params.return ?? search.return ?? null,
        itinerary: plan,
        pax: guests,
      });
      offerPdfDownload(pdf.buffer, pdf.fileName);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 py-8">
        {plan ? (
          <AiPlanView
            loading={false}
            plan={plan}
            error={null}
            pax={guests}
            destinationIata={snapshot?.params.to ?? search.to ?? plan.destinationIata}
            departDate={snapshot?.params.depart ?? search.depart}
            returnDate={snapshot?.params.return ?? search.return}
            flights={plan.flightContext}
            flightTotalEur={plan.flightTotalEur}
            initialSelectedPackageId={hotelId}
            onDownloadClick={downloading ? undefined : () => void downloadPdf()}
          />
        ) : (
          <div className="mx-auto max-w-lg rounded-3xl border border-border bg-card px-6 py-12 text-center shadow-sm">
            <p className="text-lg font-semibold text-foreground">
              {t("share.plan.missing" as never)}
            </p>
            <Link
              to="/"
              className="mt-6 inline-flex items-center justify-center rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
            >
              {t("share.plan.cta" as never)}
            </Link>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
