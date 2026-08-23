import type { CuratedTransportLeg } from "@/lib/curatedRoutes.types";

type LegDef = {
  from: RegExp;
  to: RegExp;
  type: string;
  duration: string;
  costLabel: string;
  howTo: string;
  heavyTravel?: boolean;
};

export const CURATED_LEGS: LegDef[] = [
  // —— Philippines ——
  {
    from: /manila/i,
    to: /puerto princesa|palawan/i,
    type: "flight",
    duration: "2–3h",
    costLabel: "40–90 €",
    howTo: "Notranji let MNL → PPS. Dan prihoda = prevoz, ne island hopping.",
    heavyTravel: true,
  },
  {
    from: /manila/i,
    to: /el nido/i,
    type: "flight",
    duration: "2–4h",
    costLabel: "80–150 €",
    howTo: "MNL → LIO (El Nido) ali MNL → PPS + van 5–6 h.",
    heavyTravel: true,
  },
  {
    from: /puerto princesa/i,
    to: /port barton/i,
    type: "van",
    duration: "3–4h",
    costLabel: "15–30 €",
    howTo: "Van PPS → Port Barton — popoldanski prihod.",
    heavyTravel: true,
  },
  {
    from: /port barton|puerto princesa/i,
    to: /manila/i,
    type: "van+flight",
    duration: "5–8h",
    costLabel: "55–120 €",
    howTo: "Van do PPS + let PPS → MNL.",
    heavyTravel: true,
  },
  {
    from: /manila/i,
    to: /bohol|panglao/i,
    type: "flight",
    duration: "2–3h",
    costLabel: "50–100 €",
    howTo: "Let → TAG + transfer Panglao.",
    heavyTravel: true,
  },
  {
    from: /boracay/i,
    to: /manila/i,
    type: "flight",
    duration: "2–4h",
    costLabel: "50–100 €",
    howTo: "Čoln Caticlan + let MNL.",
    heavyTravel: true,
  },
  // —— Vietnam / Cambodia ——
  {
    from: /hanoi/i,
    to: /ha long|halong/i,
    type: "bus+boat",
    duration: "3–4h",
    costLabel: "40–80 €",
    howTo: "Transfer Hanoi → Halong Bay + vkrcanje na križarko.",
    heavyTravel: true,
  },
  {
    from: /hanoi/i,
    to: /hue/i,
    type: "overnight_train",
    duration: "11–14h",
    costLabel: "25–55 €",
    howTo: "Nočni vlak Hanoi → Hue.",
    heavyTravel: true,
  },
  {
    from: /hue/i,
    to: /hoi an/i,
    type: "van",
    duration: "3–4h",
    costLabel: "15–35 €",
    howTo: "Hue → Marble Mountains (Danang) → Hoi An.",
    heavyTravel: true,
  },
  {
    from: /hoi an/i,
    to: /ho chi minh|hcmc|saigon/i,
    type: "flight",
    duration: "2–3h",
    costLabel: "40–90 €",
    howTo: "Transfer → DAD + let DAD → SGN.",
    heavyTravel: true,
  },
  {
    from: /mekong|ho chi minh/i,
    to: /phnom penh/i,
    type: "bus",
    duration: "6–7h",
    costLabel: "15–30 €",
    howTo: "Bus čez mejo Moc Bai → Phnom Penh.",
    heavyTravel: true,
  },
  {
    from: /phnom penh/i,
    to: /siem reap/i,
    type: "bus",
    duration: "5–6h",
    costLabel: "12–25 €",
    howTo: "Express bus → Siem Reap.",
    heavyTravel: true,
  },
  {
    from: /siem reap/i,
    to: /rayong|pattaya|bangkok/i,
    type: "flight",
    duration: "3–5h",
    costLabel: "60–120 €",
    howTo: "Let REP → BKK/UTP + transfer obala.",
    heavyTravel: true,
  },
  // —— Thailand ——
  {
    from: /bangkok/i,
    to: /kanchanaburi/i,
    type: "train",
    duration: "2–3h",
    costLabel: "8–20 €",
    howTo:
      "Vlak ali minivan Bangkok → Kanchanaburi (tržnice, Erawan NP). Dan prihoda brez večernega programa.",
    heavyTravel: true,
  },
  {
    from: /kanchanaburi/i,
    to: /chiang mai/i,
    type: "van+flight",
    duration: "6–9h",
    costLabel: "40–80 €",
    howTo:
      "Kanchanaburi → postanek Ayutthaya → let DMK/CNX. Cel dan prevoz.",
    heavyTravel: true,
  },
  {
    from: /bangkok/i,
    to: /chiang mai/i,
    type: "flight",
    duration: "1h 15m",
    costLabel: "30–70 €",
    howTo: "Notranji let BKK/DMK → CNX.",
    heavyTravel: true,
  },
  {
    from: /chiang mai/i,
    to: /bangkok/i,
    type: "flight",
    duration: "1h 15m",
    costLabel: "30–70 €",
    howTo: "Let CNX → BKK/DMK — lahek dopoldanski program največ.",
    heavyTravel: true,
  },
  {
    from: /bangkok/i,
    to: /ko samet|koh samet|samet/i,
    type: "van+ferry",
    duration: "3–4h",
    costLabel: "15–35 €",
    howTo: "Van do Ban Phe + trajekt na Ko Samet. Popoldanski prihod.",
    heavyTravel: true,
  },
  {
    from: /ko samet|koh samet|samet/i,
    to: /bangkok/i,
    type: "ferry+van",
    duration: "3–4h",
    costLabel: "15–35 €",
    howTo: "Trajekt Ban Phe + transfer BKK hub.",
    heavyTravel: true,
  },
  {
    from: /bangkok/i,
    to: /ayutthaya/i,
    type: "train",
    duration: "1–1.5h",
    costLabel: "5–15 €",
    howTo: "Izlet iz Bangkoka — zjutraj odhod, popoldan nazaj ali nadaljevanje severno.",
    heavyTravel: false,
  },
  {
    from: /bangkok/i,
    to: /krabi|ao nang/i,
    type: "flight",
    duration: "1h 30m",
    costLabel: "40–90 €",
    howTo: "Let BKK → KBV + transfer Ao Nang.",
    heavyTravel: true,
  },
  {
    from: /krabi|ao nang/i,
    to: /koh lipe|lipe/i,
    type: "ferry",
    duration: "4–6h",
    costLabel: "35–60 €",
    howTo: "Pakbara speedboat/ferry → Koh Lipe (sezonsko). Cel dan prevoz.",
    heavyTravel: true,
  },
  {
    from: /koh lipe|lipe/i,
    to: /bangkok/i,
    type: "ferry+flight",
    duration: "6–10h",
    costLabel: "70–140 €",
    howTo: "Ferry Lipe → Pakbara + let KBV/HDY → BKK. Buffer v Bangkoku pred mednarodnim letom.",
    heavyTravel: true,
  },
  {
    from: /phuket|patong/i,
    to: /koh lipe|lipe/i,
    type: "ferry+flight",
    duration: "6–9h",
    costLabel: "70–130 €",
    howTo: "Let HKT → HDY (ali kombi) + Pakbara speedboat/ferry → Koh Lipe. Cel dan prevoz.",
    heavyTravel: true,
  },
  {
    from: /koh lipe|lipe/i,
    to: /phuket|patong/i,
    type: "ferry+flight",
    duration: "6–9h",
    costLabel: "70–130 €",
    howTo: "Speedboat/ferry Lipe → Pak Bara → kombi do Hat Yai (HDY) → let HDY → HKT. Ni neposrednega leta z otoka.",
    heavyTravel: true,
  },
  {
    from: /chiang mai/i,
    to: /krabi|phuket/i,
    type: "flight",
    duration: "2–3h",
    costLabel: "50–100 €",
    howTo: "Let CNX → HKT/KBV.",
    heavyTravel: true,
  },
  {
    from: /phuket|patong/i,
    to: /krabi|ao nang/i,
    type: "van",
    duration: "2.5–3.5h",
    costLabel: "15–30 €",
    howTo: "Kombi ali minibus Phuket → Krabi / Ao Nang.",
    heavyTravel: true,
  },
  {
    from: /krabi|ao nang/i,
    to: /phuket|patong/i,
    type: "van",
    duration: "2.5–3.5h",
    costLabel: "15–30 €",
    howTo: "Kombi ali minibus Krabi / Ao Nang → Phuket.",
    heavyTravel: true,
  },
  // —— Indonesia ——
  {
    from: /jakarta/i,
    to: /makassar|sulawesi/i,
    type: "flight",
    duration: "2–3h",
    costLabel: "50–100 €",
    howTo: "Notranji let CGK → UPG (Makassar). Dan prihoda brez Toraje.",
    heavyTravel: true,
  },
  {
    from: /makassar|sulawesi/i,
    to: /tana toraja|toraja|rantepao/i,
    type: "van",
    duration: "8–10h",
    costLabel: "25–50 €",
    howTo: "Celodnevni transfer Makassar → Tana Toraja (Rantepao).",
    heavyTravel: true,
  },
  {
    from: /tana toraja|toraja/i,
    to: /makassar/i,
    type: "van",
    duration: "8–10h",
    costLabel: "25–50 €",
    howTo: "Povratek Toraja → Makassar — dan prevoz.",
    heavyTravel: true,
  },
  {
    from: /makassar/i,
    to: /ubud|bali|denpasar/i,
    type: "flight",
    duration: "1h 30m",
    costLabel: "40–80 €",
    howTo: "Let UPG → DPS + transfer Ubud. Dan prihoda lahek (Tanah Lot).",
    heavyTravel: true,
  },
  {
    from: /kuta|ubud|seminyak|canggu|sanur|bali|denpasar/i,
    to: /labuan bajo|flores|komodo/i,
    type: "flight",
    duration: "1h 15m",
    costLabel: "50–90 €",
    howTo: "Let DPS → LBJ (Labuan Bajo). Cel dan prevoz — Komodo cruise naslednji dan.",
    heavyTravel: true,
  },
  {
    from: /labuan bajo|flores|komodo/i,
    to: /kuta|ubud|seminyak|canggu|sanur|bali|denpasar/i,
    type: "flight",
    duration: "1h 15m",
    costLabel: "50–90 €",
    howTo: "Let LBJ → DPS (Bali). Cel dan prevoz — lahek program po prihodu.",
    heavyTravel: true,
  },
  {
    from: /labuan bajo|flores/i,
    to: /jakarta/i,
    type: "flight",
    duration: "2–4h",
    costLabel: "60–120 €",
    howTo: "Let LBJ → CGK (pogosto presedanje). Buffer pred mednarodnim odletom.",
    heavyTravel: true,
  },
  {
    from: /ubud|seminyak|denpasar|bali/i,
    to: /nusa penida/i,
    type: "ferry",
    duration: "45m–1h",
    costLabel: "15–30 €",
    howTo: "Fast boat Sanur/Padang Bai → Nusa Penida (dopoldanski izlet ali 1 noč).",
    heavyTravel: false,
  },
  {
    from: /bali|ubud/i,
    to: /gili/i,
    type: "fast_boat",
    duration: "2–3h",
    costLabel: "25–45 €",
    howTo: "Fast boat Padang Bai → Gili (via Lombok).",
    heavyTravel: true,
  },
  // —— Greece ——
  {
    from: /athens/i,
    to: /santorini/i,
    type: "ferry",
    duration: "5–8h",
    costLabel: "40–80 €",
    howTo: "Ferry ali krajši let ATH → JTR.",
    heavyTravel: true,
  },
];

function normCity(city: string): string {
  return city
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

export function lookupLeg(fromCity: string, toCity: string): CuratedTransportLeg | null {
  const from = normCity(fromCity);
  const to = normCity(toCity);
  for (const leg of CURATED_LEGS) {
    if (leg.from.test(from) && leg.to.test(to)) {
      return {
        type: leg.type,
        duration: leg.duration,
        costLabel: leg.costLabel,
        howTo: leg.howTo,
        heavyTravel: leg.heavyTravel ?? false,
      };
    }
  }
  return null;
}
