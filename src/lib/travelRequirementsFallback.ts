/**
 * Curated visa / health / cost copy by destination country (ISO).
 * Used when Gemini omits travel_requirements or returns generic boilerplate.
 */

export type CuratedTravelPack = {
  visaRequirement: string;
  howToApply: string;
  vaccinations: string;
  estimatedCosts: string;
};

type LangCode = string;

/** Active pack languages only — retired es/fr/it fall back to English. */
function lang2(lang: LangCode): "sl" | "de" | "en" {
  const c = lang.toLowerCase().slice(0, 2);
  if (c === "sl" || c === "de") return c;
  return "en";
}

/** EU/Schengen free-movement destinations for EU passport holders. */
export const SCHENGEN_EU_DEST = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IS",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "NO",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "CH",
  "LI",
]);

function schengenInternal(destName: string, lang: LangCode): CuratedTravelPack {
  const L = lang2(lang);
  if (L === "sl") {
    return {
      visaRequirement: `Državljani EU/Schengen za potovanje v ${destName} ne potrebujejo vize. Velja prosti pretok oseb — zadostuje veljavna osebna izkaznica ali potni list. Ni omejitve “90/180 dni” kot pri tretjih državah; bivanje ureja domača zakonodaja gostitelja. Pri avtodomu imej pripravljene dokumente vozila (prometno, zavarovanje zelene karte / kjer je potrebno).`,
      howToApply:
        "Ni prijave za vizo. Na meji (če je) pokažeš osebni dokument. Za daljše bivanje preveri lokalna pravila o prijavi prebivališča — za turistični obisk nekaj tednov običajno ni treba ničesar.",
      vaccinations:
        "Posebna potovalna cepljenja za EU destinacije niso obvezna. Posodobljena rutinska cepljenja (tetanus, MMR) zadostujejo. V poletnih mesecih: sončna zaščita, hidracija; v južnih regijah lahko tudi sredstvo proti komarjem.",
      estimatedCosts:
        "Viza: 0 €. Cepljenja: 0 €, če so rutinska že urejena. Morebitni stroški: zeleno zavarovanje za vozilo / vinjete / cestnine glede na državo.",
    };
  }
  if (L === "de") {
    return {
      visaRequirement: `EU-/Schengen-Bürger brauchen für Reisen nach ${destName} kein Visum. Es gilt Personenfreizügigkeit — Personalausweis oder Reisepass reicht. Die Drittstaaten-Regel “90/180 Tage” gilt nicht. Beim Wohnmobil Fahrzeugpapiere und Versicherung (grüne Karte, falls nötig) mitführen.`,
      howToApply:
        "Kein Visumantrag nötig. An Grenzen ggf. Ausweis zeigen. Für längere Aufenthalte lokale Meldepflichten prüfen — bei mehrwöchigem Tourismus meist nicht erforderlich.",
      vaccinations:
        "Keine speziellen Reiseimpfungen für EU-Ziele nötig. Routineimpfungen (Tetanus, MMR) aktuell halten. Im Sommer: Sonnenschutz, Flüssigkeitszufuhr; im Süden ggf. Mückenschutz.",
      estimatedCosts:
        "Visum: 0 €. Impfungen: 0 € bei aktuellen Routineimpfungen. Extra: Fahrzeugversicherung / Vignetten / Maut je nach Land.",
    };
  }
  if (L === "it") {
    return {
      visaRequirement: `I cittadini UE/Schengen non hanno bisogno di visto per ${destName}. Vale la libera circolazione — basta carta d'identità o passaporto validi. La regola “90/180 giorni” per i paesi terzi non si applica. Con il camper porta documenti del veicolo e assicurazione (carta verde se richiesta).`,
      howToApply:
        "Nessuna domanda di visto. Alle frontiere mostra il documento se richiesto. Per soggiorni lunghi verifica eventuali obblighi di registrazione — per qualche settimana di turismo di solito non serve.",
      vaccinations:
        "Nessun vaccino di viaggio speciale per destinazioni UE. Mantieni aggiornati i vaccini di routine (tetano, MPR). In estate: protezione solare e idratazione; al sud eventuale repellente.",
      estimatedCosts:
        "Visto: 0 €. Vaccini: 0 € se i routine sono in regola. Extra: assicurazione veicolo / vignette / pedaggi a seconda del paese.",
    };
  }
  if (L === "es") {
    return {
      visaRequirement: `Los ciudadanos UE/Schengen no necesitan visado para ${destName}. Aplica libre circulación — basta DNI o pasaporte válido. La regla “90/180 días” de terceros países no aplica. Con autocaravana lleva papeles del vehículo y seguro (carta verde si hace falta).`,
      howToApply:
        "Sin solicitud de visado. En fronteras muestra el documento si te lo piden. Estancias largas: revisa registro local — para unas semanas de turismo suele no hacer falta.",
      vaccinations:
        "No hay vacunas de viaje especiales para destinos UE. Mantén al día las de rutina (tétanos, triple vírica). En verano: protección solar e hidratación; en el sur, repelente.",
      estimatedCosts:
        "Visado: 0 €. Vacunas: 0 € si las de rutina están al día. Extra: seguro del vehículo / viñetas / peajes según el país.",
    };
  }
  if (L === "fr") {
    return {
      visaRequirement: `Les citoyens UE/Schengen n'ont pas besoin de visa pour ${destName}. Libre circulation — carte d'identité ou passeport suffit. La règle « 90/180 jours » des pays tiers ne s'applique pas. En camping-car, emportez papiers du véhicule et assurance (carte verte si besoin).`,
      howToApply:
        "Pas de demande de visa. Aux frontières, présentez une pièce d'identité si demandé. Pour un long séjour, vérifiez les règles locales — pour quelques semaines de tourisme, en général rien à faire.",
      vaccinations:
        "Pas de vaccins de voyage spéciaux pour l'UE. Gardez les vaccins de routine à jour (tétanos, ROR). En été : protection solaire et hydratation ; au sud, répulsif moustiques.",
      estimatedCosts:
        "Visa : 0 €. Vaccins : 0 € si les routines sont à jour. Extra : assurance véhicule / vignettes / péages selon le pays.",
    };
  }
  return {
    visaRequirement: `EU/Schengen citizens do not need a visa for ${destName}. Free movement applies — a valid ID card or passport is enough. The third-country “90/180 days” rule does not apply. For motorhomes, carry vehicle papers and insurance (green card where needed).`,
    howToApply:
      "No visa application. Show ID at borders if checked. Longer stays may have local registration rules — not usually needed for a few weeks of tourism.",
    vaccinations:
      "No special travel vaccines required for EU destinations. Keep routine vaccines (tetanus, MMR) up to date. In summer: sun protection and hydration; mosquito repellent in southern regions.",
    estimatedCosts:
      "Visa: €0. Vaccines: €0 if routines are current. Extra costs: vehicle insurance / vignettes / tolls depending on the country.",
  };
}

