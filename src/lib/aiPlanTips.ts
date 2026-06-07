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
