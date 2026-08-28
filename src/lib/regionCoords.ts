/**
 * Known city centers only — never seed from IATA runway coords.
 * Airports live in destinationCoords and are for flights/weather, not map cities.
 */
const REGION_COORDS: Record<string, { lat: number; lng: number }> = {
  bangkok: { lat: 13.756, lng: 100.502 },
  kanchanaburi: { lat: 14.022, lng: 99.532 },
  "ko samet": { lat: 12.555, lng: 101.451 },
  jakarta: { lat: -6.208, lng: 106.845 },
  makassar: { lat: -5.147, lng: 119.432 },
  "tana toraja": { lat: -3.075, lng: 119.742 },
  "labuan bajo": { lat: -8.496, lng: 119.888 },
  ubud: { lat: -8.506, lng: 115.263 },
  kuta: { lat: -8.717, lng: 115.168 },
  phuket: { lat: 7.88, lng: 98.392 },
  patong: { lat: 7.896, lng: 98.296 },
  /** Ferry terminal Phuket ↔ Phi Phi / Krabi */
  rassada: { lat: 7.8955, lng: 98.4015 },
  "rassada pier": { lat: 7.8955, lng: 98.4015 },
  "khao sok": { lat: 8.915, lng: 98.529 },
  "ao nang": { lat: 8.0317, lng: 98.8267 },
  /** Tonsai village / pier — land, not open water west of the island */
  "koh phi phi": { lat: 7.7407, lng: 98.7784 },
  "phi phi": { lat: 7.7407, lng: 98.7784 },
  tonsai: { lat: 7.7405, lng: 98.7782 },
  "ton sai": { lat: 7.7405, lng: 98.7782 },
  "tonsai pier": { lat: 7.7405, lng: 98.7782 },
  "chiang mai": { lat: 18.788, lng: 98.985 },
  ayutthaya: { lat: 14.353, lng: 100.569 },
  munich: { lat: 48.137, lng: 11.575 },
  münchen: { lat: 48.137, lng: 11.575 },
  krabi: { lat: 8.086, lng: 98.906 },
  "koh lipe": { lat: 6.486, lng: 99.301 },
  "el nido": { lat: 11.194, lng: 119.411 },
  coron: { lat: 11.998, lng: 120.204 },
  busuanga: { lat: 12.005, lng: 120.156 },
  malapascua: { lat: 11.281, lng: 124.118 },
  boracay: { lat: 11.967, lng: 121.928 },
  palawan: { lat: 11.194, lng: 119.411 },
  manila: { lat: 14.599, lng: 120.984 },
  "puerto princesa": { lat: 9.74, lng: 118.735 },
  "port barton": { lat: 10.55, lng: 119.32 },
  banaue: { lat: 16.917, lng: 121.06 },
  bohol: { lat: 9.85, lng: 124.143 },
  tagbilaran: { lat: 9.647, lng: 123.856 },
  cebu: { lat: 10.316, lng: 123.886 },
  panglao: { lat: 9.578, lng: 123.753 },
  "koh samui": { lat: 9.512, lng: 100.013 },
  "koh phangan": { lat: 9.731, lng: 100.013 },
  pattaya: { lat: 12.923, lng: 100.882 },
  rome: { lat: 41.902, lng: 12.496 },
  milan: { lat: 45.465, lng: 9.19 },
  venice: { lat: 45.441, lng: 12.316 },
  florence: { lat: 43.769, lng: 11.255 },
  paris: { lat: 48.857, lng: 2.352 },
  london: { lat: 51.507, lng: -0.128 },
  berlin: { lat: 52.52, lng: 13.405 },
  vienna: { lat: 48.208, lng: 16.373 },
  ljubljana: { lat: 46.051, lng: 14.505 },
  /** Balkans road-trip hubs (car / motorhome) */
  split: { lat: 43.508, lng: 16.44 },
  zadar: { lat: 44.119, lng: 15.231 },
  dubrovnik: { lat: 42.65, lng: 18.094 },
  kotor: { lat: 42.425, lng: 18.771 },
  budva: { lat: 42.286, lng: 18.84 },
  mostar: { lat: 43.343, lng: 17.808 },
  tirana: { lat: 41.328, lng: 19.818 },
  berat: { lat: 40.705, lng: 19.952 },
  plitvice: { lat: 44.865, lng: 15.582 },
  "plitvicka jezera": { lat: 44.865, lng: 15.582 },
  "plitvice lakes": { lat: 44.865, lng: 15.582 },
  "shkoder": { lat: 42.068, lng: 19.513 },
  "shkodër": { lat: 42.068, lng: 19.513 },
  skadar: { lat: 42.068, lng: 19.513 },
  himare: { lat: 40.102, lng: 19.745 },
  "himarë": { lat: 40.102, lng: 19.745 },
  himara: { lat: 40.102, lng: 19.745 },
  saranda: { lat: 39.875, lng: 20.005 },
  "sarandë": { lat: 39.875, lng: 20.005 },
  gjirokaster: { lat: 40.076, lng: 20.139 },
  "gjirokastër": { lat: 40.076, lng: 20.139 },
  ksamil: { lat: 39.774, lng: 19.999 },
  vlore: { lat: 40.466, lng: 19.491 },
  vlora: { lat: 40.466, lng: 19.491 },
  "dhermi": { lat: 40.15, lng: 19.64 },
  "dhërmi": { lat: 40.15, lng: 19.64 },
  /** Motorhome Alpine / SI–AT–DE corridor starts */
  "slovenj gradec": { lat: 46.509, lng: 15.08 },
  mezica: { lat: 46.521, lng: 14.854 },
  "mežica": { lat: 46.521, lng: 14.854 },
  ptuj: { lat: 46.42, lng: 15.87 },
  maribor: { lat: 46.554, lng: 15.646 },
  salzburg: { lat: 47.809, lng: 13.055 },
  linz: { lat: 48.306, lng: 14.286 },
  heidelberg: { lat: 49.398, lng: 8.672 },
  koblenz: { lat: 50.357, lng: 7.599 },
  klagenfurt: { lat: 46.625, lng: 14.305 },
  graz: { lat: 47.071, lng: 15.439 },
  "north holland": { lat: 52.52, lng: 4.79 },
  "noord-holland": { lat: 52.52, lng: 4.79 },
  "ho chi minh city": { lat: 10.823, lng: 106.629 },
  "ho chi minh": { lat: 10.823, lng: 106.629 },
  saigon: { lat: 10.823, lng: 106.629 },
  hanoi: { lat: 21.028, lng: 105.854 },
  "hoi an": { lat: 15.88, lng: 108.338 },
  hue: { lat: 16.463, lng: 107.59 },
  "da nang": { lat: 16.054, lng: 108.202 },
  "ha long": { lat: 20.91, lng: 107.183 },
  "ha long bay": { lat: 20.91, lng: 107.183 },
  "nha trang": { lat: 12.238, lng: 109.196 },
  "phu quoc": { lat: 10.289, lng: 103.984 },
  "mekong delta": { lat: 10.245, lng: 105.746 },
  "phnom penh": { lat: 11.556, lng: 104.928 },
  "siem reap": { lat: 13.363, lng: 103.856 },
  rayong: { lat: 12.681, lng: 101.282 },
  tokyo: { lat: 35.676, lng: 139.65 },
  seoul: { lat: 37.566, lng: 126.978 },
  singapore: { lat: 1.352, lng: 103.819 },
  dubai: { lat: 25.204, lng: 55.271 },
  "new york": { lat: 40.713, lng: -74.006 },
  "las vegas": { lat: 36.169, lng: -115.142 },
  barcelona: { lat: 41.387, lng: 2.168 },
  madrid: { lat: 40.416, lng: -3.703 },
  zaragoza: { lat: 41.649, lng: -0.889 },
  nice: { lat: 43.71, lng: 7.262 },
  marseille: { lat: 43.296, lng: 5.37 },
  "aix-en-provence": { lat: 43.529, lng: 5.447 },
  beaune: { lat: 47.026, lng: 4.84 },
  nimes: { lat: 43.837, lng: 4.36 },
  nîmes: { lat: 43.837, lng: 4.36 },
  montpellier: { lat: 43.611, lng: 3.877 },
  genoa: { lat: 44.405, lng: 8.946 },
  genova: { lat: 44.405, lng: 8.946 },
  trieste: { lat: 45.649, lng: 13.776 },
  savona: { lat: 44.309, lng: 8.481 },
  lloret: { lat: 41.7, lng: 2.846 },
  "lloret de mar": { lat: 41.7, lng: 2.846 },
  kamnik: { lat: 46.226, lng: 14.609 },
  celje: { lat: 46.231, lng: 15.26 },
  koper: { lat: 45.548, lng: 13.73 },
  "nova gorica": { lat: 45.956, lng: 13.649 },
  belgrade: { lat: 44.787, lng: 20.449 },
  beograd: { lat: 44.787, lng: 20.449 },
  nis: { lat: 43.321, lng: 21.896 },
  niš: { lat: 43.321, lng: 21.896 },
  podgorica: { lat: 42.441, lng: 19.263 },
  athens: { lat: 37.984, lng: 23.728 },
  atene: { lat: 37.984, lng: 23.728 },
  gibraltar: { lat: 36.14, lng: -5.353 },
  seville: { lat: 37.389, lng: -5.984 },
  valencia: { lat: 39.47, lng: -0.376 },
  "málaga": { lat: 36.721, lng: -4.421 },
  séville: { lat: 37.389, lng: -5.984 },
  malaga: { lat: 36.721, lng: -4.421 },
  córdoba: { lat: 37.888, lng: -4.779 },
  cordoba: { lat: 37.888, lng: -4.779 },
  granada: { lat: 37.177, lng: -3.598 },
  lisbon: { lat: 38.722, lng: -9.139 },
  lisboa: { lat: 38.722, lng: -9.139 },
  porto: { lat: 41.158, lng: -8.629 },
  sintra: { lat: 38.8029, lng: -9.3817 },
  lima: { lat: -12.046, lng: -77.043 },
  cusco: { lat: -13.531, lng: -71.967 },
  cuzco: { lat: -13.531, lng: -71.967 },
  "machu picchu": { lat: -13.163, lng: -72.545 },
  "rio de janeiro": { lat: -22.907, lng: -43.173 },
  "são paulo": { lat: -23.551, lng: -46.633 },
  "sao paulo": { lat: -23.551, lng: -46.633 },
  bogotá: { lat: 4.711, lng: -74.072 },
  bogota: { lat: 4.711, lng: -74.072 },
  cartagena: { lat: 10.391, lng: -75.479 },
  medellín: { lat: 6.247, lng: -75.566 },
  medellin: { lat: 6.247, lng: -75.566 },
  miami: { lat: 25.762, lng: -80.192 },
  "miami beach": { lat: 25.791, lng: -80.13 },
  haarlem: { lat: 52.387, lng: 4.646 },
  "reykjavík": { lat: 64.147, lng: -21.943 },
  giza: { lat: 29.977, lng: 31.132 },
  luxor: { lat: 25.687, lng: 32.64 },
  istanbul: { lat: 41.008, lng: 28.978 },
  sydney: { lat: -33.868, lng: 151.209 },
  melbourne: { lat: -37.813, lng: 144.963 },
  "bondi beach": { lat: -33.891, lng: 151.276 },
  "cape town": { lat: -33.925, lng: 18.424 },
  cairo: { lat: 30.044, lng: 31.235 },
  marrakech: { lat: 31.629, lng: -7.981 },
  arusha: { lat: -3.386, lng: 36.683 },
  serengeti: { lat: -2.333, lng: 34.833 },
  ngorongoro: { lat: -3.161, lng: 35.587 },
  zanzibar: { lat: -6.165, lng: 39.199 },
  "stone town": { lat: -6.163, lng: 39.189 },
  toronto: { lat: 43.653, lng: -79.383 },
  "niagara falls": { lat: 43.096, lng: -79.037 },
  niagara: { lat: 43.096, lng: -79.037 },
  ottawa: { lat: 45.421, lng: -75.697 },
  banff: { lat: 51.178, lng: -115.57 },
  vancouver: { lat: 49.283, lng: -123.121 },
  calgary: { lat: 51.044, lng: -114.071 },
  chicago: { lat: 41.878, lng: -87.63 },
  "st louis": { lat: 38.627, lng: -90.199 },
  "oklahoma city": { lat: 35.468, lng: -97.516 },
  amarillo: { lat: 35.222, lng: -101.831 },
  albuquerque: { lat: 35.085, lng: -106.651 },
  "santa fe": { lat: 35.687, lng: -105.938 },
  flagstaff: { lat: 35.198, lng: -111.651 },
  tulsa: { lat: 36.154, lng: -95.992 },
  "los angeles": { lat: 34.052, lng: -118.244 },
  cancún: { lat: 21.161, lng: -86.851 },
  cancun: { lat: 21.161, lng: -86.851 },
  "playa del carmen": { lat: 20.629, lng: -87.073 },
  playacar: { lat: 20.629, lng: -87.073 },
  tulum: { lat: 20.212, lng: -87.465 },
  merida: { lat: 20.967, lng: -89.623 },
  mérida: { lat: 20.967, lng: -89.623 },
  cozumel: { lat: 20.423, lng: -86.922 },
  "isla mujeres": { lat: 21.232, lng: -86.731 },
  holbox: { lat: 21.524, lng: -87.378 },
  "isla holbox": { lat: 21.524, lng: -87.378 },
  campeche: { lat: 19.845, lng: -90.524 },
  bacalar: { lat: 18.677, lng: -88.395 },
  /** Spain (Castile) — Yucatán uses lookupOvernightCoords + peer stays. */
  valladolid: { lat: 41.652, lng: -4.724 },
  "valladolid yucatan": { lat: 20.69, lng: -88.201 },
  "valladolid mexico": { lat: 20.69, lng: -88.201 },
  "chichen itza": { lat: 20.684, lng: -88.568 },
  "chichén itzá": { lat: 20.684, lng: -88.568 },
  bali: { lat: -8.34, lng: 115.092 },
  santorini: { lat: 36.393, lng: 25.461 },
  oia: { lat: 36.462, lng: 25.375 },
  fira: { lat: 36.417, lng: 25.432 },
  "hong kong": { lat: 22.319, lng: 114.169 },
  hongkong: { lat: 22.319, lng: 114.169 },
  lantau: { lat: 22.266, lng: 113.943 },
  "ngong ping": { lat: 22.256, lng: 113.905 },
  macau: { lat: 22.198, lng: 113.544 },
  macao: { lat: 22.198, lng: 113.544 },
  reykjavik: { lat: 64.147, lng: -21.943 },
  iceland: { lat: 64.147, lng: -21.943 },
  seminyak: { lat: -8.691, lng: 115.168 },
  denpasar: { lat: -8.671, lng: 115.212 },
  prague: { lat: 50.075, lng: 14.438 },
  frankfurt: { lat: 50.111, lng: 8.682 },
  amsterdam: { lat: 52.368, lng: 4.904 },
  zagreb: { lat: 45.815, lng: 15.982 },
  gyor: { lat: 47.687, lng: 17.635 },
  budapest: { lat: 47.498, lng: 19.04 },
  bratislava: { lat: 48.148, lng: 17.107 },
  presov: { lat: 48.998, lng: 21.24 },
  kosice: { lat: 48.716, lng: 21.261 },
  poprad: { lat: 49.052, lng: 20.298 },
  kyoto: { lat: 35.012, lng: 135.768 },
  osaka: { lat: 34.694, lng: 135.502 },
  /** City centers — not IATA runways (KIX/ITM/HIJ). */
  hiroshima: { lat: 34.385, lng: 132.455 },
  nara: { lat: 34.685, lng: 135.833 },
  nagoya: { lat: 35.181, lng: 136.906 },
  fukuoka: { lat: 33.59, lng: 130.402 },
  kanazawa: { lat: 36.561, lng: 136.656 },
  sapporo: { lat: 43.062, lng: 141.354 },
  lyon: { lat: 45.764, lng: 4.836 },
  avignon: { lat: 43.949, lng: 4.806 },
  thessaloniki: { lat: 40.64, lng: 22.945 },
  ioannina: { lat: 39.665, lng: 20.852 },
  meteora: { lat: 39.714, lng: 21.631 },
};