function albaniaPack(lang: LangCode): CuratedTravelPack {
  const L = lang2(lang);
  if (L === "sl") {
    return {
      visaRequirement:
        "Državljani EU/Schengen lahko v Albanijo vstopijo brez vize do 90 dni v 180-dnevnem obdobju. Potni list ali osebna izkaznica (preveri, ali tvoja država dovoljuje vstop z osebno). Potni list naj velja še med bivanjem.",
      howToApply:
        "Ni vize vnaprej. Na meji pokažeš osebni dokument. Pri avtodomu: zelena karta / zavarovanje, prometno dovoljenje; cestnine so nizke, gotovina (ALL/EUR) je koristna.",
      vaccinations:
        "Priporočeno: posodobljena rutinska cepljenja; hepatitis A je smiseln pri daljšem potovanju ali kampiranju. Malarija v turističnih območjih ni tipična; imej repelent poleti.",
      estimatedCosts:
        "Viza: 0 € (do 90 dni). Hepatitis A (če še nimaš): približno 40–80 €. Ostalo: gorivo, kampi, morebitne cestnine.",
    };
  }
  if (L === "de") {
    return {
      visaRequirement:
        "EU-/Schengen-Bürger können visumfrei bis 90 Tage in 180 Tagen nach Albanien einreisen. Reisepass oder Personalausweis (je nach ausstellendem Staat). Pass sollte für die Aufenthaltsdauer gültig sein.",
      howToApply:
        "Kein Visum im Voraus. Ausweis an der Grenze vorzeigen. Wohnmobil: Versicherung/grüne Karte, Fahrzeugpapiere; etwas Bargeld (ALL/EUR) ist praktisch.",
      vaccinations:
        "Empfohlen: aktuelle Routineimpfungen; Hepatitis A bei längerem Aufenthalt/Camping sinnvoll. Malaria in Touristengebieten unüblich; im Sommer Repellent mitnehmen.",
      estimatedCosts:
        "Visum: 0 € (bis 90 Tage). Hepatitis A (falls nötig): ca. 40–80 €. Sonst: Kraftstoff, Camping, ggf. Maut.",
    };
  }
  if (L === "it") {
    return {
      visaRequirement:
        "I cittadini UE/Schengen possono entrare in Albania senza visto fino a 90 giorni in 180. Passaporto o carta d'identità (verifica il tuo paese). Il passaporto deve restare valido per il soggiorno.",
      howToApply:
        "Nessun visto in anticipo. Mostra il documento al confine. Camper: assicurazione/carta verde e documenti veicolo; contanti (ALL/EUR) utili.",
      vaccinations:
        "Consigliati: vaccini di routine aggiornati; epatite A per soggiorni lunghi/camping. Malaria rara nelle zone turistiche; repellente in estate.",
      estimatedCosts:
        "Visto: 0 € (fino a 90 giorni). Epatite A se serve: circa 40–80 €. Altro: carburante, campeggi, eventuali pedaggi.",
    };
  }
  if (L === "es") {
    return {
      visaRequirement:
        "Los ciudadanos UE/Schengen pueden entrar en Albania sin visado hasta 90 días en 180. Pasaporte o DNI (según tu país). El pasaporte debe seguir válido durante la estancia.",
      howToApply:
        "Sin visado previo. Muestra el documento en la frontera. Autocaravana: seguro/carta verde y papeles; efectivo (ALL/EUR) útil.",
      vaccinations:
        "Recomendado: vacunas de rutina al día; hepatitis A en viajes largos/camping. Malaria poco habitual en zonas turísticas; repelente en verano.",
      estimatedCosts:
        "Visado: 0 € (hasta 90 días). Hepatitis A si hace falta: unos 40–80 €. Resto: combustible, campings, peajes.",
    };
  }
  if (L === "fr") {
    return {
      visaRequirement:
        "Les citoyens UE/Schengen peuvent entrer en Albanie sans visa jusqu'à 90 jours sur 180. Passeport ou carte d'identité (selon votre pays). Le passeport doit rester valide pendant le séjour.",
      howToApply:
        "Pas de visa à l'avance. Présentez une pièce à la frontière. Camping-car : assurance/carte verte et papiers ; espèces (ALL/EUR) utiles.",
      vaccinations:
        "Recommandé : vaccins de routine à jour ; hépatite A pour long séjour/camping. Paludisme rare en zones touristiques ; répulsif en été.",
      estimatedCosts:
        "Visa : 0 € (jusqu'à 90 jours). Hépatite A si besoin : environ 40–80 €. Autre : carburant, campings, péages.",
    };
  }
  return {
    visaRequirement:
      "EU/Schengen citizens can enter Albania visa-free for up to 90 days in any 180-day period. Passport or national ID (check your issuing country). Passport should remain valid for the stay.",
    howToApply:
      "No visa in advance. Show ID at the border. Motorhome: insurance/green card and vehicle papers; cash (ALL/EUR) is useful.",
    vaccinations:
      "Recommended: up-to-date routine vaccines; hepatitis A is sensible for longer trips or camping. Malaria is uncommon in tourist areas; pack summer repellent.",
    estimatedCosts:
      "Visa: €0 (up to 90 days). Hepatitis A if needed: roughly €40–80. Otherwise fuel, campsites, occasional tolls.",
  };
}

