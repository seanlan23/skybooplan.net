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

function lang2(lang: LangCode): "sl" | "de" | "en" {
  const c = lang.toLowerCase().slice(0, 2);
  if (c === "sl") return "sl";
  if (c === "de") return "de";
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
