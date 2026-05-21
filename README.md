# This is Grade

Cloudflare Pages + Pages Functions version of the WebTESS grade dashboard.

## What It Does

- Runs the dashboard as a static Cloudflare Pages site.
- Uses `/api/scrape` as a Pages Function to log in to WebTESS temporarily.
- Returns course grades and assignment-level details to the browser.
- Does not store WebTESS passwords.
- Does not include any personal grades or debug files.

## Deploy With Cloudflare Dashboard

1. Push this folder to GitHub.
2. In Cloudflare Dashboard, open **Workers & Pages**.
3. Create a **Pages** project and connect the GitHub repo.
4. Use these settings:

```text
Framework preset: None
Build command: (leave blank)
Build output directory: public
Root directory: /
```

5. Deploy.

Cloudflare will detect the `functions/` folder and publish `/api/scrape` as a Pages Function.

## Local Dev

Install Node.js, then:

```bash
npm install
npm run dev
```

Open the local URL printed by Wrangler.

## Privacy

The app asks for WebTESS credentials in the browser, sends them to the Pages Function, and uses them only for that request. The first version does not use Supabase and does not save history.
