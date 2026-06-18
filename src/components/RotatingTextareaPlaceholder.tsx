import { useRotatingPlaceholder } from "@/hooks/useRotatingPlaceholder";
import { cn } from "@/lib/utils";

export function RotatingTextareaPlaceholder({
  items,
  active,
  className,
}: {
  items: string[];
  active: boolean;
  className?: string;
}) {
  const { text, visible } = useRotatingPlaceholder({
    items,
    enabled: active && items.length > 1,
  });

  if (!active) return null;

  return (
    <div
      className={cn("pointer-events-none absolute inset-0 z-0 overflow-hidden", className)}
      aria-hidden
    >
      <span
        className={cn(
          "block transition-opacity duration-500 ease-in-out text-white/60",
          visible ? "opacity-100" : "opacity-0",
        )}
      >
        {text}
      </span>
    </div>
  );
}
