export type InspirationCardDef = {
  id: string;
  emoji: string;
  /** English search destination — stable across languages. */
  destination: string;
  titleKey: string;
  /** Fixed curated photo — no API dependency (reliable on cards). */
  imageUrl: string;
};

export const INSPIRATION_VISIBLE_COUNT = 6;
export const INSPIRATION_ROTATE_MS = 4 * 60 * 60 * 1000;

const unsplash = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=80`;

export const INSPIRATION_CARDS: InspirationCardDef[] = [
  {
    id: "paris",
    emoji: "🗼",
    destination: "Paris",
    titleKey: "inspiration.paris.title",
    imageUrl: unsplash("photo-1502602898657-3e91760cbb34"),
  },
  {
    id: "slovenia",
    emoji: "🏔️",
    destination: "Slovenia",
    titleKey: "inspiration.slovenia.title",
    imageUrl: unsplash("photo-1478088913771-e3a36f50bb63"),
  },
  {
    id: "dubai",
    emoji: "🏙️",
    destination: "Dubai",
    titleKey: "inspiration.dubai.title",
    imageUrl: unsplash("photo-1518684079-3c830dcef090"),
  },
  {
    id: "tanzania",
    emoji: "🦁",
    destination: "Tanzania",
    titleKey: "inspiration.tanzania.title",
    imageUrl: unsplash("photo-1516426122078-c23e76319801"),
  },
  {
    id: "asia",
    emoji: "🌴",
    destination: "Bali",
    titleKey: "inspiration.asia.title",
    imageUrl: unsplash("photo-1537953773345-d172ccf13cf1"),
  },
  {
    id: "croatia",
    emoji: "🌊",
    destination: "Croatia",
    titleKey: "inspiration.croatia.title",
    imageUrl: unsplash("photo-1523906834658-6e24ef2386f9"),
  },
  {
    id: "tokyo",
    emoji: "🏮",
    destination: "Tokyo",
    titleKey: "inspiration.tokyo.title",
    imageUrl: unsplash("photo-1540959733332-eab4deabeeaf"),
  },
  {
    id: "iceland",
    emoji: "🌋",
    destination: "Iceland",
    titleKey: "inspiration.iceland.title",
    imageUrl: unsplash("photo-1476610182048-b716b8518aae"),
  },
  {
    id: "newyork",
    emoji: "🗽",
    destination: "New York",
    titleKey: "inspiration.newyork.title",
    imageUrl: unsplash("photo-1496442226666-8d4d0e62e6e9"),
  },
  {
    id: "lisbon",
    emoji: "🚋",
    destination: "Lisbon",
    titleKey: "inspiration.lisbon.title",
    imageUrl: unsplash("photo-1555881400-74d7acaacd8b"),
  },
  {
    id: "rome",
    emoji: "🏛️",
    destination: "Rome",
    titleKey: "inspiration.rome.title",
    imageUrl: unsplash("photo-1552832230-c0197dd311b5"),
  },
  {
    id: "capetown",
    emoji: "🐧",
    destination: "Cape Town",
    titleKey: "inspiration.capetown.title",
    imageUrl: unsplash("photo-1580060839134-75a5edca2e99"),
  },
  {
    id: "greece",
    emoji: "💙",
    destination: "Santorini",
    titleKey: "inspiration.greece.title",
    imageUrl: unsplash("photo-1570077188670-e3a8d69ac5ff"),
  },
  {
    id: "kyoto",
    emoji: "⛩️",
    destination: "Kyoto",
    titleKey: "inspiration.kyoto.title",
    imageUrl: unsplash("photo-1493976040374-85c8e12f0c0e"),
  },
  {
    id: "thailand",
    emoji: "🏝️",
    destination: "Thailand",
    titleKey: "inspiration.thailand.title",
    imageUrl: unsplash("photo-1552465011-b4e21bf6e79a"),
  },
  {
    id: "morocco",
    emoji: "🕌",
    destination: "Marrakech",
    titleKey: "inspiration.morocco.title",
    imageUrl: unsplash("photo-1489749798305-4fea3ae63d43"),
  },
];

export function inspirationSlotIndex(nowMs: number): number {
  return Math.floor(nowMs / INSPIRATION_ROTATE_MS);
}

export function msUntilNextInspirationSlot(nowMs: number): number {
  const next = (inspirationSlotIndex(nowMs) + 1) * INSPIRATION_ROTATE_MS;
  return Math.max(1, next - nowMs);
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Same 4-hour UTC window → same cards for every visitor. */
export function pickVisibleInspirationCards(
  nowMs: number,
  pool: InspirationCardDef[] = INSPIRATION_CARDS,
  visible = INSPIRATION_VISIBLE_COUNT,
): InspirationCardDef[] {
  const count = Math.min(visible, pool.length);
  const rng = mulberry32(inspirationSlotIndex(nowMs) + 1);
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const swap = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = swap;
  }
  return shuffled.slice(0, count);
}
