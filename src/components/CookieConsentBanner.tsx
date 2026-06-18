import { useEffect, useState } from "react";
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
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-black/80 text-white backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6 sm:py-5">
        <p className="text-sm leading-relaxed text-white sm:max-w-2xl sm:text-[15px]">
          {t("cookieConsent.message" as never)}
        </p>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => accept("all")}
            className="rounded-full bg-blue-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            {t("cookieConsent.acceptAll" as never)}
          </button>
          <button
            type="button"
            onClick={() => accept("essential")}
            className="rounded-full bg-white/10 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-white/15"
          >
            {t("cookieConsent.essential" as never)}
          </button>
        </div>
      </div>
    </div>
  );
}
