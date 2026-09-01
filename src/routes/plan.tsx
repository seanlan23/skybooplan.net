import { Component, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { AiPlanView } from "@/components/AiPlanView";
import { PackageDeck, PackagePlanDetails } from "@/components/PackageCard";
import {
  absoluteShareUrl,
  buildShareOgMeta,
  buildSharePlanPath,
  parseSharePlanSearch,
  resolveSharePlanSearch,
  type SharePlanParams,
} from "@/lib/sharePlan";
import { fetchSharedPackageSnapshot } from "@/lib/fetchSharedPackage";
import { resortPackagesFromPlan } from "@/lib/resortPackage";
import { matchResortPackageId, resolveStayForPackageDetails } from "@/lib/resortStayFallback";
import { unquoteShareValue, type SharedPackageSnapshot } from "@/lib/sharedPackageSnapshot";
import { useI18n } from "@/lib/i18n";

function SharedPlanError() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 py-8">
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
      </main>
      <SiteFooter />
    </div>
  );
}

class ShareViewBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.error("[plan] shared view crashed", err);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export const Route = createFileRoute("/plan")({
  validateSearch: (search: Record<string, unknown>) => parseSharePlanSearch(search ?? {}),
  loader: async ({ search, location }) => {
    const params = resolveSharePlanSearch(search, location.href || location.searchStr);
    const snapshot = await fetchSharedPackageSnapshot(
      params,
      location.href || location.searchStr,
    );
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
  errorComponent: SharedPlanError,
});

function SharedPlanFallback({
  snapshot,
  search,
  guests,
  hotelId,
}: {
  snapshot: SharedPackageSnapshot;
  search: SharePlanParams;
  guests: number;
  hotelId?: string;
}) {
  const { lang } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(
    () => unquoteShareValue(hotelId ?? "") || null,
  );
  const plan = snapshot.plan;
  const packages = resortPackagesFromPlan(plan, {
    pax: guests,
    adults: guests,
    flightTotalEur: plan.flightTotalEur,
    departDate: snapshot.params.depart ?? search.depart,
    returnDate: snapshot.params.return ?? search.return,
    destinationIata: snapshot.params.to ?? search.to ?? plan.destinationIata,
  });
  const selected = matchResortPackageId(packages, selectedId);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-foreground">{plan.destinationName}</h1>
      <PackageDeck
        packages={packages}
        selectedId={selected?.id}
        onSelect={(id) => setSelectedId(id)}
      />
      {selected ? (
        <div id="package-plan-details">
          <PackagePlanDetails
            stay={resolveStayForPackageDetails(
              plan.resortStay,
              {
                destinationIata: snapshot.params.to ?? search.to ?? plan.destinationIata,
                destinationName: plan.destinationName,
                destinationPlace: plan.destinationPlace,
              },
              lang,
            )}
            pkg={selected}
          />
        </div>
      ) : null}
    </div>
  );
}

function SharedPlanPage() {
  const { t } = useI18n();
  const { snapshot: loaded, search } = Route.useLoaderData();
  const [snapshot, setSnapshot] = useState<SharedPackageSnapshot | null>(loaded);
  const [downloading, setDownloading] = useState(false);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    setSnapshot(loaded);
  }, [loaded]);

  useEffect(() => {
    if (snapshot?.plan) return;
    void fetchSharedPackageSnapshot(search).then((next) => {
      if (next?.plan) setSnapshot(next);
    });
  }, [snapshot?.plan, search.s, search.hotelId, search.to, search.depart]);

  const plan = snapshot?.plan ?? null;
  const hotelId = snapshot?.params.hotelId ?? search.hotelId;
  const guests = snapshot?.params.guests ?? search.guests ?? 2;

  const downloadPdf = async () => {
    if (!plan) return;
    setDownloading(true);
    try {
      const { generatePlanPdf, offerPdfDownload } = await import("@/lib/pdf-export");
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

  const fallback = useMemo(
    () =>
      snapshot ? (
        <SharedPlanFallback snapshot={snapshot} search={search} guests={guests} hotelId={hotelId} />
      ) : null,
    [snapshot, search, guests, hotelId],
  );

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 py-8">
        {plan ? (
          <ShareViewBoundary fallback={fallback}>
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
          </ShareViewBoundary>
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
