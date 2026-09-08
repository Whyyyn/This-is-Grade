# This is Grade

Cloudflare Pages + Pages Functions version of the WebTESS grade dashboard.

## What It Does

- Runs the dashboard as a static Cloudflare Pages site.
- Uses `/api/scrape` as a Pages Function to log in to WebTESS temporarily.
- Returns course grades and assignment-level details to the browser.
- Does not store WebTESS passwords unless the user explicitly enables the five-person realtime notification beta.
- Does not include any personal grades or debug files.
- Saves optional grade history only as browser-encrypted ciphertext.
- Can run an invitation-only realtime beta that encrypts WebTESS credentials, checks for grade changes in the background, and delivers changes through Web Push after the page is closed.

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

## Background Push Setup

The Pages project owns `/api/push`, `/api/realtime`, and the invitation-only UI.
The push endpoint is transport for realtime grade changes only; there is no
separate daily reminder feature. A Worker in `workers/push-scheduler.js` wakes
every minute and assigns each of the five beta slots a different minute, so each
enrolled account is checked once every five minutes.

1. Generate one VAPID key pair:

```bash
npm run push:keys
```

2. Apply the D1 migrations locally or remotely:

```bash
npx wrangler d1 migrations apply this-is-grade-history --local
npx wrangler d1 migrations apply this-is-grade-history --remote
```

3. Add the generated public key to the Pages project as `VAPID_PUBLIC_KEY`.
4. Add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` to the
   `this-is-grade-push` Worker. `VAPID_SUBJECT` must be a contact URI such as
   `mailto:admin@example.com`.
5. Generate a long random `WEBTESS_CREDENTIALS_KEY` and add the identical value
   as a secret to both the Pages project and `this-is-grade-push` Worker.
6. Add a Pages secret named `BETA_INVITE_CODES` containing exactly five
   comma-separated invitation codes. Keep this value out of Git and client-side
   JavaScript.
7. Deploy both parts:

```bash
npm run deploy
npm run push:deploy
```

For local development, put the Pages public key in `.dev.vars`. Put all three
Worker values in the separate untracked `.dev.vars.push` file. The Pages file
also needs `BETA_INVITE_CODES` and `WEBTESS_CREDENTIALS_KEY`; the Worker file
needs the same `WEBTESS_CREDENTIALS_KEY`. Start the scheduler with
`npm run push:dev`. The scheduler test endpoint is disabled unless
`ALLOW_TEST_ENDPOINT=true` is explicitly configured.

## Realtime Notification Beta

The beta is disabled by default and capped at five invitation slots. Enabling it
requests browser notification permission automatically. After the user enters a
valid invitation code and confirms their WebTESS login, the server stores one
AES-GCM encrypted state containing the WebTESS email, password, reusable session
cookie, and latest grade snapshot. D1 never stores those fields as plaintext.

Each slot is checked every five minutes, every day from 06:00 until midnight in
the device's saved IANA time zone. The Worker reuses the WebTESS session cookie
and falls back to the encrypted password only after that session expires. A
detected course or assignment change is pushed immediately. Three consecutive
login or scrape failures pause the beta and notify the device. Disabling the
beta deletes both its browser push subscription and encrypted realtime state,
then releases its invitation slot.

## Privacy

By default, the app sends WebTESS credentials to the Pages Function and uses them
only for that request. When the user explicitly enables the invitation-only
realtime beta, the Pages Function encrypts those credentials before writing them
to D1. The encryption key is stored separately as a Cloudflare secret. Passwords,
session cookies, and decrypted grades must never be written to application logs.

History snapshots are encrypted in the browser with AES-GCM. The AES key is derived with PBKDF2 from the WebTESS email and password plus a random salt. D1 stores only `user_id`, `created_at`, `salt`, `iv`, `ciphertext`, and `schema_version`.
