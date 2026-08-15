import { fetchHeroPhoto } from "@/lib/heroPhotos";
import { publishFacebookPagePhoto, readFacebookPageConfig } from "@/lib/facebookPage.server";
import {
  formatFacebookCaption,
  pickSocialCatalogItem,
  type SocialCatalogItem,
  type SocialChannel,
} from "@/lib/socialCatalog";

export type SocialPublishResult =
  | {
      ok: true;
      skipped?: false;
      dryRun: boolean;
      channel: SocialChannel;
      item: SocialCatalogItem;
      caption: string;
      facebook?: { id: string; postId?: string };
    }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; error: string };

export async function runSocialPost(opts: {
  channel?: SocialChannel;
  dryRun?: boolean;
  index?: number;
}): Promise<SocialPublishResult> {
  const channel = opts.channel ?? "facebook";
  if (channel !== "facebook") {
    return { ok: false, error: `Channel ${channel} is not wired yet.` };
  }

  const item = pickSocialCatalogItem(new Date(), opts.index);
  const photo = await fetchHeroPhoto(item.unsplashQuery, {
    pageSeed: opts.index ?? Math.floor(Date.now() / 86_400_000),
  });
  const imageUrl = photo.url || item.imageUrl;
  const credit = photo.photographer
    ? `Photo: ${photo.photographer} / Unsplash`
    : undefined;
  const caption = formatFacebookCaption({ ...item, imageUrl }, credit);

  if (opts.dryRun) {
    return { ok: true, dryRun: true, channel, item: { ...item, imageUrl }, caption };
  }

  const fb = readFacebookPageConfig();
  if (!fb) {
    return {
      ok: true,
      skipped: true,
      reason: "FACEBOOK_PAGE_ID or FACEBOOK_PAGE_ACCESS_TOKEN is not set.",
    };
  }

  try {
    const published = await publishFacebookPagePhoto({
      pageId: fb.pageId,
      accessToken: fb.accessToken,
      imageUrl,
      caption,
    });
    return {
      ok: true,
      dryRun: false,
      channel,
      item: { ...item, imageUrl },
      caption,
      facebook: published,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Facebook publish failed.",
    };
  }
}

export function isCronAuthorized(request: Request): boolean {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}
