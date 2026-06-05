import { createServerFn } from "@tanstack/react-start";

export const getMapboxToken = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ token: string | null }> => {
    const token = process.env.MAPBOX_PUBLIC_TOKEN ?? null;
    return { token };
  }
);
