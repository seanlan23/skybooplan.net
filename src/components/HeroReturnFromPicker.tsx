import { useState } from "react";
import { AirportAutocomplete } from "@/components/AirportAutocomplete";
import { useI18n } from "@/lib/i18n";

type HeroReturnFromPickerProps = {
  excludeIata?: string | null;
  onConfirm: (iata: string, label: string) => void;
  disabled?: boolean;
};

/** Compact airport picker for open-jaw return-from hub. */
export function HeroReturnFromPicker({
  excludeIata,
  onConfirm,
  disabled = false,
}: HeroReturnFromPickerProps) {
  const { t } = useI18n();
  const [value, setValue] = useState("");

  function handleContinue() {
    const code = value.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) return;
    if (excludeIata && code === excludeIata.toUpperCase()) return;
    onConfirm(code, code);
  }

  const ready = /^[A-Z]{3}$/.test(value.trim().toUpperCase());

  return (
    <div className="hero-chips-enter space-y-3 rounded-2xl border border-white/15 bg-black/40 p-3 backdrop-blur-md">
      <AirportAutocomplete
        label={t("heroChat.returnFrom.ask" as never)}
        placeholder={t("heroChat.returnFrom.placeholder" as never)}
        value={value}
        onChange={setValue}
        kind="airport"
      />
      <button
        type="button"
        disabled={disabled || !ready}
        onClick={handleContinue}
        className="inline-flex w-full items-center justify-center rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t("heroChat.returnFrom.confirm" as never)}
      </button>
    </div>
  );
}
