import type { PlaceSuggestion } from "@/lib/places.functions";
import {
  hubToSuggestion,
  normalizeAirportQuery,
  searchAirportCatalog,
  type AirportHub,
} from "@/lib/airportCatalog";

/**
 * Country / region query (any common language) → at least 2 main airports.
 * Matched before city/IATA scoring so “egipt”, “Malezija”, “Indonezija” never return empty.
 */
const COUNTRY_TO_HUBS: Array<{ aliases: string[]; iatas: string[] }> = [
  {
    aliases: ["egypt", "egipt", "egipto", "aegypten", "agypten", "egypte", "egitto"],
    iatas: ["CAI", "HRG"],
  },
  {
    aliases: ["malaysia", "malezija", "malajzia", "malaisie", "maleisi"],
    iatas: ["KUL", "PEN"],
  },
  {
    aliases: ["indonesia", "indonezija", "indonesien", "indonesie", "indonésie"],
    iatas: ["CGK", "DPS"],
  },
  {
    aliases: ["philippines", "filipini", "filipinas", "philippinen", "filippine"],
    iatas: ["MNL", "CEB"],
  },
  {
    aliases: ["thailand", "tajska", "tailandia", "thailande", "thailandia"],
    iatas: ["BKK", "HKT"],
  },
  {
    aliases: ["japan", "japonska", "japon", "giappone", "japan"],
    iatas: ["NRT", "HND"],
  },
  {
    aliases: ["vietnam", "viet nam"],
    iatas: ["SGN", "HAN"],
  },
  {
    aliases: ["croatia", "hrvaska", "hrvatska", "kroatien", "croazia", "croatie"],
    iatas: ["SPU", "DBV"],
  },
  {
    aliases: ["greece", "grcija", "grecja", "griechenland", "grecia", "grece"],
    iatas: ["ATH", "HER"],
  },
  {
    aliases: ["turkey", "turcija", "turkiye", "turkei", "turchia", "turquie"],
    iatas: ["IST", "AYT"],
  },
  {
    aliases: ["spain", "spanija", "spanien", "espana", "espagne", "spagna"],
    iatas: ["MAD", "BCN"],
  },
  {
    aliases: ["italy", "italija", "italien", "italia", "italie"],
    iatas: ["FCO", "MXP"],
  },
  {
    aliases: ["portugal", "portugalska", "portogallo"],
    iatas: ["LIS", "OPO"],
  },
  {
    aliases: ["morocco", "maroko", "maroc", "marokko", "marruecos"],
    iatas: ["RAK", "CMN"],
  },
  {
    aliases: ["maldives", "maldivi", "malediven", "maldivas", "maldive"],
    iatas: ["MLE", "DRV"],
  },
  {
    aliases: ["australia", "avstralija", "australie", "australien", "australia"],
    iatas: ["SYD", "MEL"],
  },
  {
    aliases: ["singapore", "singapur", "singapour"],
    iatas: ["SIN"],
  },
  {
    aliases: ["united arab emirates", "uae", "emirati", "emirats", "zdruzeni arabski emirati"],
    iatas: ["DXB", "AUH"],
  },
  {
    aliases: ["south korea", "korea", "koreja", "coree", "corea"],
    iatas: ["ICN", "GMP"],
  },
  {
    aliases: ["france", "francija", "frankreich", "francia", "france"],
    iatas: ["CDG", "NCE"],
  },
  {
    aliases: ["united states", "usa", "amerika", "zda", "etats unis", "stati uniti"],
    iatas: ["JFK", "LAX"],
  },
  {
    aliases: ["united kingdom", "uk", "britain", "velika britanija", "england", "angleška", "angleska"],
    iatas: ["LHR", "LGW"],
  },
  {
    aliases: ["germany", "nemcija", "deutschland", "allemagne", "germania"],
    iatas: ["FRA", "MUC"],
  },
  {
    aliases: ["austria", "avstrija", "osterreich", "autriche", "austria"],
    iatas: ["VIE", "SZG"],
  },
  {
    aliases: ["switzerland", "svica", "schweiz", "suisse", "svizzera"],
    iatas: ["ZRH", "GVA"],
  },
  {
    aliases: ["netherlands", "nizozemska", "holland", "pays bas", "olanda"],
    iatas: ["AMS", "RTM"],
  },
  {
    aliases: ["iceland", "island", "islandija", "islande", "islanda"],
    iatas: ["KEF", "RKV"],
  },
  {
    aliases: ["mexico", "mehika", "mexique", "messico"],
    iatas: ["MEX", "CUN"],
  },
  {
    aliases: ["brazil", "brazilija", "brasil", "bresil"],
    iatas: ["GRU", "GIG"],
  },
  {
    aliases: ["argentina", "argentinien", "argentine"],
    iatas: ["EZE", "AEP"],
  },
  {
    aliases: ["peru", "perù"],
    iatas: ["LIM", "CUZ"],
  },
  {
    aliases: ["colombia", "kolumbija", "colombie"],
    iatas: ["BOG", "CTG"],
  },
  {
    aliases: ["india", "indija", "inde", "indie"],
    iatas: ["DEL", "BOM"],
  },
  {
    aliases: ["sri lanka", "srilanka", "cejlon"],
    iatas: ["CMB", "HRI"],
  },
  {
    aliases: ["tanzania", "tanzanija", "zanzibar"],
    iatas: ["DAR", "ZNZ"],
  },
  {
    aliases: ["kenya", "kenija"],
    iatas: ["NBO", "MBA"],
  },
  {
    aliases: ["south africa", "juzna afrika", "sudafrika", "afrique du sud"],
    iatas: ["JNB", "CPT"],
  },
  {
    aliases: ["cuba", "kuba"],
    iatas: ["HAV", "VRA"],
  },
  {
    aliases: ["namibia", "namibija", "namibie", "namibien"],
    iatas: ["WDH", "ERS"],
  },
  {
    aliases: ["botswana", "bocvana", "botsuana", "botsvana"],
    iatas: ["GBE", "MUB"],
  },
  {
    aliases: ["zimbabwe", "zimbabve", "simbabwe"],
    iatas: ["HRE", "VFA"],
  },
  {
    aliases: ["mauritius", "mavricius", "ile maurice", "mauricius"],
    iatas: ["MRU", "RRG"],
  },
  {
    aliases: ["seychelles", "sejseli", "seychellen", "seszele"],
    iatas: ["SEZ", "PRI"],
  },
  {
    aliases: ["madagascar", "madagaskar"],
    iatas: ["TNR", "NOS"],
  },
  {
    aliases: ["tunisia", "tunizija", "tunisie", "tunesien"],
    iatas: ["TUN", "DJE"],
  },
  {
    aliases: [
      "dominican republic",
      "dominikanska republika",
      "dominicana",
      "republique dominicaine",
      "dominikanische republik",
      "dominikanische",
    ],
    iatas: ["PUJ", "SDQ"],
  },
  {
    aliases: ["jamaica", "jamajka", "jamaika"],
    iatas: ["MBJ", "KIN"],
  },
  {
    aliases: ["costa rica", "kostarika", "costa-rica"],
    iatas: ["SJO", "LIR"],
  },
  {
    aliases: ["chile", "cile", "chili"],
    iatas: ["SCL", "ANF"],
  },
  {
    aliases: [
      "new zealand",
      "nova zelandija",
      "neuseeland",
      "nouvelle zelande",
      "nouvelle-zelande",
    ],
    iatas: ["AKL", "CHC"],
  },
  {
    aliases: ["canada", "kanada"],
    iatas: ["YYZ", "YVR"],
  },
  {
    aliases: [
      "kazakhstan",
      "kazahstan",
      "kasachstan",
      "kazajistan",
      "qazaqstan",
    ],
    iatas: ["NQZ", "ALA"],
  },
];

