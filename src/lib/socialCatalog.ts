import { pickTravelFact, type TravelFact } from "@/lib/travelFacts";

export type SocialChannel = "facebook";

export type SocialCatalogItem = {
  id: string;
  titleSl: string;
  titleEn: string;
  metaSl: string;
  blurbSl: string;
  blurbEn: string;
  imageUrl: string;
  unsplashQuery: string;
  href: string;
  hashtags: string;
};

const SITE = "https://www.skybooplan.com/";

export function factToSocialItem(fact: TravelFact): SocialCatalogItem {
  return {
    id: fact.id,
    titleSl: fact.placeSl,
    titleEn: fact.placeEn,
    metaSl: "Fact dneva",
    blurbSl: fact.factSl,
    blurbEn: fact.factEn,
    imageUrl: fact.imageUrl,
    unsplashQuery: fact.unsplashQuery,
    href: SITE,
    hashtags: fact.hashtags,
  };
}

export function pickSocialCatalogItem(
  at: Date = new Date(),
  index?: number,
): SocialCatalogItem {
  return factToSocialItem(pickTravelFact(at, index));
}

export function formatFacebookCaption(
  item: SocialCatalogItem,
  credit?: string,
): string {
  const lines = [
    `Fact dneva · ${item.titleSl}`,
    `Travel fact · ${item.titleEn}`,
    "",
    item.blurbSl,
    "",
    item.blurbEn,
    "",
    "Sestavi potovanje okoli tega — brezplačno.",
    item.href,
    "",
    item.hashtags,
  ];
  if (credit) {
    lines.push("", credit);
  }
  return lines.join("\n");
}
