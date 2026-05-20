# Hamster Expeditions

Mobile-first browser idle / expedition management MVP built with plain HTML, CSS, and JavaScript.

## Deploy to GitHub Pages

This repository can be deployed as a static PWA through GitHub Pages.

Expected URL:

https://zhuravskayyar.github.io/humsterExp/

How it works:

- Push to the `main` branch.
- GitHub Actions runs `.github/workflows/deploy-pages.yml`.
- The repository is published to GitHub Pages without a build step.

If Pages is not enabled yet in the repository settings, open GitHub:

- `Settings` -> `Pages`
- `Source` -> `GitHub Actions`

## Player stats on Render

Deploy the `server` folder to Render. The server exposes:

- `/stats` - dashboard page with online players, total players, sessions, and recent activity.
- `/stats.json` - same data as JSON.
- `/player-ping` - endpoint used by the game client.

To connect the GitHub Pages client to the Render server, set this tag in `index.html`:

```html
<meta name="hamster-server-url" content="https://YOUR-RENDER-SERVICE.onrender.com">
```

Stats are stored in `server/player-stats.json` by default. Set `STATS_FILE` on Render if you want a custom path.

## Run locally

Use a local web server so JSON data can be fetched without `file://` CORS issues.

Recommended:

```bash
npx live-server
```

or open this folder with the VS Code Live Server extension.

## Sprite animation rule

Use one transparent sprite sheet per hamster state:

- `idle`: 4 frames in one horizontal row, usually `7fps`.
- `attack`: 4 or 6 frames in one horizontal row, timed around 400-500ms total.
- Normalized runtime sheets must use `384x256` per frame, bottom-center alignment, and transparent background.
- The sheet width must be exactly `frameWidth * frames`, so `totalW % frames === 0`.
- `js/sprite.js` must match the PNG exactly: `frames`, `totalW`, `h`, optional `cols/rows`, and `anchorX`.
- New or replaced sheets go into `scripts/normalize-sprites.py`; run `npm run normalize-sprites` and then `npm run validate-assets`.
- Do not animate by changing CSS size or shifting the canvas. Keep motion inside frames and keep the character pivot on the same bottom-center anchor.

## MVP features

- Base, Hamsters, Expeditions, Inventory, and Quests screens.
- Five starting hamsters and three starter expedition zones.
- Gacha system with 4-5 star hamsters, 1-5 star items, pity, and duplicate constellations.
- Six constellations per hamster with passive bonuses to stats, loot, speed, injury resistance, and passive income.
- Openable hamster detail view with personal leveling to 90, HP/attack/defense growth, and five equipment slots.
- Unique equipment instances, signature weapons from gacha, equipment leveling, and equipment salvage into ore/gold.
- Expedition loot includes gold, XP books, and ore; combat stats affect expedition success, injury risk, and loot.
- Colony upgrades for passive income, expedition speed, multicast expedition slots, and gacha luck.
- Timed expeditions with offline completion through saved timestamps.
- Loot, XP, temporary injuries/resting, simple quest progress, and inventory.
- `localStorage` save, reset, export, and import.
- Mobile-first layout for 320-425px screens, centered on desktop.

## Save key

`hamsterExpeditionsSave_v1`