/** Instant local hits for “Želim drugam” before Duffel returns. */
const POPULAR_DESTINATION_AIRPORTS: AirportHub[] = [
  {
    iata: "BCN",
    city: "Barcelona",
    name: "Barcelona El Prat",
    country: "ES",
    aliases: ["barcelona", "barca", "bcn", "el prat", "spain", "spanija"],
  },
  {
    iata: "MNL",
    city: "Manila",
    name: "Ninoy Aquino International",
    country: "PH",
    aliases: ["manila", "mnl", "philippines", "filipini"],
  },
  {
    iata: "CEB",
    city: "Cebu",
    name: "Mactan-Cebu International",
    country: "PH",
    aliases: ["cebu", "ceb", "mactan"],
  },
  {
    iata: "BKK",
    city: "Bangkok",
    name: "Suvarnabhumi",
    country: "TH",
    aliases: ["bangkok", "bkk", "thailand", "tajska"],
  },
  {
    iata: "HKT",
    city: "Phuket",
    name: "Phuket International",
    country: "TH",
    aliases: ["phuket", "hkt", "phuket island", "thailand", "tajska"],
  },
  {
    iata: "CGK",
    city: "Jakarta",
    name: "Soekarno-Hatta",
    country: "ID",
    aliases: ["jakarta", "cgk", "indonesia", "indonezija"],
  },
  {
    iata: "DPS",
    city: "Denpasar",
    name: "Ngurah Rai",
    country: "ID",
    aliases: ["bali", "denpasar", "dps", "ubud", "indonesia", "indonezija"],
  },
  {
    iata: "CAI",
    city: "Cairo",
    name: "Cairo International",
    country: "EG",
    aliases: ["cairo", "kairo", "cai", "egypt", "egipt"],
  },
  {
    iata: "HRG",
    city: "Hurghada",
    name: "Hurghada International",
    country: "EG",
    aliases: ["hurghada", "hrg", "egypt", "egipt", "red sea"],
  },
  {
    iata: "SSH",
    city: "Sharm El Sheikh",
    name: "Sharm El Sheikh International",
    country: "EG",
    aliases: ["sharm", "ssh", "sharm el sheikh"],
  },
  {
    iata: "KUL",
    city: "Kuala Lumpur",
    name: "Kuala Lumpur International",
    country: "MY",
    aliases: ["kuala lumpur", "kl", "kul", "malaysia", "malezija"],
  },
  {
    iata: "PEN",
    city: "Penang",
    name: "Penang International",
    country: "MY",
    aliases: ["penang", "pen", "george town", "malaysia", "malezija"],
  },
  {
    iata: "NRT",
    city: "Tokyo",
    name: "Narita",
    country: "JP",
    aliases: ["tokyo", "tokio", "narita", "nrt", "japan", "japonska"],
  },
  {
    iata: "HND",
    city: "Tokyo",
    name: "Haneda",
    country: "JP",
    aliases: ["haneda", "hnd", "tokyo haneda", "japan", "japonska"],
  },
  {
    iata: "SGN",
    city: "Ho Chi Minh City",
    name: "Tan Son Nhat",
    country: "VN",
    aliases: ["ho chi minh", "saigon", "sgn", "vietnam"],
  },
  {
    iata: "HAN",
    city: "Hanoi",
    name: "Noi Bai",
    country: "VN",
    aliases: ["hanoi", "han", "vietnam"],
  },
  {
    iata: "SPU",
    city: "Split",
    name: "Split Airport",
    country: "HR",
    aliases: ["split", "spu", "croatia", "hrvaska", "hrvatska"],
  },
  {
    iata: "DBV",
    city: "Dubrovnik",
    name: "Dubrovnik Airport",
    country: "HR",
    aliases: ["dubrovnik", "dbv", "croatia", "hrvaska"],
  },
  {
    iata: "JFK",
    city: "New York",
    name: "John F. Kennedy",
    country: "US",
    aliases: ["new york", "nyc", "jfk", "newyork", "usa", "amerika"],
  },
  {
    iata: "LAX",
    city: "Los Angeles",
    name: "Los Angeles International",
    country: "US",
    aliases: ["los angeles", "la", "lax", "usa"],
  },
  {
    iata: "CDG",
    city: "Paris",
    name: "Charles de Gaulle",
    country: "FR",
    aliases: ["paris", "pariz", "cdg", "charles de gaulle", "france", "francija"],
  },
  {
    iata: "NCE",
    city: "Nice",
    name: "Nice Côte d'Azur",
    country: "FR",
    aliases: ["nice", "nce", "cannes"],
  },
  {
    iata: "FCO",
    city: "Rome",
    name: "Fiumicino",
    country: "IT",
    aliases: ["rome", "rim", "fco", "fiumicino", "italy", "italija"],
  },
  {
    iata: "MXP",
    city: "Milan",
    name: "Milan Malpensa",
    country: "IT",
    aliases: ["milan", "milano", "mxp", "malpensa", "italy", "italija"],
  },
  {
    iata: "LIS",
    city: "Lisbon",
    name: "Humberto Delgado",
    country: "PT",
    aliases: ["lisbon", "lisboa", "lizbona", "portugal", "portugalska", "lis"],
  },
  {
    iata: "OPO",
    city: "Porto",
    name: "Francisco Sá Carneiro",
    country: "PT",
    aliases: ["porto", "opo", "portugal"],
  },
  {
    iata: "MLE",
    city: "Malé",
    name: "Velana International",
    country: "MV",
    aliases: ["maldives", "maldivi", "male", "malé", "mle"],
  },
  {
    iata: "DRV",
    city: "Dharavandhoo",
    name: "Dharavandhoo Airport",
    country: "MV",
    aliases: ["dharavandhoo", "drv", "baa atoll"],
  },
  {
    iata: "DXB",
    city: "Dubai",
    name: "Dubai International",
    country: "AE",
    aliases: ["dubai", "dxb", "uae", "emirates"],
  },
  {
    iata: "AUH",
    city: "Abu Dhabi",
    name: "Zayed International",
    country: "AE",
    aliases: ["abu dhabi", "auh"],
  },
  {
    iata: "SIN",
    city: "Singapore",
    name: "Changi",
    country: "SG",
    aliases: ["singapore", "singapur", "sin", "changi"],
  },
  {
    iata: "SYD",
    city: "Sydney",
    name: "Kingsford Smith",
    country: "AU",
    aliases: ["sydney", "syd", "australia", "avstralija"],
  },
  {
    iata: "MEL",
    city: "Melbourne",
    name: "Melbourne Airport",
    country: "AU",
    aliases: ["melbourne", "mel", "australia", "avstralija"],
  },
  {
    iata: "MAD",
    city: "Madrid",
    name: "Adolfo Suárez Madrid-Barajas",
    country: "ES",
    aliases: ["madrid", "mad", "spain", "spanija"],
  },
  {
    iata: "ATH",
    city: "Athens",
    name: "Eleftherios Venizelos",
    country: "GR",
    aliases: ["athens", "atene", "ath", "greece", "grcija"],
  },
  {
    iata: "HER",
    city: "Heraklion",
    name: "Heraklion International",
    country: "GR",
    aliases: ["heraklion", "her", "crete", "kreta"],
  },
  {
    iata: "IST",
    city: "Istanbul",
    name: "Istanbul Airport",
    country: "TR",
    aliases: ["istanbul", "ist", "turkey", "turcija"],
  },
  {
    iata: "AYT",
    city: "Antalya",
    name: "Antalya Airport",
    country: "TR",
    aliases: ["antalya", "ayt", "turkey", "turcija"],
  },
  {
    iata: "RAK",
    city: "Marrakech",
    name: "Marrakech Menara",
    country: "MA",
    aliases: ["marrakech", "marrakesh", "rak", "morocco", "maroko"],
  },
  {
    iata: "CMN",
    city: "Casablanca",
    name: "Mohammed V",
    country: "MA",
    aliases: ["casablanca", "cmn", "morocco", "maroko"],
  },
  {
    iata: "ICN",
    city: "Seoul",
    name: "Incheon",
    country: "KR",
    aliases: ["seoul", "icn", "korea", "koreja", "incheon"],
  },
  {
    iata: "GMP",
    city: "Seoul",
    name: "Gimpo",
    country: "KR",
    aliases: ["gimpo", "gmp"],
  },
  {
    iata: "LHR",
    city: "London",
    name: "Heathrow",
    country: "GB",
    aliases: ["london", "lhr", "heathrow", "uk", "britain"],
  },
  {
    iata: "LGW",
    city: "London",
    name: "Gatwick",
    country: "GB",
    aliases: ["gatwick", "lgw"],
  },
  {
    iata: "FRA",
    city: "Frankfurt",
    name: "Frankfurt Airport",
    country: "DE",
    aliases: ["frankfurt", "fra", "germany", "nemcija"],
  },
  {
    iata: "MUC",
    city: "Munich",
    name: "Munich Airport",
    country: "DE",
    aliases: ["munich", "munchen", "muc", "germany", "nemcija"],
  },
  {
    iata: "VIE",
    city: "Vienna",
    name: "Vienna International",
    country: "AT",
    aliases: ["vienna", "wien", "dunaj", "vie", "austria", "avstrija"],
  },
  {
    iata: "SZG",
    city: "Salzburg",
    name: "Salzburg Airport",
    country: "AT",
    aliases: ["salzburg", "szg"],
  },
  {
    iata: "ZRH",
    city: "Zurich",
    name: "Zurich Airport",
    country: "CH",
    aliases: ["zurich", "zrh", "switzerland", "svica"],
  },
  {
    iata: "GVA",
    city: "Geneva",
    name: "Geneva Airport",
    country: "CH",
    aliases: ["geneva", "gva", "geneve"],
  },
  {
    iata: "AMS",
    city: "Amsterdam",
    name: "Schiphol",
    country: "NL",
    aliases: ["amsterdam", "ams", "netherlands", "nizozemska", "holland"],
  },
  {
    iata: "RTM",
    city: "Rotterdam",
    name: "Rotterdam The Hague",
    country: "NL",
    aliases: ["rotterdam", "rtm"],
  },
  {
    iata: "KEF",
    city: "Reykjavik",
    name: "Keflavík",
    country: "IS",
    aliases: ["reykjavik", "kef", "iceland", "island", "islandija"],
  },
  {
    iata: "RKV",
    city: "Reykjavik",
    name: "Reykjavík Domestic",
    country: "IS",
    aliases: ["rkv"],
  },
  {
    iata: "MEX",
    city: "Mexico City",
    name: "Benito Juárez",
    country: "MX",
    aliases: ["mexico", "mehika", "mex"],
  },
  {
    iata: "CUN",
    city: "Cancún",
    name: "Cancún International",
    country: "MX",
    aliases: ["cancun", "cun", "cancún"],
  },
  {
    iata: "GRU",
    city: "São Paulo",
    name: "Guarulhos",
    country: "BR",
    aliases: ["sao paulo", "gru", "brazil", "brazilija"],
  },
  {
    iata: "GIG",
    city: "Rio de Janeiro",
    name: "Galeão",
    country: "BR",
    aliases: ["rio", "gig", "rio de janeiro", "brazil"],
  },
  {
    iata: "EZE",
    city: "Buenos Aires",
    name: "Ezeiza",
    country: "AR",
    aliases: ["buenos aires", "eze", "argentina"],
  },
  {
    iata: "AEP",
    city: "Buenos Aires",
    name: "Aeroparque",
    country: "AR",
    aliases: ["aeroparque", "aep"],
  },
  {
    iata: "LIM",
    city: "Lima",
    name: "Jorge Chávez",
    country: "PE",
    aliases: ["lima", "lim", "peru"],
  },
  {
    iata: "CUZ",
    city: "Cusco",
    name: "Alejandro Velasco Astete",
    country: "PE",
    aliases: ["cusco", "cuzco", "cuz", "machu picchu"],
  },
  {
    iata: "BOG",
    city: "Bogotá",
    name: "El Dorado",
    country: "CO",
    aliases: ["bogota", "bog", "colombia", "kolumbija"],
  },
  {
    iata: "CTG",
    city: "Cartagena",
    name: "Rafael Núñez",
    country: "CO",
    aliases: ["cartagena", "ctg"],
  },
  {
    iata: "DEL",
    city: "Delhi",
    name: "Indira Gandhi",
    country: "IN",
    aliases: ["delhi", "del", "india", "indija", "new delhi"],
  },
  {
    iata: "BOM",
    city: "Mumbai",
    name: "Chhatrapati Shivaji",
    country: "IN",
    aliases: ["mumbai", "bombay", "bom", "india", "indija"],
  },
  {
    iata: "CMB",
    city: "Colombo",
    name: "Bandaranaike",
    country: "LK",
    aliases: ["colombo", "cmb", "sri lanka"],
  },
  {
    iata: "HRI",
    city: "Hambantota",
    name: "Mattala Rajapaksa",
    country: "LK",
    aliases: ["hambantota", "hri", "mattala"],
  },
  {
    iata: "DAR",
    city: "Dar es Salaam",
    name: "Julius Nyerere",
    country: "TZ",
    aliases: ["dar es salaam", "dar", "tanzania"],
  },
  {
    iata: "ZNZ",
    city: "Zanzibar",
    name: "Abeid Amani Karume",
    country: "TZ",
    aliases: ["zanzibar", "znz", "tanzania"],
  },
  {
    iata: "NBO",
    city: "Nairobi",
    name: "Jomo Kenyatta",
    country: "KE",
    aliases: ["nairobi", "nbo", "kenya", "kenija"],
  },
  {
    iata: "MBA",
    city: "Mombasa",
    name: "Moi International",
    country: "KE",
    aliases: ["mombasa", "mba"],
  },
  {
    iata: "JNB",
    city: "Johannesburg",
    name: "O. R. Tambo",
    country: "ZA",
    aliases: ["johannesburg", "jnb", "south africa", "juzna afrika"],
  },
  {
    iata: "CPT",
    city: "Cape Town",
    name: "Cape Town International",
    country: "ZA",
    aliases: ["cape town", "cpt", "south africa"],
  },
  {
    iata: "HAV",
    city: "Havana",
    name: "José Martí International",
    country: "CU",
    aliases: ["havana", "havanna", "hav", "cuba", "kuba"],
  },
  {
    iata: "VRA",
    city: "Varadero",
    name: "Juan Gualberto Gómez",
    country: "CU",
    aliases: ["varadero", "vra", "cuba", "kuba"],
  },
  {
    iata: "WDH",
    city: "Windhoek",
    name: "Hosea Kutako International",
    country: "NA",
    aliases: ["windhoek", "wdh", "namibia", "namibija"],
  },
  {
    iata: "ERS",
    city: "Windhoek",
    name: "Eros Airport",
    country: "NA",
    aliases: ["eros", "ers", "namibia", "namibija"],
  },
  {
    iata: "GBE",
    city: "Gaborone",
    name: "Sir Seretse Khama",
    country: "BW",
    aliases: ["gaborone", "gbe", "botswana", "bocvana", "botsvana"],
  },
  {
    iata: "MUB",
    city: "Maun",
    name: "Maun Airport",
    country: "BW",
    aliases: ["maun", "mub", "okavango", "botswana", "bocvana"],
  },
  {
    iata: "HRE",
    city: "Harare",
    name: "Robert Gabriel Mugabe",
    country: "ZW",
    aliases: ["harare", "hre", "zimbabwe", "zimbabve"],
  },
  {
    iata: "VFA",
    city: "Victoria Falls",
    name: "Victoria Falls Airport",
    country: "ZW",
    aliases: ["victoria falls", "vfa", "zimbabwe"],
  },
  {
    iata: "MRU",
    city: "Port Louis",
    name: "Sir Seewoosagur Ramgoolam",
    country: "MU",
    aliases: ["mauritius", "mru", "mavricius", "port louis"],
  },
  {
    iata: "RRG",
    city: "Rodrigues",
    name: "Sir Gaëtan Duval",
    country: "MU",
    aliases: ["rodrigues", "rrg", "mauritius"],
  },
  {
    iata: "SEZ",
    city: "Mahé",
    name: "Seychelles International",
    country: "SC",
    aliases: ["seychelles", "sez", "mahe", "sejseli"],
  },
  {
    iata: "PRI",
    city: "Praslin",
    name: "Praslin Island Airport",
    country: "SC",
    aliases: ["praslin", "pri", "seychelles"],
  },
  {
    iata: "TNR",
    city: "Antananarivo",
    name: "Ivato",
    country: "MG",
    aliases: ["antananarivo", "tnr", "madagascar", "madagaskar", "tana"],
  },
  {
    iata: "NOS",
    city: "Nosy Be",
    name: "Fascene",
    country: "MG",
    aliases: ["nosy be", "nos", "madagascar"],
  },
  {
    iata: "TUN",
    city: "Tunis",
    name: "Tunis–Carthage",
    country: "TN",
    aliases: ["tunis", "tun", "tunisia", "tunizija"],
  },
  {
    iata: "DJE",
    city: "Djerba",
    name: "Djerba–Zarzis",
    country: "TN",
    aliases: ["djerba", "dje", "jerba", "tunisia"],
  },
  {
    iata: "PUJ",
    city: "Punta Cana",
    name: "Punta Cana International",
    country: "DO",
    aliases: ["punta cana", "puj", "dominican", "dominikanska"],
  },
  {
    iata: "SDQ",
    city: "Santo Domingo",
    name: "Las Américas",
    country: "DO",
    aliases: ["santo domingo", "sdq", "dominican"],
  },
  {
    iata: "MBJ",
    city: "Montego Bay",
    name: "Sangster International",
    country: "JM",
    aliases: ["montego bay", "mbj", "jamaica", "jamajka"],
  },
  {
    iata: "KIN",
    city: "Kingston",
    name: "Norman Manley",
    country: "JM",
    aliases: ["kingston", "kin", "jamaica"],
  },
  {
    iata: "SJO",
    city: "San José",
    name: "Juan Santamaría",
    country: "CR",
    aliases: ["san jose", "sjo", "costa rica", "kostarika"],
  },
  {
    iata: "LIR",
    city: "Liberia",
    name: "Guanacaste",
    country: "CR",
    aliases: ["liberia", "lir", "guanacaste", "costa rica"],
  },
  {
    iata: "SCL",
    city: "Santiago",
    name: "Arturo Merino Benítez",
    country: "CL",
    aliases: ["santiago", "scl", "chile", "cile"],
  },
  {
    iata: "ANF",
    city: "Antofagasta",
    name: "Andrés Sabella",
    country: "CL",
    aliases: ["antofagasta", "anf", "chile"],
  },
  {
    iata: "AKL",
    city: "Auckland",
    name: "Auckland Airport",
    country: "NZ",
    aliases: ["auckland", "akl", "new zealand", "nova zelandija"],
  },
  {
    iata: "CHC",
    city: "Christchurch",
    name: "Christchurch Airport",
    country: "NZ",
    aliases: ["christchurch", "chc", "new zealand"],
  },
  {
    iata: "YYZ",
    city: "Toronto",
    name: "Pearson International",
    country: "CA",
    aliases: ["toronto", "yyz", "canada", "kanada"],
  },
  {
    iata: "YVR",
    city: "Vancouver",
    name: "Vancouver International",
    country: "CA",
    aliases: ["vancouver", "yvr", "canada", "kanada"],
  },
  {
    iata: "NQZ",
    city: "Astana",
    name: "Nursultan Nazarbayev International",
    country: "KZ",
    aliases: [
      "astana",
      "nur-sultan",
      "nursultan",
      "nqz",
      "tse",
      "kazakhstan",
      "kazahstan",
      "kasachstan",
    ],
  },
  {
    iata: "ALA",
    city: "Almaty",
    name: "Almaty International",
    country: "KZ",
    aliases: ["almaty", "alma ata", "ala", "kazakhstan", "kazahstan", "kasachstan"],
  },
];