function ukPack(lang: LangCode): CuratedTravelPack {
  const L = lang2(lang);
  if (L === "sl") {
    return {
      visaRequirement:
        "Državljani EU za kratke turistične obiske Združenega kraljestva (do 6 mesecev) ne potrebujejo vize, od 2025 pa večina potrebuje electronic travel authorisation (ETA) pred prihodom. Potni list (ne osebna izkaznica) je obvezen.",
      howToApply:
        "ETA oddaj prek uradne UK ETA aplikacije / GOV.UK pred potovanjem (nizka pristojbina, veljavnost običajno 2 leti za več vstopov). Ob vstopu potni list.",
      vaccinations:
        "Posebna cepljenja niso potrebna. Posodobljena rutinska cepljenja zadostujejo.",
      estimatedCosts:
        "ETA: okoli 10–16 GBP na osebo. Viza za turizem: 0 £. Cepljenja: 0 €, če so rutinska urejena.",
    };
  }
  if (L === "de") {
    return {
      visaRequirement:
        "EU-Bürger brauchen für kurze Tourismusbesuche im Vereinigten Königreich (bis 6 Monate) kein Visum, benötigen aber seit 2025 in der Regel eine ETA (Electronic Travel Authorisation) vor Anreise. Reisepass (kein Personalausweis) ist Pflicht.",
      howToApply:
        "ETA über die offizielle UK-ETA-App / GOV.UK vor der Reise beantragen (geringe Gebühr, meist 2 Jahre Mehrfachreisen). Bei Einreise Reisepass vorzeigen.",
      vaccinations:
        "Keine speziellen Impfungen nötig. Routineimpfungen aktuell halten.",
      estimatedCosts:
        "ETA: ca. 10–16 GBP pro Person. Touristenvisum: 0 £. Impfungen: 0 € bei aktuellen Routineimpfungen.",
    };
  }
  if (L === "it") {
    return {
      visaRequirement:
        "I cittadini UE non hanno bisogno di visto per soggiorni turistici brevi nel Regno Unito (fino a 6 mesi), ma dal 2025 la maggior parte richiede un'ETA (Electronic Travel Authorisation) prima dell'arrivo. Serve il passaporto (non la carta d'identità).",
      howToApply:
        "Richiedi l'ETA tramite l'app ufficiale UK ETA / GOV.UK prima del viaggio (tariffa bassa; di solito valida 2 anni per più ingressi). All'arrivo presenta il passaporto.",
      vaccinations:
        "Nessun vaccino speciale. Mantieni aggiornati i vaccini di routine.",
      estimatedCosts:
        "ETA: circa 10–16 GBP a persona. Visto turistico: 0 £. Vaccini: 0 € se i routine sono in regola.",
    };
  }
  if (L === "es") {
    return {
      visaRequirement:
        "Los ciudadanos UE no necesitan visado para estancias turísticas cortas en el Reino Unido (hasta 6 meses), pero desde 2025 la mayoría necesita ETA (Electronic Travel Authorisation) antes de llegar. Se requiere pasaporte (no DNI).",
      howToApply:
        "Solicita la ETA en la app oficial UK ETA / GOV.UK antes del viaje (tarifa baja; suele valer 2 años para varias entradas). Presenta el pasaporte a la llegada.",
      vaccinations:
        "No hacen falta vacunas especiales. Mantén al día las de rutina.",
      estimatedCosts:
        "ETA: unas 10–16 GBP por persona. Visado turístico: 0 £. Vacunas: 0 € si las de rutina están al día.",
    };
  }
  if (L === "fr") {
    return {
      visaRequirement:
        "Les citoyens UE n'ont pas besoin de visa pour un court séjour touristique au Royaume-Uni (jusqu'à 6 mois), mais depuis 2025 la plupart ont besoin d'une ETA (Electronic Travel Authorisation) avant l'arrivée. Passeport obligatoire (pas la carte d'identité).",
      howToApply:
        "Demandez l'ETA via l'appli officielle UK ETA / GOV.UK avant le voyage (faible frais ; souvent valable 2 ans pour plusieurs entrées). Présentez le passeport à l'arrivée.",
      vaccinations:
        "Pas de vaccins spéciaux. Gardez les vaccins de routine à jour.",
      estimatedCosts:
        "ETA : environ 10–16 GBP par personne. Visa tourisme : 0 £. Vaccins : 0 € si les routines sont à jour.",
    };
  }
  return {
    visaRequirement:
      "EU citizens do not need a visa for short UK tourism stays (up to 6 months) but most need an Electronic Travel Authorisation (ETA) before travel (from 2025). A passport (not an ID card) is required.",
    howToApply:
      "Apply for ETA via the official UK ETA app / GOV.UK before travel (low fee; typically valid 2 years for multiple trips). Present your passport on arrival.",
    vaccinations:
      "No special travel vaccines needed. Keep routine vaccines up to date.",
    estimatedCosts:
      "ETA: about £10–16 per person. Tourist visa: £0. Vaccines: €0 if routines are current.",
  };
}

function usaPack(lang: LangCode): CuratedTravelPack {
  const L = lang2(lang);
  if (L === "sl") {
    return {
      visaRequirement:
        "Državljani večine EU držav za turizem do 90 dni potrebujejo ESTA (Visa Waiver Program), ne klasične vize B1/B2. Potni list mora biti biometričen; odobritev ESTA pred odhodom je obvezna.",
      howToApply:
        "Oddaj ESTA na uradni strani CBP (esta.cbp.dhs.gov) vsaj 72 ur pred odhodom — pristojbina okoli 21 USD. Potrdilo natisni ali shrani v telefon.",
      vaccinations:
        "Posebna cepljenja za ZDA niso obvezna. Rutinska cepljenja naj bodo posodobljena. Za nacionalne parke: sončna zaščita, morebiti višinska prilagoditev.",
      estimatedCosts:
        "ESTA: približno 21 USD na osebo. Klasična viza ni potrebna pri odobreni ESTA. Cepljenja: 0 €, če so rutinska urejena.",
    };
  }
  if (L === "de") {
    return {
      visaRequirement:
        "Bürger der meisten EU-Staaten brauchen für Tourismus bis 90 Tage ESTA (Visa Waiver), kein klassisches B1/B2-Visum. Reisepass muss biometrisch sein; ESTA-Genehmigung vor Abflug ist Pflicht.",
      howToApply:
        "ESTA auf der offiziellen CBP-Seite (esta.cbp.dhs.gov) mindestens 72 Stunden vor Abflug beantragen — Gebühr ca. 21 USD. Bestätigung speichern.",
      vaccinations:
        "Keine speziellen Impfungen für die USA nötig. Routineimpfungen aktuell halten.",
      estimatedCosts:
        "ESTA: ca. 21 USD pro Person. Klassisches Visum bei genehmigter ESTA nicht nötig. Impfungen: 0 € bei aktuellen Routineimpfungen.",
    };
  }
  if (L === "it") {
    return {
      visaRequirement:
        "I cittadini della maggior parte dei paesi UE per il turismo fino a 90 giorni necessitano di ESTA (Visa Waiver), non di un visto B1/B2 classico. Passaporto biometrico obbligatorio; approvazione ESTA prima della partenza.",
      howToApply:
        "Richiedi ESTA sul sito ufficiale CBP (esta.cbp.dhs.gov) almeno 72 ore prima della partenza — circa 21 USD. Salva la conferma.",
      vaccinations:
        "Nessun vaccino speciale per gli USA. Mantieni aggiornati i vaccini di routine.",
      estimatedCosts:
        "ESTA: circa 21 USD a persona. Con ESTA approvata non serve il visto classico. Vaccini: 0 € se i routine sono in regola.",
    };
  }
  if (L === "es") {
    return {
      visaRequirement:
        "Los ciudadanos de la mayoría de países UE necesitan ESTA (Visa Waiver) para turismo hasta 90 días, no un visado B1/B2 clásico. Pasaporte biométrico obligatorio; aprobación ESTA antes de salir.",
      howToApply:
        "Solicita ESTA en el sitio oficial CBP (esta.cbp.dhs.gov) al menos 72 horas antes — unos 21 USD. Guarda la confirmación.",
      vaccinations:
        "No hacen falta vacunas especiales para EE. UU. Mantén al día las de rutina.",
      estimatedCosts:
        "ESTA: unos 21 USD por persona. Con ESTA aprobada no hace falta el visado clásico. Vacunas: 0 € si las de rutina están al día.",
    };
  }
  if (L === "fr") {
    return {
      visaRequirement:
        "Les citoyens de la plupart des pays UE ont besoin d'ESTA (Visa Waiver) pour le tourisme jusqu'à 90 jours, pas d'un visa B1/B2 classique. Passeport biométrique obligatoire ; approbation ESTA avant le départ.",
      howToApply:
        "Demandez l'ESTA sur le site officiel CBP (esta.cbp.dhs.gov) au moins 72 h avant le départ — environ 21 USD. Conservez la confirmation.",
      vaccinations:
        "Pas de vaccins spéciaux pour les USA. Gardez les vaccins de routine à jour.",
      estimatedCosts:
        "ESTA : environ 21 USD par personne. Avec ESTA approuvée, pas de visa classique. Vaccins : 0 € si les routines sont à jour.",
    };
  }
  return {
    visaRequirement:
      "Citizens of most EU countries need ESTA (Visa Waiver Program) for tourism up to 90 days — not a classic B1/B2 visa. Passport must be biometric; ESTA approval before departure is mandatory.",
    howToApply:
      "Apply for ESTA on the official CBP site (esta.cbp.dhs.gov) at least 72 hours before departure — fee about US$21. Save the confirmation.",
    vaccinations:
      "No special travel vaccines required for the US. Keep routine vaccines up to date.",
    estimatedCosts:
      "ESTA: about US$21 per person. Classic visa not needed with approved ESTA. Vaccines: €0 if routines are current.",
  };
}

