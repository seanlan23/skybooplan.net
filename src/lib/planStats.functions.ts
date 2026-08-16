import { createServerFn } from "@tanstack/react-start";

export const getPublicPlanCount = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ count: number }> => {
    const { readPublicPlansGenerated } = await import("@/lib/planStats.server");
    const count = await readPublicPlansGenerated();
    return { count };
  },
);
