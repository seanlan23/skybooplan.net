type Dict = Partial<Record<string, string>>;

/** Legal / cookie pages for es/fr/it/de. */
export const legalUiByLang: Record<"es" | "fr" | "it" | "de", Dict> = {
  es: {
    "legal.backHome": "Volver al inicio",
    "cookieConsent.label": "Consentimiento de cookies",
    "cookieConsent.message":
      "Usamos cookies para una mejor experiencia. Al continuar, aceptas nuestra política de privacidad.",
    "cookieConsent.acceptAll": "Aceptar todo",
    "cookieConsent.essential": "Solo esenciales",
    "about.title": "Sobre nosotros y contacto",
    "about.body":
      "Skybooplan es un planificador de viajes con IA operado por myAxon.si. Nuestra misión es simplificar la planificación con inteligencia artificial. Para dudas o soporte: info@skybooplan.com.",
    "terms.title": "Términos del servicio",
    "terms.intro":
      "Skybooplan es una plataforma independiente de planificación de viajes con IA.",
    "terms.importantTitle": "Importante",
    "terms.important":
      "Skybooplan es independiente y no pertenece a Skyscanner, Booking.com, Duffel ni a otras marcas aéreas/hoteleras. Los enlaces de reserva de hoteles pueden incluir tracking de afiliados de Booking.com; podemos ganar una comisión si reservas, sin coste extra para ti.\nLos precios y datos de vuelos y alojamiento son orientativos y pueden cambiar. Las reservas finales se rigen por las condiciones de cada proveedor.\nLos planes los genera inteligencia artificial (modelos LLM) y pueden ser incorrectos o incompletos. Tú eres responsable de verificar la información y de las decisiones finales.\nLos precios incluyen IVA cuando corresponda.",
    "terms.liabilityTitle": "Limitación de responsabilidad",
    "terms.liability":
      "Skybooplan no acepta responsabilidad por daños, pérdidas o inexactitudes derivadas del uso de la plataforma o de sus datos. El uso es bajo tu propio riesgo.",
    "terms.body":
      "Skybooplan es una plataforma independiente de planificación de viajes con IA. No pertenece a Skyscanner, Booking.com ni Duffel. Los enlaces de hoteles pueden usar el afiliado de Booking.com (comisión posible sin coste extra). Los precios son orientativos. Los planes IA pueden ser incompletos. El uso es bajo tu propio riesgo.",
    "privacy.title": "Privacidad y cookies",
    "privacy.body":
      "MyAxon protege tus datos personales conforme al RGPD. Solo recogemos lo necesario para la búsqueda y los pagos (e-mail, destinos). Las cookies se usan solo para la sesión y analítica de visitas.",
    "refunds.title": "Reembolsos",
    "refunds.body":
      "Como entregamos contenido digital de inmediato (planes IA y PDF), no hay reembolso tras generar un plan con éxito. Si hay un error técnico, escribe a info@skybooplan.com y corregiremos el problema o reembolsaremos el pago.",
  },
  fr: {
    "cookieConsent.label": "Consentement cookies",
    "cookieConsent.message":
      "Nous utilisons des cookies pour une meilleure expérience. En continuant, vous acceptez notre politique de confidentialité.",
    "cookieConsent.acceptAll": "Tout accepter",
    "cookieConsent.essential": "Essentiels uniquement",
  },
  it: {
    "legal.backHome": "Torna alla home",
    "cookieConsent.label": "Consenso cookie",
    "cookieConsent.message":
      "Usiamo i cookie per una migliore esperienza. Continuando, accetti la nostra privacy policy.",
    "cookieConsent.acceptAll": "Accetta tutti",
    "cookieConsent.essential": "Solo essenziali",
    "about.title": "Chi siamo e contatti",
    "about.body":
      "Skybooplan è un pianificatore di viaggio IA gestito da myAxon.si. La nostra missione è semplificare la pianificazione con l'intelligenza artificiale. Per domande o supporto: info@skybooplan.com.",
    "terms.title": "Termini di servizio",
    "terms.intro":
      "Skybooplan è una piattaforma indipendente di pianificazione di viaggio con IA.",
    "terms.importantTitle": "Importante",
    "terms.important":
      "Skybooplan è indipendente e non appartiene a Skyscanner, Booking.com, Duffel o ad altri brand aerei/alberghieri. I link di prenotazione hotel possono includere tracking affiliate Booking.com; possiamo ricevere una commissione se prenoti, senza costi extra per te.\nPrezzi e dati di voli e alloggi sono indicativi e possono cambiare. Le prenotazioni finali seguono i termini di ciascun fornitore.\nI piani sono generati da intelligenza artificiale (modelli LLM) e possono essere incompleti o errati. Sei responsabile di verificare le informazioni e delle decisioni finali.\nI prezzi includono l'IVA ove applicabile.",
    "terms.liabilityTitle": "Limitazione di responsabilità",
    "terms.liability":
      "Skybooplan non risponde di danni, perdite o inesattezze derivanti dall'uso della piattaforma o dei suoi dati. L'uso è a tuo rischio.",
    "terms.body":
      "Skybooplan è una piattaforma indipendente di pianificazione di viaggio con IA. Non appartiene a Skyscanner, Booking.com o Duffel. I link hotel possono usare l'affiliate Booking.com (commissione possibile senza costi extra). I prezzi sono indicativi. I piani IA possono essere incompleti. L'uso è a tuo rischio.",
    "privacy.title": "Privacy e cookie",
    "privacy.body":
      "MyAxon protegge i tuoi dati personali ai sensi del GDPR. Raccogliamo solo i dati necessari per ricerca e pagamenti (email, destinazioni). I cookie servono solo alla sessione e all'analisi delle visite.",
    "refunds.title": "Rimborsi",
    "refunds.body":
      "Poiché forniamo contenuti digitali subito (piani IA e PDF), non è possibile il rimborso dopo la generazione riuscita di un piano. In caso di errore tecnico, scrivi a info@skybooplan.com e correggeremo il problema o rimborseremo il pagamento.",
  },
  de: {
    "legal.backHome": "Zurück zur Startseite",
    "cookieConsent.label": "Cookie-Einwilligung",
    "cookieConsent.message":
      "Wir verwenden Cookies für ein besseres Erlebnis. Mit dem Fortfahren stimmst du unserer Datenschutzerklärung zu.",
    "cookieConsent.acceptAll": "Alle akzeptieren",
    "cookieConsent.essential": "Nur essenziell",
    "about.title": "Über uns & Kontakt",
    "about.body":
      "Skybooplan ist ein KI-Reiseplaner von myAxon.si. Unsere Mission: Reiseplanung mit künstlicher Intelligenz zu vereinfachen. Fragen oder Support: info@skybooplan.com.",
    "terms.title": "Nutzungsbedingungen",
    "terms.intro":
      "Skybooplan ist eine unabhängige KI-gestützte Reiseplanungsplattform.",
    "terms.importantTitle": "Wichtig",
    "terms.important":
      "Skybooplan ist unabhängig und gehört nicht Skyscanner, Booking.com, Duffel oder anderen Flug-/Hotelmarken. Hotel-Buchungslinks können Booking.com-Affiliate-Tracking enthalten; bei einer Buchung können wir eine Provision erhalten — ohne Mehrkosten für dich.\nFlug- und Unterkunftspreise sowie Daten sind indikativ und können sich ändern. Endgültige Buchungen unterliegen den Bedingungen der jeweiligen Anbieter.\nPläne werden von künstlicher Intelligenz (LLM-Modelle) erzeugt und können fehlerhaft oder unvollständig sein. Du bist allein verantwortlich für die Prüfung der Informationen und finale Entscheidungen.\nAlle Preise enthalten ggf. MwSt.",
    "terms.liabilityTitle": "Haftungsbeschränkung",
    "terms.liability":
      "Skybooplan haftet nicht für Schäden, Verluste oder Ungenauigkeiten aus der Nutzung der Plattform oder ihrer Daten. Die Nutzung erfolgt auf eigene Gefahr.",
    "terms.body":
      "Skybooplan ist eine unabhängige KI-Reiseplanungsplattform. Sie gehört nicht Skyscanner, Booking.com oder Duffel. Hotel-Links können das Booking.com-Affiliate-Programm nutzen (Provision möglich, ohne Mehrkosten). Preise sind indikativ. KI-Pläne können unvollständig sein. Nutzung auf eigene Gefahr.",
    "privacy.title": "Datenschutz & Cookies",
    "privacy.body":
      "MyAxon schützt deine personenbezogenen Daten gemäß DSGVO. Wir erheben nur Daten, die für Suche und Zahlungen nötig sind (E-Mail, gewählte Ziele). Cookies dienen nur der Sitzung und der Besuchsanalyse.",
    "refunds.title": "Rückerstattungen",
    "refunds.body":
      "Da wir digitale Inhalte sofort liefern (KI-Reisepläne und PDF), sind Rückerstattungen nach erfolgreicher Plan-Generierung nicht möglich. Bei einem technischen Fehler auf der Plattform kontaktiere info@skybooplan.com — wir beheben das Problem oder erstatten die Zahlung.",
  },
};