function japanPack(lang: LangCode): CuratedTravelPack {
  const L = lang2(lang);
  if (L === "sl") {
    return {
      visaRequirement:
        "Državljani EU lahko na Japonsko vstopijo brez vize za turizem do 90 dni. Potni list mora veljati za celotno bivanje. Od 2024/25 je za nekatere potnike predviden digitalni obrazec Visit Japan Web (priporočeno).",
      howToApply:
        "Ni vize vnaprej. Pred odhodom izpolni Visit Japan Web / potrebne digitalne prijave, če so aktivne. Ob vstopu potni list in morebitni QR.",
      vaccinations:
        "Posebna cepljenja niso obvezna. Priporočeno: hepatitis A (in B pri daljšem bivanju), posodobljena rutinska cepljenja.",
      estimatedCosts:
        "Viza: 0 € (do 90 dni). Visit Japan Web: brezplačno. Hepatitis A: približno 40–80 €, če še nimaš.",
    };
  }
  if (L === "de") {
    return {
      visaRequirement:
        "EU-Bürger können für Tourismus bis 90 Tage visumfrei nach Japan einreisen. Reisepass muss für die gesamte Aufenthaltsdauer gültig sein. Visit Japan Web / digitale Einreiseformulare sind empfohlen.",
      howToApply:
        "Kein Visum im Voraus. Vor Abflug Visit Japan Web ausfüllen, falls erforderlich. Bei Einreise Reisepass und ggf. QR vorzeigen.",
      vaccinations:
        "Keine Pflichtimpfungen. Empfohlen: Hepatitis A (und B bei längerem Aufenthalt), aktuelle Routineimpfungen.",
      estimatedCosts:
        "Visum: 0 € (bis 90 Tage). Visit Japan Web: kostenlos. Hepatitis A: ca. 40–80 € falls nötig.",
    };
  }
  if (L === "it") {
    return {
      visaRequirement:
        "I cittadini UE possono entrare in Giappone senza visto per turismo fino a 90 giorni. Il passaporto deve essere valido per tutto il soggiorno. Visit Japan Web / moduli digitali sono consigliati.",
      howToApply:
        "Nessun visto in anticipo. Compila Visit Japan Web prima della partenza se richiesto. All'arrivo presenta passaporto (e QR se rilasciato).",
      vaccinations:
        "Nessun vaccino obbligatorio. Consigliati: epatite A (e B per soggiorni lunghi), vaccini di routine aggiornati.",
      estimatedCosts:
        "Visto: 0 € (fino a 90 giorni). Visit Japan Web: gratuito. Epatite A: circa 40–80 € se serve.",
    };
  }
  if (L === "es") {
    return {
      visaRequirement:
        "Los ciudadanos UE pueden entrar en Japón sin visado por turismo hasta 90 días. El pasaporte debe ser válido durante toda la estancia. Se recomienda Visit Japan Web / formularios digitales.",
      howToApply:
        "Sin visado previo. Completa Visit Japan Web antes de salir si aplica. A la llegada presenta pasaporte (y QR si lo hay).",
      vaccinations:
        "No hay vacunas obligatorias. Recomendado: hepatitis A (y B en estancias largas), rutina al día.",
      estimatedCosts:
        "Visado: 0 € (hasta 90 días). Visit Japan Web: gratis. Hepatitis A: unos 40–80 € si hace falta.",
    };
  }
  if (L === "fr") {
    return {
      visaRequirement:
        "Les citoyens UE peuvent entrer au Japon sans visa pour le tourisme jusqu'à 90 jours. Le passeport doit être valide pour tout le séjour. Visit Japan Web / formulaires numériques sont recommandés.",
      howToApply:
        "Pas de visa à l'avance. Remplissez Visit Japan Web avant le départ si requis. À l'arrivée, présentez passeport (et QR le cas échéant).",
      vaccinations:
        "Pas de vaccins obligatoires. Recommandé : hépatite A (et B pour long séjour), routines à jour.",
      estimatedCosts:
        "Visa : 0 € (jusqu'à 90 jours). Visit Japan Web : gratuit. Hépatite A : environ 40–80 € si besoin.",
    };
  }
  return {
    visaRequirement:
      "EU citizens can enter Japan visa-free for tourism up to 90 days. Passport must be valid for the whole stay. Visit Japan Web / digital arrival forms are recommended.",
    howToApply:
      "No visa in advance. Complete Visit Japan Web before departure if required. Show passport (and QR if issued) on arrival.",
    vaccinations:
      "No mandatory travel vaccines. Recommended: hepatitis A (and B for longer stays), up-to-date routines.",
    estimatedCosts:
      "Visa: €0 (up to 90 days). Visit Japan Web: free. Hepatitis A: about €40–80 if needed.",
  };
}

