import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Scroll only when the node is not already near the top of the viewport. */
export function nudgeIntoView(
  el: HTMLElement | null,
  block: ScrollLogicalPosition = "start",
  opts?: { force?: boolean },
) {
  if (!el) return;
  if (!opts?.force) {
    const rect = el.getBoundingClientRect();
    const viewTop = window.visualViewport?.offsetTop ?? 0;
    const viewH = window.visualViewport?.height ?? window.innerHeight;
    const nearTop =
      rect.top >= viewTop - 8 && rect.top <= viewTop + Math.min(160, viewH * 0.28);
    if (nearTop) return;
  }
  el.scrollIntoView({ behavior: "smooth", block });
}
