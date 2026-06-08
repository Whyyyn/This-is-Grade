# This is Grade

Cloudflare Pages + Pages Functions version of the WebTESS grade dashboard.

## What It Does

- Runs the dashboard as a static Cloudflare Pages site.
- Uses `/api/scrape` as a Pages Function to log in to WebTESS temporarily.
- Returns course grades and assignment-level details to the browser.
- Does not store WebTESS passwords.
- Does not include any personal grades or debug files.
- Saves optional grade history only as browser-encrypted ciphertext.

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

## Encrypted History Setup

Create a Cloudflare D1 database and bind it to the Pages project as `DB`.

Run the migration in `migrations/0001_encrypted_grade_snapshots.sql`.

Add a Pages secret named `SESSION_SECRET` with a long random value. This is only used to sign the login session cookie after a successful WebTESS scrape.

## Local Dev

Install Node.js, then:

```bash
npm install
npm run dev
```

Open the local URL printed by Wrangler.

The app uses Tailwind CSS as a build step. Edit `src/styles.css`; `npm run dev`
builds `public/styles.css` before starting Wrangler. During style-heavy work, run
`npm run dev:css` in a second terminal to watch CSS changes.

## Privacy

The app asks for WebTESS credentials in the browser, sends them to the Pages Function, and uses them only for that request. WebTESS passwords are not written to the database, URL, localStorage, or logs.

History snapshots are encrypted in the browser with AES-GCM. The AES key is derived with PBKDF2 from the WebTESS email and password plus a random salt. D1 stores only `user_id`, `created_at`, `salt`, `iv`, `ciphertext`, and `schema_version`.
