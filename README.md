# Front Belt

Official website for **Front Belt**, a place finder for Nairobi. Seven categories — **Health** (clinics and pharmacies), **Food**, **Beauty**, **Tech & Money** (phones, M-Pesa, banks, microfinance), **Books**, **Home & Living** and **Accommodation** — each with its own icon and layout. Everything is found by where it is and how far it is; only Health shows today's status and wait time.

**Connect, Compare & Access.**

A business that lists here is a **partner**. Front Belt is the service; partners are the businesses. Nothing appears on the public site until the Front Belt team has reviewed and approved it — see *How a listing gets approved* below. The money model lives in [BUSINESS.md](BUSINESS.md).

Jua kabla ya kwenda.

## What is in this repo

| File | Purpose |
| --- | --- |
| `index.html` | Every view: the home page, the explorer (all categories or one, themed), trust framework, the partners page, FAQ, contact, sign-in, the personal dashboard, the partner console, the team console and team access. |
| `assets/styles.css` | The design system — colours, type, layout, light and dark themes, plus the per-category card layouts. |
| `assets/data.js` | The category catalogue (ids, icons, colours, types) and the sample listings used when no database is connected. |
| `assets/store.js` | The data layer. One API, two backends: local demo (`localStorage`) and Firebase (Firestore + Auth). Picks Firebase automatically as soon as `assets/firebase-config.js` holds a real config. |
| `assets/firebase-config.js` | The Firebase web config (public identifiers only — never a secret). |
| `assets/app.js` | Routing, GPS search, sign-in, the partner console with the review tracker, the team console with the review queue, and the OpenStreetMap import. |
| `assets/logo.svg` | The brand mark — a map pin holding a seven-colour compass, one wedge per category, with the belt ribbon behind it. Used in the header and as the favicon. |
| `manifest.webmanifest` | Lets visitors install the site to their phone’s home screen. |
| `assets/icon-192.png`, `assets/icon-512.png`, `assets/apple-touch-icon.png`, `assets/og.png` | PNG icons rendered from the logo: home-screen icons, the iOS touch icon, and the picture shown when the link is shared. |
| `firestore.rules` | **The real access control.** Deploy these to Firebase — they are what stop a partner approving its own listing. |
| `BUSINESS.md` | The money: who pays, what they pay for, the cost base, break-even and the 90-day test. |

No build step and no dependencies: the site runs from any static host.

## Viewing it locally

Serve the folder (opening `index.html` from disk works too, but a server behaves like the live site):

```sh
python -m http.server 8000
```

Then visit <http://localhost:8000>.

## Hosting on GitHub Pages

1. **Settings → Pages**
2. **Build and deployment → Source**: *Deploy from a branch*
3. Branch **main**, folder **/ (root)**, **Save**

Live at <https://Mwanzia-Faith.github.io/Reload_FB/> in about a minute.

## Three kinds of visitor

The first thing the site asks is who you are, and everything after that follows your answer.

| Who | Where they land | What they can do |
| --- | --- | --- |
| **Someone looking** (`#/find`) | Explorer | Browse every category or one, search by distance, filter, save listings, see today's status for Health |
| **Partner** — the business (`#/partner`) | Partner console | Submit a listing for review, watch it move *received → in review → approved*, fix and resubmit if turned down, then edit details, post the daily status (Health), apply for a higher trust level, hide the listing |
| **Front Belt team** (`#/admin`) | Team console | Work the review queue (approve, or not approved with reasons the partner sees), enlist listings in any category, edit coordinates, set trust levels, publish or remove listings, import drafts from OpenStreetMap |

Sign-in returns each account to its own console, so nobody has to remember a URL.

## How a listing gets approved

```
partner submits  →  received  →  in review  →  approved (live)  |  not approved (+ reasons)
```

