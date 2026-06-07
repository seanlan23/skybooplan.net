import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/gemini-pro-test")({
  beforeLoad: () => {
    throw redirect({ to: "/", hash: "ai-planner" });
  },
  component: () => null,
});
