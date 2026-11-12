# Front Belt — the money

**One line:** the consumer never pays; the business pays for demand and proof of demand; Front Belt's cost per listing is close to zero, so the risk is not technology — it is supply maintenance and proving that a listing produces customers.

Everything below is a planning model in Kenya shillings, not a promise. The numbers are the ones to argue about.

---

## 1. Who pays, and for what

| Who | Pays? | For what |
| --- | --- | --- |
| People searching | **Never** | Search, distance, directions, calling, WhatsApp. No paywall, no account needed. |
| Partners (businesses) | **Yes, from Phase 2** | Being found by people who are ready to come — and the evidence that it happened. |
| Front Belt | Pays | Verification work, hosting, messaging, the team. |

**What a partner is buying.** Not "a listing" — a listing has no inherent value and that is exactly what killed Mocality in 2013. They buy three things:

1. **Demand** — placement in front of someone nearby who is choosing right now.
2. **Proof** — how many people viewed, called, tapped directions, messaged on WhatsApp this month.
3. **Confidence** — a listing that is current, with a badge that means something, so the searcher trusts it enough to travel.

**What is never for sale:** trust levels, review outcomes, or ranking in Health. A paid badge destroys the only asset that makes the directory worth using.

---

## 2. Money coming in — the revenue lines, in the order to switch them on

### Phase 1 — now → ~300 partners (revenue: KES 0)

Free for every partner. The goal is liquidity and clean data, not income. Charging before there is demand produces churn and no data.

Optional early income that does not distort the directory:

| Line | Price | Notes |
| --- | --- | --- |
| **Done-for-you setup** | KES 1,000 once | You photograph the shop, pin the door, enter hours and services. A *service* fee, not a badge fee. |
| **Sponsored category slot** | KES 500 / week | One clearly-labelled "Sponsored" card at the top of a category in one area. Capped at one per category. |

### Phase 2 — partner subscriptions: one free month, then Basic or Premier

Every approved listing gets **one month free**, counted from the approval date. Before it ends we remind the partner; after it, a listing with no plan is **hidden from search** (data kept, never deleted). If they are not subscribing at all, *Not interested* in the console tells the team to close the account properly.

| Plan | 6 months | 1 year | What it includes |
| --- | --- | --- | --- |
| **Basic** | KES 3,000 (≈US$35) | KES 6,000 (≈US$70) | Exact pin, phone, WhatsApp, directions, hours, up to 3 photos, daily status for clinics, earned trust badge, monthly views / calls / direction-tap summary. Reviewed within 2 working days. |
| **Premier** | KES 3,500 (≈US$41) | KES 7,000 (≈US$82) | Everything in Basic plus 15 photos, full menu or price list, "offer of the month" card, up to 3 branches, 1-working-day review, full insights with a quarterly call, priority WhatsApp support. |

The 12-month price is two six-month periods on one invoice — no discount, so do not advertise one. Charge in KES (M-PESA prompt or paybill) and invoice in USD for partners paying from outside Kenya.

Why these prices: they sit under a week of boosted Instagram posts, and a single extra customer a month covers them for a salon or pharmacy. Priced in KES, charged by M-PESA, cancellable when the term ends.

**What a paid plan never buys:** a trust badge, a better position in Health results, or a review outcome. Premier sells content and service (photos, menu, offer card, branches, faster review, insights), not rank.

### Phase 3 — transaction income (only where Front Belt owns the transaction)

| Line | Take rate | Where it works |
| --- | --- | --- |
| **Booking commission** | 8–12% | Beauty, home services, stays — once in-app booking exists, so the booking is measurable. |
| **Lead packs** | KES 20–40 per confirmed direction/call | Clinics and pharmacies that want volume beyond their own area. Never affects ranking. |
| **Delivery / fulfilment referral** | 5–10% | Pharmacy or food delivery partners, once a partner integration exists. |

### Always-on, non-obvious income

| Channel | How it pays | Honest caveat |
| --- | --- | --- |
| **Data and insight reports** | Anonymised "what Nairobi searches for, by area and category", sold quarterly to suppliers, banks, insurers, NGOs, county government. KES 50,000–300,000 per report. | Needs 6+ months of real volume before anyone believes it. Never sell personal data. |
| **White-label / licence** | "Front Belt for Kariobangi", "Front Belt for this mall / association / county". Setup KES 50,000–150,000 + KES 10,000–30,000/month. | One codebase, separate data. Strong fit for an association that already has members but no directory. |
| **Grants and digital-inclusion partnerships** | Non-dilutive grants for MSME digitisation and local data (county, KEPSA-type bodies, development funders). KES 500,000–3,000,000. | Slow, reporting-heavy, and should fund *maintenance work*, not the product roadmap. |
| **Open-data services** | Contributing verified POI corrections back to OpenStreetMap and being paid for ground-truth surveys. KES 200–800 per verified point. | Real, but small money; treat as a by-product, not a plan. |