1. A partner submits from **`#/partner`**. The record is created `published: false, reviewState: 'pending'` — it is invisible to the public immediately, and `firestore.rules` will not let it be created any other way.
2. The partner's console shows the tracker and the promise: *we aim to answer within 2 working days*.
3. The team opens **`#/admin`**. The review queue is the first thing on the page. **Start review** marks it `in_review`.
4. **Approve** sets `published: true` and it appears in search at once. **Not approved** opens a checklist of requirements (pin on the door, phone reachable, name matches the signboard, duplicate, missing licence…) plus a free-text note. The partner sees exactly those words, fixes the listing and resubmits into the same queue.

A partner can never approve itself, raise its own badge or publish itself — those fields are not in its allowed edit list in `firestore.rules`. After changing rules, **republish them** in Firebase (Firestore → Rules → Publish).

## Where the map data comes from (not Google)

- **Tiles:** OpenStreetMap, drawn with Leaflet. No Google Maps key, no bill.
- **"Use my location":** the browser's own Geolocation API, on the device.
- **Address lookup:** Nominatim, the open geocoder, used only when the team asks for it.
- **New places:** the team console's *Open map data* panel queries the Overpass API for businesses near an area that are not yet listed, and adds them as **drafts in the review queue** — never published automatically. Attribution stays visible: *© OpenStreetMap contributors, ODbL*.
- **Directions:** the Start button hands over to whatever map app the phone already has. It is a link, not a dependency; the detail sheet also links to the place on openstreetmap.org.

## Team access — keeping the console private

The team console has its own entrance at **`#/team`**. It is not linked from the navigation, the footer or anywhere else on the public site, and the page is marked `noindex,nofollow` so search engines keep out.

What happens on each path:

- **Not signed in** → `#/admin` sends you to `#/team`, never to the console.
- **Signed in as a patient or clinic** → `#/team` says *"Not a team account"*, offers to sign out, and shows nothing from the console. Any console content already in the page is wiped before the redirect.
- **Team account** → straight to the console, and the header button reads **Team**.

**Demo mode** (no Firebase config yet) asks for a **team code** instead of an account, because there is no server to check a password. The default is:

```
ILOVEFB
```

Change it in `assets/app.js`:

```js
var TEAM_CODE = 'ILOVEFB';
```

Be clear about what that is: the page hides the console and the code stops a visitor clicking around your demo from wandering in, but both live in the page source. **A static page cannot keep a secret.** Real access control is the next section.

## Making it genuinely private: connect Firebase

1. Create a project at <https://console.firebase.google.com>.
2. **Build → Firestore Database → Create database** (production mode).
3. **Build → Authentication → Sign-in method → Email/Password → Enable**.
4. **Project settings → Your apps → Web app** and copy the config into `assets/firebase-config.js`:

```js
window.FIREBASE_CONFIG = {
  apiKey: '…',
  authDomain: '…firebaseapp.com',
  projectId: '…',
  storageBucket: '…appspot.com',
  messagingSenderId: '…',
  appId: '…'
};
```

5. **Create your own team account**: sign in once on the site (it will be created as a patient), then open **Firestore → users → your uid** and change `role` to `admin`.
6. **Deploy `firestore.rules`** — Firestore → Rules → paste the contents of `firestore.rules` → **Publish**. Without this step, the rules that ship with a new project block everything and the site will look empty. Republish whenever `firestore.rules` changes: the current file allows the `category` and `type` fields, and an older copy would reject them.

After that, the rules are what protect you:

- only `role == 'admin'` can create, publish, delete or change the trust level of a clinic,
- a clinic can edit its own details and post its daily status, but **cannot touch `trust` or `published`** — it can hide itself, never republish itself,
- nobody can set their own role, so nobody can promote themselves to team,
- signed-out visitors can only read clinics where `published == true`,
- verification requests are readable by their owner and the team, and only the team can approve them.

Because the team role is granted in the Firebase console, it can never be obtained from the website.

> Firebase's free Spark plan is enough to start. Note that Cloud Storage is not used here; clinics are documents, not files.

## Categories and directions

The home page shows the six categories with live counts. Each opens its own themed view (`#/c/food`, `#/c/beauty`, …) — a different accent colour, icon and card layout per category, driven by CSS classes rather than separate pages:

