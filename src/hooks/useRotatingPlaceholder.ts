import { useEffect, useState } from "react";

type UseRotatingPlaceholderOptions = {
  items: string[];
  enabled: boolean;
  intervalMs?: number;
  fadeMs?: number;
};

export function useRotatingPlaceholder({
  items,
  enabled,
  intervalMs = 3000,
  fadeMs = 500,
}: UseRotatingPlaceholderOptions) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!enabled) {
      setIndex(0);
      setVisible(true);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled || items.length <= 1) return;

    let fadeTimeout: ReturnType<typeof setTimeout> | undefined;

    const interval = setInterval(() => {
      setVisible(false);
      fadeTimeout = setTimeout(() => {
        setIndex((current) => (current + 1) % items.length);
        setVisible(true);
      }, fadeMs);
    }, intervalMs);

    return () => {
      clearInterval(interval);
      if (fadeTimeout) clearTimeout(fadeTimeout);
    };
  }, [enabled, items.length, intervalMs, fadeMs]);

  const text = items[index] ?? items[0] ?? "";

  return { text, visible };
}