function indonesiaPack(lang: LangCode): CuratedTravelPack {
  const L = lang2(lang);
  if (L === "sl") {
    return {
      visaRequirement:
        "Državljani EU za Bali/Indonezijo običajno dobijo visa on arrival / visa-free shemo za kratki turizem (pogosto 30 dni; preveri aktualno VOA). Potni list vsaj 6 mesecev veljaven; povratna vozovnica je priporočena.",
      howToApply:
        "VOA lahko kupiš na letališču ali oddaš e-VOA pred odhodom (uradni imigracijski portal). Shrani potrdilo. Podaljšanje je omejeno — načrtuj odhod pravočasno.",
      vaccinations:
        "Priporočeno: hepatitis A in B, tifus pri daljšem potovanju; rutinska cepljenja. Rumena mrličča le ob prihodu iz endemične države. Malarija na Baliju nizko tveganje; na drugih otokih preveri regijo.",
      estimatedCosts:
        "VOA: okoli 35 USD na osebo. Cepljenja: približno 80–200 €, odvisno od sheme. e-VOA pristojbina podobna.",
    };
  }
  if (L === "de") {
    return {
      visaRequirement:
        "EU-Bürger erhalten für Bali/Indonesien meist Visa on Arrival / kurzfristige Visumfreiheit (oft 30 Tage; aktuelle VOA prüfen). Reisepass mind. 6 Monate gültig; Rückflug empfohlen.",
      howToApply:
        "VOA am Flughafen oder e-VOA vorab über das offizielle Immigration-Portal. Bestätigung speichern. Verlängerungen sind begrenzt.",
      vaccinations:
        "Empfohlen: Hepatitis A/B, Typhus bei längerer Reise; Routineimpfungen. Gelbfieber nur bei Anreise aus Endemiegebiet. Malaria auf Bali niedrig; andere Inseln prüfen.",
      estimatedCosts:
        "VOA: ca. 35 USD pro Person. Impfungen: ca. 80–200 € je nach Schema.",
    };
  }
  if (L === "it") {
    return {
      visaRequirement:
        "I cittadini UE per Bali/Indonesia ottengono di solito visa on arrival / ingresso breve senza visto (spesso 30 giorni — verifica la VOA attuale). Passaporto valido 6+ mesi; biglietto di ritorno consigliato.",
      howToApply:
        "VOA in aeroporto o e-VOA anticipata sul portale ufficiale immigrazione. Salva la conferma. Le proroghe sono limitate.",
      vaccinations:
        "Consigliati: epatite A/B, tifo per viaggi lunghi; routine. Febbre gialla solo se arrivi da paese endemico. Malaria a Bali bassa; altre isole da verificare.",
      estimatedCosts:
        "VOA: circa 35 USD a persona. Vaccini: circa 80–200 € a seconda del ciclo.",
    };
  }
  if (L === "es") {
    return {
      visaRequirement:
        "Los ciudadanos UE para Bali/Indonesia suelen obtener visa on arrival / entrada corta sin visado (a menudo 30 días — comprueba la VOA actual). Pasaporte válido 6+ meses; billete de vuelta recomendado.",
      howToApply:
        "VOA en el aeropuerto o e-VOA previa en el portal oficial de inmigración. Guarda la confirmación. Las prórrogas son limitadas.",
      vaccinations:
        "Recomendado: hepatitis A/B, tifus en viajes largos; rutina. Fiebre amarilla solo si llegas de un país endémico. Malaria en Bali baja; otras islas a comprobar.",
      estimatedCosts:
        "VOA: unos 35 USD por persona. Vacunas: unos 80–200 € según el esquema.",
    };
  }
  if (L === "fr") {
    return {
      visaRequirement:
        "Les citoyens UE pour Bali/Indonésie obtiennent souvent un visa on arrival / entrée courte sans visa (souvent 30 jours — vérifiez la VOA actuelle). Passeport valide 6+ mois ; billet retour recommandé.",
      howToApply:
        "VOA à l'aéroport ou e-VOA à l'avance sur le portail officiel d'immigration. Conservez la confirmation. Les prolongations sont limitées.",
      vaccinations:
        "Recommandé : hépatite A/B, typhoïde pour long séjour ; routines. Fièvre jaune seulement si arrivée d'un pays endémique. Paludisme faible à Bali ; autres îles à vérifier.",
      estimatedCosts:
        "VOA : environ 35 USD par personne. Vaccins : environ 80–200 € selon le schéma.",
    };
  }
  return {
    visaRequirement:
      "EU citizens usually get visa on arrival / short visa-free entry for Bali/Indonesia (often 30 days — check current VOA). Passport valid 6+ months; return ticket recommended.",
    howToApply:
      "Buy VOA at the airport or apply for e-VOA via the official immigration portal before travel. Save confirmation. Extensions are limited.",
    vaccinations:
      "Recommended: hepatitis A/B, typhoid for longer trips; routine vaccines. Yellow fever only if arriving from an endemic country. Malaria risk is low on Bali; check other islands.",
    estimatedCosts:
      "VOA: about US$35 per person. Vaccines: roughly €80–200 depending on the course.",
  };
}

