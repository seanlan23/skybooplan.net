import { planLangCopy } from "@/lib/planLangCopy";

export type GoldenRuleItem = {
  title: string;
  body: string;
};

export type GoldenRuleGroup = {
  heading: string;
  items: GoldenRuleItem[];
};

export type GoldenRules = {
  title: string;
  groups: GoldenRuleGroup[];
};

export function buildGoldenRules(lang?: string): GoldenRules {
  return {
    title: planLangCopy(lang, {
      sl: "Zlata pravila brezskrbnega potovanja",
      en: "Golden rules for a carefree trip",
      de: "Goldene Regeln für eine unbeschwerte Reise",
    }),
    groups: [
      {
        heading: planLangCopy(lang, {
          sl: "Pred odhodom",
          en: "Before you leave",
          de: "Vor der Abreise",
        }),
        items: [
          {
            title: planLangCopy(lang, {
              sl: "Ročna prtljaga za prvi dan",
              en: "Carry-on for day one",
              de: "Handgepäck für den ersten Tag",
            }),
            body: planLangCopy(lang, {
              sl: "V ročno prtljago spakirajte kopalke in lahka oblačila za takojšen skok v bazen pred uradno prijavo v sobo.",
              en: "Pack swimwear and light clothes in your carry-on so you can go to the pool before official check-in.",
              de: "Badesachen und leichte Kleidung ins Handgepäck — so geht’s vor dem offiziellen Check-in direkt in den Pool.",
            }),
          },
          {
            title: planLangCopy(lang, {
              sl: "Brezplačni offline zemljevidi",
              en: "Free offline maps",
              de: "Kostenlose Offline-Karten",
            }),
            body: planLangCopy(lang, {
              sl: "V Google Maps prenesite zemljevid celotne regije za uporabo brez interneta.",
              en: "In Google Maps, download the map of the whole region for use without internet.",
              de: "In Google Maps die Karte der ganzen Region herunterladen — nutzbar ohne Internet.",
            }),
          },
        ],
      },
      {
        heading: planLangCopy(lang, {
          sl: "Finance & plačila",
          en: "Finance & payments",
          de: "Finanzen & Zahlungen",
        }),
        items: [
          {
            title: planLangCopy(lang, {
              sl: "Bančni dvigi brez provizij",
              en: "ATM withdrawals without extra fees",
              de: "Geldautomat ohne Extra-Gebühren",
            }),
            body: planLangCopy(lang, {
              sl: "Na bankomatih vedno izberite dvig v lokalni valuti brez bančne konverzije (\"Without Conversion\").",
              en: "At ATMs always choose to withdraw in the local currency without the bank’s conversion (\"Without Conversion\").",
              de: "Am Geldautomaten immer die Auszahlung in Landeswährung ohne Bankumrechnung wählen (\"Without Conversion\").",
            }),
          },
        ],
      },
      {
        heading: planLangCopy(lang, {
          sl: "Hotel & komunikacija",
          en: "Hotel & communication",
          de: "Hotel & Kommunikation",
        }),
        items: [
          {
            title: planLangCopy(lang, {
              sl: "WhatsApp recepcija",
              en: "WhatsApp reception",
              de: "WhatsApp-Rezeption",
            }),
            body: planLangCopy(lang, {
              sl: "Ob prijavi shranite WhatsApp številko hotela za hitro naročanje storitev in izletov.",
              en: "At check-in save the hotel’s WhatsApp number for quick requests and excursions.",
              de: "Beim Check-in die WhatsApp-Nummer des Hotels speichern — für schnelle Anfragen und Ausflüge.",
            }),
          },
        ],
      },
    ],
  };
}

export function formatGoldenRulesPdfLines(rules: GoldenRules): string[] {
  const lines: string[] = [];
  for (const group of rules.groups) {
    lines.push(group.heading);
    for (const item of group.items) {
      lines.push(`${item.title}: ${item.body}`);
    }
  }
  return lines;
}
