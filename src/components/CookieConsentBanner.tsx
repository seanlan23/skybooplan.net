import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import {
  getCookieConsent,
  setCookieConsent,
  type CookieConsentChoice,
} from "@/lib/cookieConsent";

export function CookieConsentBanner() {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (getCookieConsent() == null) {
      setVisible(true);
    }
  }, []);

  function accept(choice: CookieConsentChoice) {
    setCookieConsent(choice);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={t("cookieConsent.label" as never)}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-black/85 text-white backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-3 py-2 sm:gap-4 sm:px-5">
        <p className="min-w-0 flex-1 text-[11px] leading-snug text-white/90 sm:text-xs">
          {t("cookieConsent.message" as never)}{" "}
          <Link to="/privacy" className="underline decoration-white/40 underline-offset-2 hover:text-white">
            {t("footer.privacy" as never)}
          </Link>
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => accept("all")}
            className="rounded-full bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700 sm:px-3.5 sm:text-xs"
          >
            {t("cookieConsent.acceptAll" as never)}
          </button>
          <button
            type="button"
            onClick={() => accept("essential")}
            className="rounded-full bg-white/10 px-2.5 py-1.5 text-[11px] font-medium text-white/90 hover:bg-white/15 sm:text-xs"
          >
            {t("cookieConsent.essential" as never)}
          </button>
        </div>
      </div>
    </div>
  );
}