function turkeyPack(lang: LangCode): CuratedTravelPack {
  const L = lang2(lang);
  if (L === "sl") {
    return {
      visaRequirement:
        "Državljani večine EU držav potrebujejo e-vizo za Turčijo (turizem, običajno do 90 dni). Potni list naj velja še vsaj 6 mesecev od vstopa.",
      howToApply:
        "Oddaj e-vizo na uradni strani www.evisa.gov.tr pred odhodom. Natisni ali shrani PDF; plačilo s kartico.",
      vaccinations:
        "Priporočeno: rutinska cepljenja; hepatitis A pri daljšem potovanju. Posebna obvezna cepljenja za Istanbul/obalo običajno niso potrebna.",
      estimatedCosts:
        "E-viza: okoli 20–60 USD/EUR glede na državljanstvo. Cepljenja: 0–80 €.",
    };
  }
  if (L === "de") {
    return {
      visaRequirement:
        "Bürger der meisten EU-Staaten brauchen für die Türkei ein E-Visum (Tourismus, meist bis 90 Tage). Reisepass sollte bei Einreise noch mind. 6 Monate gültig sein.",
      howToApply:
        "E-Visum vor Abreise auf www.evisa.gov.tr beantragen. PDF speichern; Zahlung per Karte.",
      vaccinations:
        "Empfohlen: Routineimpfungen; Hepatitis A bei längerer Reise. Keine speziellen Pflichtimpfungen für Istanbul/Küste.",
      estimatedCosts:
        "E-Visum: ca. 20–60 USD/EUR je nach Staatsangehörigkeit. Impfungen: 0–80 €.",
    };
  }
  if (L === "it") {
    return {
      visaRequirement:
        "I cittadini della maggior parte dei paesi UE necessitano di e-visa per la Turchia (turismo, di solito fino a 90 giorni). Il passaporto dovrebbe essere valido almeno 6 mesi dall'ingresso.",
      howToApply:
        "Richiedi l'e-visa su www.evisa.gov.tr prima della partenza. Salva il PDF; pagamento con carta.",
      vaccinations:
        "Consigliati: vaccini di routine; epatite A per viaggi lunghi. Nessun vaccino obbligatorio speciale per Istanbul/costa.",
      estimatedCosts:
        "E-visa: circa 20–60 USD/EUR a seconda della cittadinanza. Vaccini: 0–80 €.",
    };
  }
  if (L === "es") {
    return {
      visaRequirement:
        "Los ciudadanos de la mayoría de países UE necesitan e-visa para Turquía (turismo, suele ser hasta 90 días). El pasaporte debería valer al menos 6 meses desde la entrada.",
      howToApply:
        "Solicita la e-visa en www.evisa.gov.tr antes de salir. Guarda el PDF; pago con tarjeta.",
      vaccinations:
        "Recomendado: vacunas de rutina; hepatitis A en viajes largos. Sin vacunas obligatorias especiales para Estambul/costa.",
      estimatedCosts:
        "E-visa: unos 20–60 USD/EUR según nacionalidad. Vacunas: 0–80 €.",
    };
  }
  if (L === "fr") {
    return {
      visaRequirement:
        "Les citoyens de la plupart des pays UE ont besoin d'un e-visa pour la Turquie (tourisme, souvent jusqu'à 90 jours). Le passeport devrait être valide au moins 6 mois à l'entrée.",
      howToApply:
        "Demandez l'e-visa sur www.evisa.gov.tr avant le départ. Conservez le PDF ; paiement par carte.",
      vaccinations:
        "Recommandé : vaccins de routine ; hépatite A pour long séjour. Pas de vaccins obligatoires spéciaux pour Istanbul/côte.",
      estimatedCosts:
        "E-visa : environ 20–60 USD/EUR selon nationalité. Vaccins : 0–80 €.",
    };
  }
  return {
    visaRequirement:
      "Citizens of most EU countries need an e-visa for Türkiye (tourism, typically up to 90 days). Passport should be valid at least 6 months from entry.",
    howToApply:
      "Apply for e-visa at www.evisa.gov.tr before departure. Save the PDF; pay by card.",
    vaccinations:
      "Recommended: routine vaccines; hepatitis A for longer trips. No special mandatory vaccines for Istanbul/coast.",
    estimatedCosts:
      "E-visa: about US$20–60 / € depending on nationality. Vaccines: €0–80.",
  };
}

function egyptPack(lang: LangCode): CuratedTravelPack {
  const L = lang2(lang);
  if (L === "sl") {
    return {
      visaRequirement:
        "Državljani EU za Egipt običajno potrebujejo e-vizo ali vizo ob prihodu (turizem, pogosto 30 dni). Potni list vsaj 6 mesecev veljaven.",
      howToApply:
        "E-vizo oddaj na uradnem portalu (visa2egypt.gov.eg) pred odhodom ali kupi VOA na letališču, kjer je na voljo. Shrani potrdilo.",
      vaccinations:
        "Priporočeno: hepatitis A, tifus; rutinska cepljenja. Rumena mrličča ni tipično obvezna iz Evrope. Pitna voda: raje stekleničena.",
      estimatedCosts:
        "E-viza / VOA: okoli 25 USD. Cepljenja: približno 80–150 €.",
    };
  }
  if (L === "de") {
    return {
      visaRequirement:
        "EU-Bürger brauchen für Ägypten meist E-Visum oder Visum bei Ankunft (Tourismus, oft 30 Tage). Reisepass mind. 6 Monate gültig.",
      howToApply:
        "E-Visum auf dem offiziellen Portal (visa2egypt.gov.eg) oder VOA am Flughafen, falls verfügbar.",
      vaccinations:
        "Empfohlen: Hepatitis A, Typhus; Routineimpfungen. Trinkwasser besser aus Flaschen.",
      estimatedCosts:
        "E-Visum / VOA: ca. 25 USD. Impfungen: ca. 80–150 €.",
    };
  }
  return {
    visaRequirement:
      "EU citizens usually need an e-visa or visa on arrival for Egypt (tourism, often 30 days). Passport valid 6+ months.",
    howToApply:
      "Apply for e-visa on the official portal (visa2egypt.gov.eg) or buy VOA at the airport where available.",
    vaccinations:
      "Recommended: hepatitis A, typhoid; routine vaccines. Prefer bottled water.",
    estimatedCosts:
      "E-visa / VOA: about US$25. Vaccines: roughly €80–150.",
  };
}

function moroccoPack(lang: LangCode): CuratedTravelPack {
  const L = lang2(lang);
  if (L === "sl") {
    return {
      visaRequirement:
        "Državljani večine EU držav lahko v Maroko vstopijo brez vize do 90 dni. Potni list mora veljati še med bivanjem (priporočeno 6 mesecev).",
      howToApply:
        "Ni vize vnaprej. Na meji potni list; izpolni vstopni obrazec, če ga zahtevajo. Pri avtodomu preveri zavarovanje za Maroko.",
      vaccinations:
        "Priporočeno: hepatitis A; tifus pri daljšem potovanju. Rutinska cepljenja. Malarija v tipičnih turističnih krajih nizko tveganje.",
      estimatedCosts:
        "Viza: 0 € (do 90 dni). Hepatitis A: približno 40–80 €, če še nimaš.",
    };
  }
  if (L === "de") {
    return {
      visaRequirement:
        "Bürger der meisten EU-Staaten können visumfrei bis 90 Tage nach Marokko einreisen. Reisepass sollte für den Aufenthalt gültig sein (empfohlen 6 Monate).",
      howToApply:
        "Kein Visum im Voraus. Reisepass an der Grenze; Einreiseformular falls verlangt.",
      vaccinations:
        "Empfohlen: Hepatitis A; Typhus bei längerer Reise. Routineimpfungen. Malaria in typischen Touristenorten niedrig.",
      estimatedCosts:
        "Visum: 0 € (bis 90 Tage). Hepatitis A: ca. 40–80 € falls nötig.",
    };
  }
  return {
    visaRequirement:
      "Citizens of most EU countries can enter Morocco visa-free for up to 90 days. Passport should remain valid for the stay (6 months recommended).",
    howToApply:
      "No visa in advance. Present passport at the border; fill an arrival form if asked. Motorhomes: confirm insurance cover for Morocco.",
    vaccinations:
      "Recommended: hepatitis A; typhoid for longer trips. Routine vaccines. Malaria risk is low in typical tourist areas.",
    estimatedCosts:
      "Visa: €0 (up to 90 days). Hepatitis A: about €40–80 if needed.",
  };
}

