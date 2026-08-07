import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "skybooplan.pwa.installDismissed";
const DISMISS_MS = 1000 * 60 * 60 * 24 * 21; // 21 days

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    nav.standalone === true ||
    document.referrer.startsWith("android-app://")
  );
}

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/.test(ua);
  const chrome = /CriOS|FxiOS|EdgiOS/.test(ua);
  return iOS && webkit && !chrome;
}

function wasDismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_MS;
  } catch {
    return false;
  }
}

function markDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/**
 * Install sheet — Chrome/Edge beforeinstallprompt + iOS Safari instructions.
 * iOS cannot programmatically open “Add to Home Screen”; never fake a broken CTA.
 */
export function PwaInstallPrompt() {
  const { t } = useI18n();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone() || wasDismissedRecently()) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      window.setTimeout(() => setVisible(true), 1800);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // iOS has no beforeinstallprompt — show how-to after a short delay on Safari.
    if (isIosSafari()) {
      const timer = window.setTimeout(() => {
        setIosHint(true);
        setVisible(true);
      }, 4200);
      return () => {
        window.removeEventListener("beforeinstallprompt", onBeforeInstall);
        window.clearTimeout(timer);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  if (!visible || isStandalone()) return null;

  const dismiss = () => {
    markDismissed();
    setVisible(false);
    setDeferred(null);
  };

  const install = async () => {
    if (!deferred) return;
    setBusy(true);
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      /* user cancelled */
    } finally {
      setBusy(false);
      markDismissed();
      setVisible(false);
      setDeferred(null);
    }
  };

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4"
      role="dialog"
      aria-labelledby="pwa-install-title"
      aria-describedby="pwa-install-desc"
    >
      <div
        className={cn(
          "pointer-events-auto w-full max-w-md overflow-hidden rounded-2xl",
          "border border-white/20 bg-slate-950/92 text-white shadow-[0_20px_50px_rgba(2,132,199,0.35)]",
          "backdrop-blur-xl",
          "animate-in slide-in-from-bottom-4 fade-in duration-300",
        )}
      >
        <div className="relative flex gap-3.5 p-4 sm:p-5">
          <div className="relative shrink-0">
            <img
              src="/icons/icon-192.png"
              alt=""
              width={56}
              height={56}
              className="h-14 w-14 rounded-[14px] shadow-lg ring-1 ring-white/25"
            />
            <span
              className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-sky-500 text-white shadow-md ring-2 ring-slate-950"
              aria-hidden
            >
              <Download className="h-3.5 w-3.5" strokeWidth={2.5} />
            </span>
          </div>

          <div className="min-w-0 flex-1 pr-6">
            <p
              id="pwa-install-title"
              className="text-[15px] font-semibold tracking-tight text-white"
            >
              {t("pwa.installTitle" as never)}
            </p>
            <p
              id="pwa-install-desc"
              className="mt-1 text-sm leading-relaxed text-white/70"
            >
              {iosHint
                ? t("pwa.installIosHint" as never)
                : t("pwa.installBody" as never)}
            </p>

            {iosHint ? (
              <ol className="mt-3 space-y-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-left text-xs font-medium leading-snug text-sky-50/95">
                <li className="flex gap-2">
                  <Share className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300" aria-hidden />
                  <span>{t("pwa.installIosStep1" as never)}</span>
                </li>
                <li>{t("pwa.installIosStep2" as never)}</li>
                <li>{t("pwa.installIosStep3" as never)}</li>
              </ol>
            ) : (
              <div className="mt-3.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void install()}
                  disabled={busy || !deferred}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl bg-sky-500 px-4 text-sm font-semibold text-white shadow-md transition hover:bg-sky-400 disabled:opacity-50"
                >
                  {t("pwa.installCta" as never)}
                </button>
                <button
                  type="button"
                  onClick={dismiss}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl px-3 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
                >
                  {t("pwa.installLater" as never)}
                </button>
              </div>
            )}

            {iosHint ? (
              <button
                type="button"
                onClick={dismiss}
                className="mt-3 text-xs font-medium text-white/55 underline-offset-2 hover:text-white/80 hover:underline"
              >
                {t("pwa.installLater" as never)}
              </button>
            ) : null}
          </div>

          <button
            type="button"
            onClick={dismiss}
            className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full text-white/55 transition hover:bg-white/10 hover:text-white"
            aria-label={t("poi.close" as never)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