| Category | What it holds | Layout |
| --- | --- | --- |
| **Health** | Clinics, pharmacies, dental, labs | The original card: status pill, wait time, busyness bar, trust badge |
| **Food** | Bakeries, pizza, chicken, restaurants | Cards with a warm accent bar across the top |
| **Beauty** | Salons, kinyozi, spa, nails | Soft rounded cards with a circular icon |
| **Tech & Money** | Phone shops, electricals, Airtel and M-Pesa agents | Dense single-column list rows |
| **Books** | Bookshops, libraries, stationery | Cards with a coloured shelf edge |
| **Home & Living** | Furniture, showrooms, home items | Larger showroom-style tiles |

Every listing except Health shows type, tags, hours and distance — no wait time, by design.

**Directions.** Each card carries a **Directions** button, and tapping a card opens a detail sheet with a small map, Drive/Walk/Transit modes and a **Start** button. All of them open Google Maps with the destination pinned and the visitor's position as the origin (once they have shared a location), so the actual turn-by-turn navigation happens in Maps — the site finds the place, Maps leads you there.

## How distance and location search works

Visitors do not need to know an area name. **Use my location** asks the browser for a GPS fix, then the page:

- calculates the true great-circle distance to every clinic (Haversine formula, no API needed),
- sorts nearest first and flags the closest **open** clinic,
- keeps re-sorting while the visitor moves (`watchPosition`, ignoring movement under 30 m),
- can drop optional pins on an OpenStreetMap map (Leaflet, loaded only when the map is first opened).

The location never leaves the device: no geocoding call, nothing sent to a server. If location is blocked, search falls back to name and area filters.

Distances are only as good as the clinic coordinates. The sample clinics sit at the centre of each Nairobi area, so distances to them are illustrative — real listings carry real `lat`/`lng`, captured either by the team in **Add clinic** or by the clinic itself in its console.

## Will the email actually arrive?

Two different things are going on, and only one of them is the site's job.

**The address itself.** `frontbelttechnologiesltd@gmail.com` is an ordinary Gmail mailbox, and `gmail.com` publishes working mail servers (MX records checked), so mail addressed to it is delivered if the account exists. Nothing the website can do changes that — if the mailbox exists, it receives; if it does not, the sender gets a bounce. Sending yourself one message is the only real test.

**How the site hands the message over.** Right now the contact form builds a `mailto:` link, which hands the message to the *visitor's* email app. That works on a desktop with Outlook or on a phone with Gmail set up — but on a locked-down browser, or a phone with no mail account configured, it silently does nothing. Nothing is lost, but the message never leaves.

So you have two options:

### Option A — keep it as it is

Free, no accounts, no dependency. The button says **Open in my email app**, and if nothing opens the page now tells the visitor to email the address directly.

### Option B — the form sends it for you (recommended)

The message is posted straight to a form service that emails it to you. The visitor needs no email app at all, and you get a copy in your inbox plus a record on the service.

1. Go to <https://web3forms.com> and enter `frontbelttechnologiesltd@gmail.com`. It emails you a free **access key**.
2. Paste it into `assets/app.js`:

```js
var CONTACT_KEY = 'your-access-key-here';
```

3. Commit and push. The button becomes **Send message**, and submissions are delivered directly.

That signup email is itself the proof you were asking for: if that key arrives in the inbox, the mailbox receives mail from the outside world.

Notes on this choice: Web3Forms' free tier is 250 submissions a month, it removes the need for a server, and the access key is public by design — it can only submit to the address it was issued for, so it cannot be abused to send from your identity. If you later want submissions stored in your own database instead of only emailed, the same handler is one place to change.

## Status

Early access. Listings marked *Sample* are demonstrations, not real places — an empty category offers a **Preview sample listings** button so the layouts can be seen without adding real data first. The contact form opens the visitor's email app with the details filled in, addressed to `frontbelttechnologiesltd@gmail.com`.

Location search works today. Clinic status, trust levels and accounts are stored in your browser (demo mode) until a Firebase config is added, at which point they become shared and live.

## Contact

Front Belt Technologies, Nairobi, Kenya — frontbelttechnologiesltd@gmail.com
