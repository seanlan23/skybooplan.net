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
  boracay: { lat: 11.967, lng: 121.928 },
  palawan: { lat: 11.194, lng: 119.411 },
  manila: { lat: 14.599, lng: 120.984 },
  "puerto princesa": { lat: 9.74, lng: 118.735 },
  "port barton": { lat: 10.55, lng: 119.32 },
  banaue: { lat: 16.917, lng: 121.06 },
  bohol: { lat: 9.85, lng: 124.143 },
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
  barcelona: { lat: 41.387, lng: 2.168 },
  madrid: { lat: 40.416, lng: -3.703 },
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
  athens: { lat: 37.984, lng: 23.728 },
  istanbul: { lat: 41.008, lng: 28.978 },
  sydney: { lat: -33.868, lng: 151.209 },
  melbourne: { lat: -37.813, lng: 144.963 },
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
  bali: { lat: -8.34, lng: 115.092 },
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
    if (k.length < 4) continue;
    if (key.includes(k) || k.includes(key)) return REGION_COORDS[k]!;
  }
  return null;
}
