# Front Belt

Official website for **Front Belt**, a clinic directory for Nairobi that shows which clinics are open today, how busy they are, and how much of their information has been checked.

Jua kabla ya kwenda.

## What is in this repo

| File | Purpose |
| --- | --- |
| `index.html` | The whole website — one self-contained page, no build step and no dependencies. |

Everything (styles, icons and scripts) lives inside `index.html`, so the site runs from any static host.

## Viewing it locally

Open `index.html` in a browser, or serve the folder:

```sh
python -m http.server 8000
```

Then visit <http://localhost:8000>.

## Hosting on GitHub Pages

1. Go to **Settings → Pages** in this repository.
2. Under **Build and deployment → Source**, choose **Deploy from a branch**.
3. Pick branch **main** and folder **/ (root)**, then **Save**.
4. The site goes live at `https://Mwanzia-Faith.github.io/Reload_FB/` in about a minute.

## How distance and location search works

Visitors do not need to know an area name. The **Use my location** button asks the browser for a GPS fix and the page then:

- calculates the true great-circle distance from the visitor to every clinic (Haversine formula, no API needed),
- sorts the list nearest first and flags the closest **open** clinic,
- keeps updating while the page is open as the visitor moves (`watchPosition`, ignored unless they move more than 30 m),
- can drop optional pins on an OpenStreetMap map (Leaflet, loaded only when the map is first opened).

The location never leaves the device: there is no geocoding call and nothing is sent to a server. If a visitor blocks location, the search falls back to name and area filters.

Distances are only as accurate as the clinic coordinates. The sample clinics sit at the centre of each Nairobi area, so distances to them are illustrative — real listings need real `lat`/`lng`.

## Going real-time: what you need to integrate

Right now the page ships with sample data and shows a **Sample data** chip. The plumbing for live data is already built: set one constant at the top of the script and the page will poll it every 60 seconds, show a **Live · checked 8:05** chip, and fall back to **Offline · showing last known** if a request fails.

```js
var LIVE_API = "https://your-endpoint.example/clinics";
```

The endpoint must return a JSON array (no key, publicly readable, CORS enabled):

```json
[
  {
    "name": "Kilimani Family Clinic",
    "area": "Kilimani",
    "level": "Verified",
    "status": "open",
    "text": "Open today · updated 8:05 am",
    "wait": "about 20 min",
    "busy": 55,
    "lat": -1.293, "lng": 36.787,
    "updated": "8:05"
  }
]
```

`status` is `open`, `closed` or `stale`. `busy` is 0–100 and drives the busyness bar. `level` is `Listed`, `Verified` or `Trusted`.

You need one thing a static site cannot provide: **somewhere to store what clinics report each morning.** Three sensible routes, cheapest first:

| Option | Good for | What you get |
| --- | --- | --- |
| **Google Sheets + Apps Script web app** | Phase 1, up to ~50 clinics | Free. Each clinic edits a row from their phone; a published script returns it as JSON for `LIVE_API`. No accounts, no database to run. |
| **Supabase** | Once you need clinic logins | Free tier: Postgres database, built-in auth so each clinic only edits its own row, and realtime subscriptions that push changes instantly instead of polling. JS client works from a plain HTML page. |
| **Firebase (Firestore)** | Same stage as Supabase | Free tier: realtime listeners and auth. Good if you prefer Google's ecosystem. |

A realtime pub/sub service on its own (Pusher, Ably) is not enough — those transport updates, but you still need somewhere to store and authorise them.

Whichever you pick, the trust rule matters: writes must be authenticated so a clinic can only update its own record, and the public read endpoint should never expose documents or phone numbers.

## Status

Early access. The clinic listings shown on the page are sample data for demonstration and are **not** real clinics. The early-access form opens the visitor's email app with the details filled in, addressed to `frontbelttechnologiesltd@gmail.com`.

Location search is live and works today. Clinic status is not yet live — it shows sample values until `LIVE_API` is pointed at a real source.

## Contact

Front Belt Technologies, Nairobi, Kenya — frontbelttechnologiesltd@gmail.com