export function lookupRegionCoords(city: string): { lat: number; lng: number } | null {
  const key = city
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\./g, "")
    .replace(/\s+/g, " ");
  if (REGION_COORDS[key]) return REGION_COORDS[key]!;

  // Slovenian / typed endings: "Ao Nanga", "Khao Soka", "Phuketa"
  const stem = key.replace(/[aeiu]\b/g, "").replace(/\s+/g, " ").trim();
  if (stem && REGION_COORDS[stem]) return REGION_COORDS[stem]!;

  // Substring match against known hubs (longest key first).
  const keys = Object.keys(REGION_COORDS).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (k.length < 5) continue;
    if (key.includes(k)) return REGION_COORDS[k]!;
    // Avoid "lima" ⊂ longer names; only allow catalog key containing the query when the query is specific.
    if (key.length >= 8 && k.includes(key)) return REGION_COORDS[k]!;
  }
  return null;
}

const YUCATAN_PEER =
  /cancun|cancún|playa|tulum|merida|mérida|valladolid|chetumal|bacalar|cozumel|holbox|yucatan|yucatán|quintana|mexico|méxico/i;

const VALLADOLID_MX = { lat: 20.69, lng: -88.201 };

/** Overnight city for distance math — disambiguates Valladolid (MX vs ES) via peer stays. */
export function lookupOvernightCoords(
  city: string,
  opts?: { lat?: number; lng?: number; peerCities?: string[] },
): { lat: number; lng: number } | null {
  const raw = city.trim();
  if (/^valladolid\b/i.test(raw) && (opts?.peerCities ?? []).some((c) => YUCATAN_PEER.test(c))) {
    return VALLADOLID_MX;
  }
  const looked = lookupRegionCoords(raw);
  if (looked) return looked;
  if (
    typeof opts?.lat === "number" &&
    typeof opts?.lng === "number" &&
    Number.isFinite(opts.lat) &&
    Number.isFinite(opts.lng) &&
    Math.abs(opts.lat) > 0.01 &&
    Math.abs(opts.lng) > 0.01
  ) {
    return { lat: opts.lat, lng: opts.lng };
  }
  return null;
}

export function allRegionCityCoords(): Array<{ city: string; lat: number; lng: number }> {
  return Object.entries(REGION_COORDS).map(([city, c]) => ({ city, lat: c.lat, lng: c.lng }));
}