function vietnamPack(lang: LangCode): CuratedTravelPack {
  const L = lang2(lang);
  if (L === "sl") {
    return {
      visaRequirement:
        "Državljani EU za Vietnam običajno potrebujejo e-vizo (turizem; pogosto do 90 dni z več vstopi — preveri aktualno shemo). Potni list vsaj 6 mesecev veljaven.",
      howToApply:
        "Oddaj e-vizo na uradnem portalu evisa.xuatnhapcanh.gov.vn pred odhodom. Natisni potrdilo; obdelava traja nekaj delovnih dni.",
      vaccinations:
        "Priporočeno: hepatitis A/B, tifus; rutinska cepljenja. Malarija v mestih nizko, na podeželju preveri. Repelent v deževni sezoni.",
      estimatedCosts:
        "E-viza: okoli 25 USD. Cepljenja: približno 80–200 €.",
    };
  }
  if (L === "de") {
    return {
      visaRequirement:
        "EU-Bürger brauchen für Vietnam meist ein E-Visum (Tourismus; oft bis 90 Tage — aktuelle Regelung prüfen). Reisepass mind. 6 Monate gültig.",
      howToApply:
        "E-Visum auf evisa.xuatnhapcanh.gov.vn vor Abreise beantragen. Bestätigung ausdrucken; Bearbeitung einige Werktage.",
      vaccinations:
        "Empfohlen: Hepatitis A/B, Typhus; Routineimpfungen. Malaria in Städten niedrig.",
      estimatedCosts:
        "E-Visum: ca. 25 USD. Impfungen: ca. 80–200 €.",
    };
  }
  return {
    visaRequirement:
      "EU citizens usually need an e-visa for Vietnam (tourism; often up to 90 days — check current scheme). Passport valid 6+ months.",
    howToApply:
      "Apply at evisa.xuatnhapcanh.gov.vn before departure. Print confirmation; processing takes a few business days.",
    vaccinations:
      "Recommended: hepatitis A/B, typhoid; routine vaccines. Malaria is low in cities; check rural areas.",
    estimatedCosts:
      "E-visa: about US$25. Vaccines: roughly €80–200.",
  };
}

function philippinesPack(lang: LangCode): CuratedTravelPack {
  const L = lang2(lang);
  if (L === "sl") {
    return {
      visaRequirement:
        "Državljani EU lahko na Filipine vstopijo brez vize do 30 dni (turizem). Potni list vsaj 6 mesecev; povratna vozovnica je pogosto zahtevana.",
      howToApply:
        "Ni vize vnaprej za 30 dni. Ob vstopu potni list in dokazilo o odhodu. Podaljšanje je mogoče pri imigraciji za pristojbino.",
      vaccinations:
        "Priporočeno: hepatitis A/B, tifus; rutinska. Malarija na nekaterih otokih — preveri regijo. Repelent in zdravila proti driski.",
      estimatedCosts:
        "Viza (30 dni): 0 €. Podaljšanje: pristojbina lokalno. Cepljenja: približno 80–200 €.",
    };
  }
  if (L === "de") {
    return {
      visaRequirement:
        "EU-Bürger können visumfrei bis 30 Tage auf die Philippinen einreisen. Reisepass mind. 6 Monate; Rückflug oft verlangt.",
      howToApply:
        "Kein Visum im Voraus für 30 Tage. Bei Einreise Pass und Ausreisenachweis. Verlängerung bei Immigration möglich.",
      vaccinations:
        "Empfohlen: Hepatitis A/B, Typhus; Routine. Malaria auf manchen Inseln prüfen.",
      estimatedCosts:
        "Visum (30 Tage): 0 €. Verlängerung lokal gebührenpflichtig. Impfungen: ca. 80–200 €.",
    };
  }
  if (L === "it") {
    return {
      visaRequirement:
        "I cittadini UE possono entrare nelle Filippine senza visto fino a 30 giorni (turismo). Passaporto valido 6+ mesi; biglietto di ritorno spesso richiesto.",
      howToApply:
        "Nessun visto in anticipo per 30 giorni. All'ingresso mostra passaporto e prova di partenza. Proroga possibile all'immigrazione a pagamento.",
      vaccinations:
        "Consigliati: epatite A/B, tifo; routine. Malaria su alcune isole — verifica la regione. Porta repellente.",
      estimatedCosts:
        "Visto (30 giorni): 0 €. Proroga: tariffa locale. Vaccini: circa 80–200 €.",
    };
  }
  if (L === "es") {
    return {
      visaRequirement:
        "Los ciudadanos UE pueden entrar en Filipinas sin visado hasta 30 días (turismo). Pasaporte válido 6+ meses; billete de vuelta a menudo exigido.",
      howToApply:
        "Sin visado previo para 30 días. A la entrada muestra pasaporte y prueba de salida. Prórroga posible en inmigración con tasa.",
      vaccinations:
        "Recomendado: hepatitis A/B, tifus; rutina. Malaria en algunas islas — comprueba la región. Lleva repelente.",
      estimatedCosts:
        "Visado (30 días): 0 €. Prórroga: tasa local. Vacunas: unos 80–200 €.",
    };
  }
  if (L === "fr") {
    return {
      visaRequirement:
        "Les citoyens UE peuvent entrer aux Philippines sans visa jusqu'à 30 jours (tourisme). Passeport valide 6+ mois ; billet retour souvent exigé.",
      howToApply:
        "Pas de visa à l'avance pour 30 jours. À l'entrée, présentez passeport et preuve de départ. Prolongation possible à l'immigration contre frais.",
      vaccinations:
        "Recommandé : hépatite A/B, typhoïde ; routines. Paludisme sur certaines îles — vérifiez la région. Emportez un répulsif.",
      estimatedCosts:
        "Visa (30 jours) : 0 €. Prolongation : frais locaux. Vaccins : environ 80–200 €.",
    };
  }
  return {
    visaRequirement:
      "EU citizens can enter the Philippines visa-free for up to 30 days (tourism). Passport valid 6+ months; return ticket often required.",
    howToApply:
      "No visa in advance for 30 days. Show passport and proof of onward travel. Extensions available at immigration for a fee.",
    vaccinations:
      "Recommended: hepatitis A/B, typhoid; routines. Malaria on some islands — check the region. Pack repellent.",
    estimatedCosts:
      "Visa (30 days): €0. Extension: local fee. Vaccines: roughly €80–200.",
  };
}