const HUB_BY_IATA = new Map(
  POPULAR_DESTINATION_AIRPORTS.map((hub) => [hub.iata.toUpperCase(), hub]),
);

/** Resolve multilingual country query → hub IATAs (longest alias wins). */
export function resolveCountryDestinationHubs(query: string): string[] {
  const q = normalizeAirportQuery(query);
  if (q.length < 2) return [];

  let best: { aliasLen: number; iatas: string[] } | null = null;
  for (const entry of COUNTRY_TO_HUBS) {
    for (const alias of entry.aliases) {
      const a = normalizeAirportQuery(alias);
      if (!a) continue;
      const exact = a === q;
      const prefix = q.length >= 4 && a.startsWith(q);
      if (!exact && !prefix) continue;
      if (!best || a.length > best.aliasLen || (a.length === best.aliasLen && exact)) {
        best = { aliasLen: a.length, iatas: [...entry.iatas] };
      }
    }
  }
  return best?.iatas ?? [];
}

function scoreDest(hub: AirportHub, q: string): number {
  if (!q) return 0;
  const iata = hub.iata.toLowerCase();
  if (iata === q) return 10_000;
  if (iata.startsWith(q)) return 9_000;
  const city = normalizeAirportQuery(hub.city);
  const name = normalizeAirportQuery(hub.name);
  if (city === q) return 8_500;
  if (city.startsWith(q)) return 8_000;
  if (city.includes(q)) return 7_000;
  if (name.includes(q)) return 5_000;
  for (const alias of hub.aliases) {
    const a = normalizeAirportQuery(alias);
    if (a === q) return 8_200;
    if (a.startsWith(q)) return 7_500;
    if (a.includes(q)) return 6_000;
  }
  return 0;
}

