/** Keys for rotating "Did you know?" tips during AI plan generation. */
export const AI_PLAN_TIP_KEYS = [
  "aiplan.tip1",
  "aiplan.tip2",
  "aiplan.tip3",
  "aiplan.tip4",
  "aiplan.tip5",
  "aiplan.tip6",
  "aiplan.tip7",
  "aiplan.tip8",
  "aiplan.tip9",
  "aiplan.tip10",
  "aiplan.tip11",
  "aiplan.tip12",
  "aiplan.tip13",
  "aiplan.tip14",
  "aiplan.tip15",
  "aiplan.tip16",
  "aiplan.tip17",
  "aiplan.tip18",
  "aiplan.tip19",
  "aiplan.tip20",
  "aiplan.tip21",
  "aiplan.tip22",
  "aiplan.tip23",
  "aiplan.tip24",
] as const;

export type AiPlanTipScope =
  | "any"
  | "europe"
  | "thailand"
  | "japan"
  | "spain"
  | "italy"
  | "tropical";

export type AiPlanTip = {
  key: (typeof AI_PLAN_TIP_KEYS)[number];
  scope: AiPlanTipScope;
};

/** Place-tagged tips only show when destination matches; `any` always allowed. */
export const AI_PLAN_TIPS: AiPlanTip[] = [
  { key: "aiplan.tip1", scope: "any" },
  { key: "aiplan.tip2", scope: "any" },
  { key: "aiplan.tip3", scope: "any" },
  { key: "aiplan.tip4", scope: "any" },
  { key: "aiplan.tip5", scope: "any" },
  { key: "aiplan.tip6", scope: "any" },
  { key: "aiplan.tip7", scope: "any" },
  { key: "aiplan.tip8", scope: "europe" },
  { key: "aiplan.tip9", scope: "any" },
  { key: "aiplan.tip10", scope: "any" },
  { key: "aiplan.tip11", scope: "thailand" },
  { key: "aiplan.tip12", scope: "tropical" },
  { key: "aiplan.tip13", scope: "any" },
  { key: "aiplan.tip14", scope: "any" },
  { key: "aiplan.tip15", scope: "any" },
  { key: "aiplan.tip16", scope: "japan" },
  { key: "aiplan.tip17", scope: "any" },
  { key: "aiplan.tip18", scope: "spain" },
  { key: "aiplan.tip19", scope: "tropical" },
  { key: "aiplan.tip20", scope: "italy" },
  { key: "aiplan.tip21", scope: "any" },
  { key: "aiplan.tip22", scope: "any" },
  { key: "aiplan.tip23", scope: "any" },
  { key: "aiplan.tip24", scope: "any" },
];

export function tipScopesForDestination(destination?: string | null): Set<AiPlanTipScope> {
  const raw = (destination ?? "").trim();
  const d = raw.toLowerCase();
  const code = raw.toUpperCase();
  const scopes = new Set<AiPlanTipScope>(["any"]);
  if (!d) return scopes;

  if (
    /thail|bangkok|phuket|krabi|chiang|koh |lipe|samui|ayutthaya|railay|ao nang|tajsk/.test(d) ||
    /^(BKK|DMK|HKT|KBV|CNX|UTP|HDY|USM|CEI)$/.test(code)
  ) {
    scopes.add("thailand");
    scopes.add("tropical");
  }
  if (/japan|tokyo|osaka|kyoto|japonsk/.test(d) || /^(NRT|HND|KIX|ITM|FUK|CTS)$/.test(code)) {
    scopes.add("japan");
  }
  if (
    /spain|barcelona|madrid|seville|valencia|španij|spanij/.test(d) ||
    /^(BCN|MAD|AGP|PMI|ALC)$/.test(code)
  ) {
    scopes.add("spain");
  }
  if (
    /italy|rome|roma|milan|florence|venice|italij|\brim\b/.test(d) ||
    /^(FCO|CIA|MXP|LIN|VCE|FLR|NAP)$/.test(code)
  ) {
    scopes.add("italy");
  }
  if (
    /europe|paris|london|berlin|amsterdam|vienna|munich|münchen|ljubljana|zagreb|prague|portugal|greece|croatia|hrvaš|pariz|dunaj/.test(
      d,
    ) ||
    /^(CDG|ORY|LHR|LGW|BER|AMS|VIE|MUC|LJU|ZAG|PRG|ATH|LIS)$/.test(code)
  ) {
    scopes.add("europe");
  }
  if (
    /bali|vietnam|philippines|indonesia|malaysia|maldives|caribbean|mexico|brazil|costa rica/.test(d) ||
    /^(DPS|SGN|HAN|MNL|KUL|MLE|CUN|GRU)$/.test(code)
  ) {
    scopes.add("tropical");
  }
  return scopes;
}

export function tipKeysForDestination(destination?: string | null): string[] {
  const allowed = tipScopesForDestination(destination);
  return AI_PLAN_TIPS.filter((tip) => allowed.has(tip.scope)).map((tip) => tip.key);
}

export function shuffleTipOrder(length: number, startIdx = 0): number[] {
  const order = Array.from({ length }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  if (length > 1 && order[0] === startIdx) {
    [order[0], order[1]] = [order[1]!, order[0]!];
  }
  return order;
}