function malaysiaSingaporePack(country: "MY" | "SG", lang: LangCode): CuratedTravelPack {
  const name = country === "MY" ? "Malaysia" : "Singapore";
  const L = lang2(lang);
  const days = country === "MY" ? "90" : "90";
  if (L === "sl") {
    return {
      visaRequirement: `Državljani EU lahko v ${name} vstopijo brez vize za kratki turizem (običajno do ${days} dni). Potni list naj velja še med bivanjem.`,
      howToApply:
        "Ni vize vnaprej. Ob vstopu potni list; v Singapurju sledi digitalnim/SGAC navodilom, če so aktivna.",
      vaccinations:
        "Priporočeno: hepatitis A; rutinska cepljenja. Rumena mrličča le ob prihodu iz endemične države.",
      estimatedCosts: "Viza: 0 €. Cepljenja: 0–80 € glede na status rutinskih cepljenj.",
    };
  }
  if (L === "de") {
    return {
      visaRequirement: `EU-Bürger können visumfrei für kurzen Tourismus nach ${name} einreisen (meist bis ${days} Tage).`,
      howToApply:
        "Kein Visum im Voraus. Reisepass bei Einreise; in Singapur ggf. digitale Ankunftsformalitäten beachten.",
      vaccinations:
        "Empfohlen: Hepatitis A; Routineimpfungen. Gelbfieber nur bei Anreise aus Endemiegebiet.",
      estimatedCosts: "Visum: 0 €. Impfungen: 0–80 €.",
    };
  }
  return {
    visaRequirement: `EU citizens can enter ${name} visa-free for short tourism (typically up to ${days} days). Passport should remain valid for the stay.`,
    howToApply:
      "No visa in advance. Present passport on arrival; follow Singapore digital arrival instructions if active.",
    vaccinations:
      "Recommended: hepatitis A; routine vaccines. Yellow fever only if arriving from an endemic country.",
    estimatedCosts: "Visa: €0. Vaccines: €0–80 depending on routine status.",
  };
}

const COUNTRY_NAME: Record<string, { en: string; sl: string; de: string }> = {
  ES: { en: "Spain", sl: "Španijo", de: "Spanien" },
  IT: { en: "Italy", sl: "Italijo", de: "Italien" },
  FR: { en: "France", sl: "Francijo", de: "Frankreich" },
  DE: { en: "Germany", sl: "Nemčijo", de: "Deutschland" },
  NL: { en: "the Netherlands", sl: "Nizozemsko", de: "die Niederlande" },
  AT: { en: "Austria", sl: "Avstrijo", de: "Österreich" },
  PT: { en: "Portugal", sl: "Portugalsko", de: "Portugal" },
  GR: { en: "Greece", sl: "Grčijo", de: "Griechenland" },
  HR: { en: "Croatia", sl: "Hrvaško", de: "Kroatien" },
  BE: { en: "Belgium", sl: "Belgijo", de: "Belgien" },
  CH: { en: "Switzerland", sl: "Švico", de: "die Schweiz" },
  CZ: { en: "Czechia", sl: "Češko", de: "Tschechien" },
  HU: { en: "Hungary", sl: "Madžarsko", de: "Ungarn" },
  PL: { en: "Poland", sl: "Poljsko", de: "Polen" },
  SK: { en: "Slovakia", sl: "Slovaško", de: "die Slowakei" },
  SI: { en: "Slovenia", sl: "Slovenijo", de: "Slowenien" },
  SE: { en: "Sweden", sl: "Švedsko", de: "Schweden" },
  DK: { en: "Denmark", sl: "Dansko", de: "Dänemark" },
  NO: { en: "Norway", sl: "Norveško", de: "Norwegen" },
  FI: { en: "Finland", sl: "Finsko", de: "Finnland" },
  IE: { en: "Ireland", sl: "Irsko", de: "Irland" },
  IS: { en: "Iceland", sl: "Islandijo", de: "Island" },
  RO: { en: "Romania", sl: "Romunijo", de: "Rumänien" },
  BG: { en: "Bulgaria", sl: "Bolgarijo", de: "Bulgarien" },
  CY: { en: "Cyprus", sl: "Ciper", de: "Zypern" },
  MT: { en: "Malta", sl: "Malto", de: "Malta" },
  LU: { en: "Luxembourg", sl: "Luksemburg", de: "Luxemburg" },
  EE: { en: "Estonia", sl: "Estonijo", de: "Estland" },
  LV: { en: "Latvia", sl: "Latvijo", de: "Lettland" },
  LT: { en: "Lithuania", sl: "Litvo", de: "Litauen" },
  LI: { en: "Liechtenstein", sl: "Lihtenštajn", de: "Liechtenstein" },
};

function schengenDestName(cc: string, lang: LangCode): string {
  const L = lang2(lang);
  const names = COUNTRY_NAME[cc];
  if (!names) return cc;
  return names[L];
}

/** Return curated pack for EU-typical travellers, or null if unknown. */
export function curatedTravelPackForCountry(
  countryCode: string | null | undefined,
  lang: LangCode = "en",
): CuratedTravelPack | null {
  const cc = (countryCode ?? "").trim().toUpperCase();
  if (!cc) return null;

  if (cc === "AL") return albaniaPack(lang);
  if (cc === "GB") return ukPack(lang);
  if (cc === "US") return usaPack(lang);
  if (cc === "JP") return japanPack(lang);
  if (cc === "ID") return indonesiaPack(lang);
  if (cc === "TR") return turkeyPack(lang);
  if (cc === "EG") return egyptPack(lang);
  if (cc === "MA") return moroccoPack(lang);
  if (cc === "VN") return vietnamPack(lang);
  if (cc === "PH") return philippinesPack(lang);
  if (cc === "MY" || cc === "SG") return malaysiaSingaporePack(cc, lang);

  if (SCHENGEN_EU_DEST.has(cc)) {
    return schengenInternal(schengenDestName(cc, lang), lang);
  }

  return null;
}

/** True when copy is the old boilerplate “check official sources” stub. */
export function looksGenericTravelCopy(text: string): boolean {
  return /Check current visa requirements|Preveri aktualne vizumske|Aktuelle Visabestimmungen|Rules change often|always verify official|See a travel clinic 4–6|Posvetuj se s potovalno medicino 4–6|Reiseimpfberatung 4–6|budget about €0–150|načrtuj 0–150|plane ca\. 0–150/i.test(
    text,
  );
}

/** True when copy states a concrete rule (visa-free, ESTA, days, fees…). */
export function looksConcreteTravelCopy(text: string): boolean {
  return /\b(visa-free|brezvizum|visumfrei|e-?visa|e-viza|ESTA|ETA|K-ETA|NZeTA|TDAC|VOA|free movement|prosti pretok|Personenfreizügigkeit|90 days|90 dni|30 days|30 dni|60 days|6 mesecev|6 months|\d+\s*(€|USD|GBP|THB))\b/i.test(
    text,
  );
}
