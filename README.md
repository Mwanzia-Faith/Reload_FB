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

## Status

Early access. The clinic listings shown on the page are sample data for demonstration and are **not** real clinics. The early-access form opens the visitor's email app with the details filled in, addressed to `frontbelttechnologiesltd@gmail.com`.

## Contact

Front Belt Technologies, Nairobi, Kenya — frontbelttechnologiesltd@gmail.com
