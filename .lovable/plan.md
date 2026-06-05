# Comprehensive App Overhaul Plan

This is a large, multi-area overhaul. I'll group the work into logical batches and ship them in order of severity. Below is the full plan — please confirm before I start so I don't burn cycles on something you'd rather descope.

## 1. Critical data & itinerary bugs

**1a. Itinerary truncated to Day 1 (14-day trip)**
- Raise `max_completion_tokens` to the model maximum and switch the assistant call to a streaming/incremental approach that doesn't rely on a single 16k-token JSON blob.
- Add a server-side validator: after parse, if `plan.days.length < requestedDays`, automatically re-prompt the assistant for the missing days and concatenate them, instead of returning a half plan.
- Tighten the prompt so the model can't "summarize the rest" — explicit per-day enumeration required.

**1b. Timezone offset (-1 day) on flight results**
- Root cause: `new Date("2026-07-10")` parses as UTC midnight, then `.toLocaleDateString()` shifts to previous day in CET/CEST. Replace every date constructor used for display with a timezone-safe parser (`parseISO` from date-fns, or manual `YYYY-MM-DD` split). Audit `SearchPanel`, `FlightResults`, `AiPlanView`, PDF export.

**1c. Flight payload "MXP → BKK → BKK" with same-day duration**
- Bug in the return flight mapping — currently reuses outbound `destination` for the return's destination. Fix the mapping so return uses `origin` as destination and `returnDate` as date. Audit `flights.functions.ts` and `FlightResults.tsx`.

**1d. Search form duplicated below generated plan**
- `routes/index.tsx` renders `SearchPanel` unconditionally. Hide it (or collapse into an "Edit search" button) once `aiPlan` state is populated.

**1e. State persistence on browser back / home navigation**
- Persist `{ searchInputs, generatedPlan, selectedFlights, selectedHotel }` to `localStorage` under a single key (e.g. `skybooplan:lastSession`).
- Rehydrate on `/` mount.
- Clear only on explicit "New plan" action.

## 2. Monetization & dashboard

**2a. "My Trips" items are dead**
- `_authenticated.my-trips.tsx`: wrap each row in `<Link to="/my-trips/$planId" params={{ planId: trip.id }}>`.
- Verify `_authenticated.my-trips.$planId.tsx` loads the saved plan from Supabase and renders `AiPlanView` in read-only mode.

**2b. Move paywall from generation → PDF download**
- Confirm `generateAiPlan` is already free (it is, per current code).
- The "Download PDF" button in `AiPlanView` must call `canDownloadPlan` server fn; if it returns `PAYMENT_REQUIRED`, open the existing Stripe checkout modal (`useStripeCheckout`) with the pricing options.
- Same gate for any "premium details" view triggered from My Trips.
- Remove any remaining paywall gating from the planning flow.

## 3. UI/UX & visual

**3a. Logo checkerboard**
- The asset was already cleaned in a prior turn. I'll verify the rendered logo in both header and footer has no checkerboard by inspecting the PNG alpha and re-running background removal if needed.

**3b. Rich text itinerary blocks**
- Already partially done (RichText component + 80-200 word prompt). Verify markdown renders multi-paragraph + bullets + bold; expand container to never clip; ensure `whitespace-pre-wrap` is set and no `line-clamp` is applied.

**3c. Hotel image carousels**
- Update hotel cards to fetch multiple photos (Booking.com API exposes `photos` array — check `hotels.functions.ts`). Render with shadcn `Carousel` component (`embla-carousel-react` is already installed).

**3d. Hotel "Book" deep-link**
- Build URL using the property's `hotel_id` / `url` from Booking API (e.g. `https://www.booking.com/hotel/{country}/{slug}.html?aid={affiliateId}&checkin=...&checkout=...`). Stop using the generic search URL.

**3e. Mapbox custom avatar markers**
- Replace material icon markers with circular DOM markers containing an `<img>` of the sight (use first photo from Google Places/Mapbox POI lookup for `focusName`). Fallback to category icon if no image.
- Filter tabs: derive available categories from `plan.days[].category`; hide tabs with zero matches (e.g. hide "Plaža" for Bangkok).

**3f. SL/EN localization**
- Audit all components for hardcoded English strings. Move to `src/lib/i18n.tsx` dictionary. Specifically check: hotel section, flight results, "My Trips" page, paywall modal, footer.

## Technical sections by file

```
src/lib/aiPlan.functions.ts        ← 1a (multi-pass generation, validator)
src/lib/dateUtils.ts (new)         ← 1b (timezone-safe date helpers)
src/components/SearchPanel.tsx     ← 1b, 1d
src/components/FlightResults.tsx   ← 1b, 1c
src/lib/flights.functions.ts       ← 1c
src/routes/index.tsx               ← 1d, 1e (persistence + conditional render)
src/lib/sessionStore.ts (new)      ← 1e (localStorage wrapper)
src/routes/_authenticated.my-trips.tsx          ← 2a
src/routes/_authenticated.my-trips.$planId.tsx  ← 2a verify
src/components/AiPlanView.tsx      ← 2b (paywall on PDF), 3b
src/lib/hotels.functions.ts        ← 3c (photos), 3d (deep link)
src/components/HotelCard.tsx       ← 3c, 3d
src/components/TripMap.tsx         ← 3e (avatar markers + filter)
src/lib/i18n.tsx + all components  ← 3f
```

## Order of execution

1. Critical bugs (1a–1e) — these block the core product
2. Paywall reroute + My Trips links (2a, 2b) — revenue
3. UI polish (3b, 3c, 3d, 3e) — quality
4. Localization sweep (3f) — last, since text moves

## Estimated scope

This is roughly 12–15 files edited/created, one Supabase read (no migrations expected unless the hotel photos need a cache table — I'll skip caching for v1). Will take multiple sequential edits.

## Questions before I start

1. **Photos for map markers**: easiest source is Google Places Photos API. You don't currently have a Google API key set. OK to use a generic fallback (category icon in a colored circle) instead of real photos, or do you want me to ask you for a Google Places API key?
2. **Multi-pass plan generation**: for a 14-day trip this means 2–3 OpenAI calls (~$0.20–0.40 per plan). Confirm OK with the cost.
3. **Paywall packages**: keep the existing 3 tiers (one-time / monthly / yearly) shown in the PDF download modal, or simplify?

Confirm and I'll execute.