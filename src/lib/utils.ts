import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Scroll only when the node is mostly off-screen — avoids page yanks on mobile. */
export function nudgeIntoView(
  el: HTMLElement | null,
  block: ScrollLogicalPosition = "start",
) {
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const viewTop = window.visualViewport?.offsetTop ?? 0;
  const viewH = window.visualViewport?.height ?? window.innerHeight;
  const viewBottom = viewTop + viewH;
  const titleVisible =
    rect.top < viewBottom - 24 && rect.top + 120 > viewTop + 48;
  if (titleVisible) return;
  el.scrollIntoView({ behavior: "smooth", block });
}