/** Local destination airport suggestions (popular + origin hubs). */
export function searchDestinationAirports(
  query: string,
  limit = 8,
): PlaceSuggestion[] {
  const q = normalizeAirportQuery(query);
  if (q.length < 2) return [];

  const countryIatas = resolveCountryDestinationHubs(query);
  const fromCountry: PlaceSuggestion[] = [];
  for (const iata of countryIatas) {
    const hub = HUB_BY_IATA.get(iata.toUpperCase());
    if (hub) fromCountry.push(hubToSuggestion(hub));
  }

  const fromPopular = POPULAR_DESTINATION_AIRPORTS.map((hub) => ({
    hub,
    score: scoreDest(hub, q),
  }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => hubToSuggestion(x.hub));

  // Catalog hubs only when city/IATA actually contains the query — avoid
  // fuzzy noise like "phuke" → Belgrade/Venice.
  const fromCatalog = searchAirportCatalog(query, limit).filter((s) => {
    const iata = s.iata.toLowerCase();
    const city = normalizeAirportQuery(s.city);
    const name = normalizeAirportQuery(s.name);
    return iata.startsWith(q) || city.includes(q) || name.includes(q);
  });

  const seen = new Set<string>();
  const out: PlaceSuggestion[] = [];
  // Country hubs first (guarantees ≥2 for country queries), then city matches.
  for (const s of [...fromCountry, ...fromPopular, ...fromCatalog]) {
    const key = s.iata.toUpperCase();
    if (!/^[A-Z]{3}$/.test(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...s, iata: key });
    if (out.length >= limit) break;
  }
  return out;
}

export function formatDestinationAirportPick(s: PlaceSuggestion): {
  value: string;
  label: string;
} {
  const city = s.city || s.name.replace(/ Airport$/i, "");
  return {
    value: `${city} (${s.iata})`,
    label: `${city} (${s.iata})`,
  };
}
