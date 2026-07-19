# Skybooplan + Make.com — od nič do delujočega

## Kaj jaz (Cursor) lahko naredim zate

| Da | Ne |
|----|-----|
| Pripravim blueprint z vgrajenim Duffel ključem | Se prijavim v tvoj Make.com |
| Napišem točne vrednosti za Vercel | Ustvarim webhook v Make namesto tebe |
| Popravim kodo aplikacije | Kliknem „Connect“ pri Gemini v Make |

**Skupaj ~15 min tvojega dela** (Make + Vercel), potem dela.

---

## Korak 1 — Pošlji mi te podatke (v chat)

```
1. Duffel API key:     duffel_live_...
2. Gemini API key:     AIzaSy...   (isti kot za Google AI Studio)
```

Opcijsko (če hočeš fallback brez Make):
```
3. OPENAI_API_KEY:     sk-...   (ni obvezno za Make scenarij)
```

**Ne pošiljaj** gesel za Make/Google račun — samo API ključe.

Jaz vstavim Duffel ključ v blueprint. Datoteke dobiš v `make/ready/`.

---

## Korak 2 — Ti v Make.com (5 min)

### A) Data store (enkrat)

Make → **Data stores** → **Add**

- Ime: `flight_search_results`
- Polja: `status` (Text), `offers` (Text)

### B) Gemini povezava (enkrat)

Make → **Connections** → **Add** → **Google Gemini AI**

- API key: tvoj Gemini ključ

### C) Uvozi 2 scenarija

Za vsakega: **Scenarios → Create → desni klik → Import Blueprint**

| Datoteka | Scenarij |
|----------|----------|
| `make/ready/skybooplan-flight-search-simple.ready.blueprint.json` | Iskanje |
| `make/ready/skybooplan-flight-status.ready.blueprint.json` | Status |

Po uvozu **iskanja** poveži (klik na rdeče module):

1. **Webhook** — ustvari hook `skybooplan-search`
2. **HTTP** — Duffel ključ je že v headerju (če si uvozil ready datoteko)
3. **Gemini** — izberi svojo Gemini povezavo
4. **Data store** — izberi `flight_search_results`

Po uvozu **statusa** poveži:

1. **Webhook** — hook `skybooplan-search-status`
2. **Data store Get record** — isti `flight_search_results`

**Vklopi oba scenarija (ON).**

### D) Pošlji mi 2 webhook URL-ja

Iz modula Webhook → **Copy address to clipboard**:

```
MAKE_WEBHOOK_URL=         https://hook.eu1.make.com/...
MAKE_STATUS_WEBHOOK_URL=  https://hook.eu1.make.com/...
```

---

## Korak 3 — Vercel env (2 min)

V **Vercel → Project → Settings → Environment Variables**:

| Spremenljivka | Vrednost |
|---------------|----------|
| `MAKE_WEBHOOK_URL` | URL iskalnega webhooka |
| `MAKE_STATUS_WEBHOOK_URL` | URL status webhooka |
| `DUFFEL_API_KEY` | isti Duffel ključ (fallback) |
| `GEMINI_API_KEY` | za AI načrt potovanja |

**Redeploy** po shranjevanju.

---

## Korak 4 — Test

1. Make → search scenarij → **Run once** (ali iskanje iz Sky chata)
2. History → zadnji modul **Data store** → `offers` = JSON s 3 leti
3. Aplikacija → po ~30–90 s tri kartice letov

---

## Tok scenarija (enostavna verzija)

```
Webhook (parsedData iz appa)
  → Iterator (origin_airports)
  → HTTP Duffel
  → Aggregator
  → Gemini (top 3)
  → Set variable (cleanOffers)
  → Set multiple variables (storeKey, storeOffers)
  → Data store (status: done)
```

Status scenarij:

```
Webhook (searchId) → Data store Get → Webhook response
```

### Če app išče 1–3 min in ne najde nič

1. **Search scenarij History** — mora priti do Data store z `status: done` in `offers` (JSON string). Če scenarij pade (Duffel/Gemini), status ostane prazen.
2. **Status Webhook response Body** — ne uporabljaj surovega `{{1.offers}}` brez privzete vrednosti. Ko je polje prazno, Make vrne neveljaven JSON (`"offers":}`). Primer:

```json
{"key":"{{1.key}}","status":"{{1.status}}","offers":{{ifempty(1.offers; null)}}}
```

ali shrani `offers` vedno kot Text in v Body uporabi:

```json
{"key":"{{1.key}}","status":"{{1.status}}","offers":{{ifempty(1.offers; "[]")}}}
```
