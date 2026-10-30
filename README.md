# Front Belt

Official website for **Front Belt**, a clinic directory for Nairobi that shows which clinics are open today, how busy they are, and how much of their information has been checked.

Jua kabla ya kwenda.

## What is in this repo

| File | Purpose |
| --- | --- |
| `index.html` | Every view: home, clinic finder, trust framework, clinic sign-up, FAQ, contact, sign-in, patient dashboard, provider console, team console, team access. |
| `assets/styles.css` | The design system — colours, type, layout, light and dark themes. |
| `assets/data.js` | The sample clinics used when no database is connected. |
| `assets/store.js` | The data layer. One API, two backends: local demo (`localStorage`) and Firebase (Firestore + Auth). Picks Firebase automatically as soon as `assets/firebase-config.js` holds a real config. |
| `assets/firebase-config.js` | Empty placeholder. Paste your Firebase web config here to go live. |
| `assets/app.js` | Routing, GPS search, sign-in, provider console, team console. |
| `firestore.rules` | **The real access control.** Deploy these to Firebase. |

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
| **Patient** (`#/find`) | Clinic finder | Search by distance, filter, save clinics, see today's status |
| **Clinic** (`#/provider`) | Provider console | Put their clinic on the map with real coordinates, post the daily status, apply for a higher trust level, hide their listing |
| **Front Belt team** (`#/admin`) | Team console | Enlist clinics, edit coordinates, set trust levels, publish or remove listings, approve upgrade requests, spot clinics that stopped updating |

Sign-in returns each account to its own console, so nobody has to remember a URL.

## Team access — keeping the console private

The team console has its own entrance at **`#/team`**. It is not linked from the navigation, the footer or anywhere else on the public site, and the page is marked `noindex,nofollow` so search engines keep out.

What happens on each path:

- **Not signed in** → `#/admin` sends you to `#/team`, never to the console.
- **Signed in as a patient or clinic** → `#/team` says *"Not a team account"*, offers to sign out, and shows nothing from the console. Any console content already in the page is wiped before the redirect.
- **Team account** → straight to the console, and the header button reads **Team**.

**Demo mode** (no Firebase config yet) asks for a **team code** instead of an account, because there is no server to check a password. The default is:

```
frontbelt-team
```

Change it in `assets/app.js`:

```js
var TEAM_CODE = 'frontbelt-team';
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
6. **Deploy `firestore.rules`** — Firestore → Rules → paste the contents of `firestore.rules` → **Publish**. Without this step, the rules that ship with a new project block everything and the site will look empty.

After that, the rules are what protect you:

- only `role == 'admin'` can create, publish, delete or change the trust level of a clinic,
- a clinic can edit its own details and post its daily status, but **cannot touch `trust` or `published`** — it can hide itself, never republish itself,
- nobody can set their own role, so nobody can promote themselves to team,
- signed-out visitors can only read clinics where `published == true`,
- verification requests are readable by their owner and the team, and only the team can approve them.

Because the team role is granted in the Firebase console, it can never be obtained from the website.

> Firebase's free Spark plan is enough to start. Note that Cloud Storage is not used here; clinics are documents, not files.

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

Early access. Clinics marked *Sample* are demonstrations, not real clinics. The contact form opens the visitor's email app with the details filled in, addressed to `frontbelttechnologiesltd@gmail.com`.

Location search works today. Clinic status, trust levels and accounts are stored in your browser (demo mode) until a Firebase config is added, at which point they become shared and live.

## Contact

Front Belt Technologies, Nairobi, Kenya — frontbelttechnologiesltd@gmail.com
