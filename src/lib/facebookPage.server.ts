const GRAPH = "https://graph.facebook.com/v21.0";

export function readFacebookPageConfig(): {
  pageId: string;
  accessToken: string;
} | null {
  const pageId = (process.env.FACEBOOK_PAGE_ID ?? "").trim();
  const accessToken = (process.env.FACEBOOK_PAGE_ACCESS_TOKEN ?? "").trim();
  if (!pageId || !accessToken) return null;
  return { pageId, accessToken };
}

export async function publishFacebookPagePhoto(opts: {
  pageId: string;
  accessToken: string;
  imageUrl: string;
  caption: string;
}): Promise<{ id: string; postId?: string }> {
  const url = new URL(`${GRAPH}/${opts.pageId}/photos`);
  url.searchParams.set("url", opts.imageUrl);
  url.searchParams.set("caption", opts.caption);
  url.searchParams.set("access_token", opts.accessToken);

  const res = await fetch(url, { method: "POST" });
  const body = (await res.json()) as {
    id?: string;
    post_id?: string;
    error?: { message?: string };
  };
  if (!res.ok || !body.id) {
    throw new Error(body.error?.message || `Facebook publish failed (${res.status})`);
  }
  return { id: body.id, postId: body.post_id };
}
