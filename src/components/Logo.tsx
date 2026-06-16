import { cn } from "@/lib/utils";

const SKY_BLUE = "#0EA5E9";
const SKY_BLUE_DARK = "#0284C7";
const SKY_BLUE_LIGHT = "#7DD3FC";

const SIZE_CONFIG = {
  sm: { fontPx: 20, iconPx: 28, taglinePx: 9, gap: "gap-2.5", pad: "py-1", wordWeight: "font-bold" },
  md: { fontPx: 28, iconPx: 32, taglinePx: 11, gap: "gap-3", pad: "", wordWeight: "font-bold" },
  lg: { fontPx: 36, iconPx: 44, taglinePx: 14, gap: "gap-4", pad: "py-2", wordWeight: "font-bold" },
} as const;

export type LogoSize = keyof typeof SIZE_CONFIG;

export function LogoMark({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <path fill={SKY_BLUE} d="M8 36 L40 8 L40 24 Z" />
      <path fill={SKY_BLUE_LIGHT} d="M8 36 L40 24 L22 36 Z" />
      <path fill={SKY_BLUE_DARK} d="M22 36 L40 24 L40 38 Z" />
    </svg>
  );
}

export function Logo({
  size = "md",
  showTagline = false,
  className,
}: {
  size?: LogoSize;
  showTagline?: boolean;
  className?: string;
}) {
  const cfg = SIZE_CONFIG[size];

  return (
    <div
      className={cn(
        "inline-flex items-center",
        size === "md" && !showTagline && "h-11",
        cfg.gap,
        cfg.pad,
        className,
      )}
    >
      <LogoMark size={cfg.iconPx} className="shrink-0 self-center" />
      <div className="flex min-w-0 flex-col justify-center">
        <div
          className="whitespace-nowrap leading-none"
          style={{ fontSize: cfg.fontPx, letterSpacing: "-0.5px" }}
        >
          <span className={cn(cfg.wordWeight, "text-current")}>sky</span>
          <span className="font-light" style={{ color: SKY_BLUE }}>
            boo
          </span>
          <span className={cn(cfg.wordWeight, "text-current")}>plan</span>
        </div>
        {showTagline ? (
          <span
            className="mt-1.5 whitespace-nowrap font-medium uppercase text-muted-foreground"
            style={{ fontSize: cfg.taglinePx, letterSpacing: "3px" }}
          >
            AI TRAVEL AGENT
          </span>
        ) : null}
      </div>
    </div>
  );
}