---

## 3. Money going out — the cost structure

Fixed monthly, lean team, no office:

| Cost | KES / month | Note |
| --- | --- | --- |
| Domain + TLS | 150 | frontbelt.co.ke, renewed yearly |
| Hosting (static site) | 0 | GitHub Pages / Cloudflare Pages free tier |
| Database (Firebase) | 0–1,000 | Spark free tier now; Blaze rises with reads |
| Maps and geocoding | **0** | OpenStreetMap tiles, Nominatim, Overpass — no Google Maps bill |
| Fonts, assets | 0 | Self-contained, no paid CDN |
| SMS / WhatsApp re-verification | 500–1,500 | ~330 messages/month at 1,000 partners, quarterly cycle |
| Airtime and data | 3,000 | The ops phone |
| Reviewer / community manager (part-time) | 35,000 | The person who phones partners and works the queue |
| Accounting, permits, compliance | 6,000 | |
| Marketing test budget | 15,000 | Flyers in 2 areas, WhatsApp groups, not ads |
| Contingency (10%) | 6,000 | |
| **Total** | **≈ 66,000 – 68,000** | ≈ USD 510–530 |

Not counted: founder time, laptops, and the cost of *your* hours — which is the real subsidy in Phase 1.

**Marginal cost of one more listing: effectively zero** (a document in Firestore, no per-record fee). That is the structural advantage of this design and why the model can survive at small scale.

---

## 4. Break-even, plainly

Against ≈ KES 67,000/month:

| Mix | Paying partners needed |
| --- | --- |
| All Growth (KES 1,500) | **45** |
| 70% Growth / 30% Pro (avg ≈ KES 2,400) | **28** |
| Subscriptions + one sponsored slot per area-category (≈ KES 10,000) | **38** |
| Subscriptions + one data report per quarter (≈ KES 75,000 once) | **33** |

If 15% of partners convert to paid, break-even needs **≈ 190–300 verified partners**. At 25% conversion, **≈ 115–180**.

**Conclusion:** the business is viable at a few hundred maintained partners in 2–3 categories — not at 10,000 scattered listings. Breadth is the expensive mistake here; depth in two areas is the cheap win.

---

## 5. Is it feasible? The honest answer

**What is already true and cheap**

- The product exists and runs on free infrastructure. Six→seven categories, distance search, directions, WhatsApp, review workflow, open-data import.
- No Google Maps bill, no per-listing cost, no app-store toll to start.
- The workflow the team needs — submit, review, approve, deny with reasons — is built, not planned.

**What is genuinely hard (in order)**

1. **Supply maintenance.** 1,000 partners is not a marketing problem, it is an operations problem: ~11 verifications a day. It needs the 90-day re-verification cycle, self-service edits, and one person who owns the queue.
2. **Demand proof.** Nobody pays for a listing they cannot see working. The monthly insight report (views, calls, direction taps) is the actual sales tool.
3. **Concentration.** Being the best answer in Kilimani + Kawangware for two categories beats being a thin answer everywhere.

**The 90-day test that decides it (budget ≈ KES 200,000)**

- 2 areas: Kilimani and Kawangware.
- 2 categories: beauty, and health (pharmacies).
- 60 verified partners, 40 of them self-service.
- Target: 500 direction taps and 200 calls from real searchers.
- Then: sell 10 Growth placements at KES 1,500. **If ten businesses will not pay after seeing 500 taps, the model is wrong — and you will know for KES 200,000 instead of KES 2,000,000.**

---

## 6. What the numbers must be watched with

| Metric | Why it decides the business |
| --- | --- |
| % of listings confirmed in the last 30 days | The product *is* freshness. Below 70% the directory is a rumour. |
| Direction taps + calls per 100 listing views | The only number a partner will pay for. |
| Partner → paid conversion | Subscription viability. |
| Monthly churn of paying partners | Under 5% is a business; over 10% is a treadmill. |
| Cost per verified partner | Must fall as self-service and OSM import grow. |
| Dead-number rate | One bad phone number costs a searcher forever. |

---

## 7. What we will not do

- Charge people to search.
- Sell a trust badge, or let a partner approve itself.
- Let paid placement change Health ranking or hide a denial.
- Invent reviews, ratings or "verified" numbers we did not check.
- Spend on Google Maps or ads before a single partner has paid.
