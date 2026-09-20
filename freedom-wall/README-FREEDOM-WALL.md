# Freedom Wall

Students send anonymous messages through a public form. Text messages have no
review: they go into a queue, and a small job posts the oldest one to your
Facebook Page about every 5 minutes. A message can say "Replying to #FW0042"
to point at an earlier post, and can carry one picture. Messages with a
picture wait for an admin to approve the picture first. Admins (Google login)
can review pictures, see everything, retry failed posts, and take a live post
down.

```
Student form -> /api/submit -> Supabase (queued)
                                   |
      scheduler, every minute -> /api/post-next -> Facebook Page
                                   |
                     /admin (Google login): view, retry, remove
```

## What's in this folder

| Path | What it is |
|---|---|
| `app/page.tsx` | The public form |
| `app/admin/page.tsx` | Admin dashboard |
| `app/api/submit/route.ts` | Checks Turnstile, saves the message |
| `app/api/post-next/route.ts` | The posting job (one message per call) |
| `app/api/admin/remove/route.ts` | Deletes a live post from the Page |
| `lib/` | Settings (`config.ts`), Facebook and Supabase helpers, picture shrinking |
| `supabase/patch-01-zero-review.sql` | Database update (run after `schema.sql`) |
| `supabase/patch-02-images-and-replies.sql` | Adds replies and pictures (run after patch 01) |
| `.env.example` | The list of secret settings you need to fill in |

## Set it up

### 1. Make the Next.js project

You need Node.js (the LTS version) installed. Then:

```
npx create-next-app@latest freedom-wall
```

Answer the questions: TypeScript **Yes**, ESLint **Yes**, Tailwind **No**,
`src/` directory **No**, App Router **Yes**. For anything else (React
Compiler, import alias) take the default or say No.

```
cd freedom-wall
npm install @supabase/supabase-js sharp
```

### 2. Copy these files in

Copy the `app/` and `lib/` folders from this download into the project
(merge them). Say yes to replacing `app/page.tsx`. Do NOT replace
`app/layout.tsx`, but open it and change the page title and description
(look for `metadata`) to your wall's name. Copy `.env.example` and
`supabase/` into the project root too.

### 3. Update the database

In the Supabase SQL Editor, run these in order, each one once:
1. `schema.sql` (you already did this)
2. `supabase/patch-01-zero-review.sql`
3. `supabase/patch-02-images-and-replies.sql`

If patch 02 errors on the `storage.buckets` line, create the bucket by hand
(Storage > New bucket, name `wall-images`, keep it **private**), then run the
rest of the file again.

### 4. Fill in your secrets

Copy `.env.example` to a new file named `.env.local` and fill in every value.
Make up `CRON_SECRET` yourself: a long random string. Leave the Facebook lines
blank and keep `DRY_RUN=true` for now.

Never commit `.env.local` (the project's `.gitignore` already skips it) and
never paste these values in chat.

### 5. Tell Supabase where your site lives

Supabase > Authentication > URL Configuration:
- **Site URL:** `http://localhost:3000` while testing on your computer. Once
  you're on Vercel, change it to your Vercel address.
- **Redirect URLs:** add BOTH `http://localhost:3000/admin` and
  `https://your-project.vercel.app/admin` (your real address, with https://).
  If the address you log in from isn't in this list, Supabase sends you to the
  Site URL instead. If that's still localhost, you'll get "This site can't be
  reached" after signing in. Make sure the Google provider is on (Authentication > Providers).
Your admin's Google email must be in the `admins` table.

### 6. Run it on your computer

```
npm run dev
```

- Open http://localhost:3000, write a message, pass the Turnstile check, send.
  In Supabase > Table Editor > `submissions` you should see a row with status
  `queued` and no IP, email, or other identifying columns.
- Run the posting job by hand. On Mac/Linux:
  `curl -X POST http://localhost:3000/api/post-next -H "Authorization: Bearer YOUR_CRON_SECRET"`
  On Windows PowerShell use `curl.exe` instead of `curl`.
  With `DRY_RUN=true` the row becomes `posted` with a fake `dry-run-...` ID.
- Run it again straight away: it should say it's waiting out the gap. To
  test faster, run `update public.settings set min_seconds_between_posts = 10;`
  in the SQL Editor, and set it back to `300` afterwards.
- Open http://localhost:3000/admin and sign in with Google.

### 7. Put it online (Vercel, free)

1. Push the project to a **private** GitHub repository.
2. On vercel.com: Add New > Project, import the repo, and paste every
   variable from `.env.local` into Environment Variables. Deploy.
3. Add your Vercel address (like `yourwall.vercel.app`) to your Turnstile
   widget's hostnames, and add `https://yourwall.vercel.app/admin` to the
   Supabase Redirect URLs.
4. If you change a `NEXT_PUBLIC_` variable later, redeploy so it takes effect.

### 8. Start the posting job (free scheduler)

Your site only does something when someone visits it, so nothing would ever
post the next message on its own. A "cron job" is just a timer service that
visits an address on a schedule. Here, it visits `/api/post-next` every
minute, and each visit posts the next message if it's allowed. Without it,
messages sit in Queued forever. The secret in the header makes sure only your
timer can trigger it.

Vercel's free plan can't run a job this often, so use an outside scheduler:

- Go to cron-job.org (free) and create a job:
  - URL: `https://yourwall.vercel.app/api/post-next`
  - Schedule: **every 1 minute**
  - Request method: POST
  - Header: `Authorization` = `Bearer YOUR_CRON_SECRET`

Why every minute and not every 5? The database only allows a post once 5
minutes have passed since the last one. If the scheduler ran exactly every 5
minutes, a tiny delay would make it arrive a few seconds early, get refused,
and wait a whole extra 5 minutes. Running every minute avoids that; posts
still go out about every 5 minutes. (Check cron-job.org's current free limits.
Supabase's `pg_cron` + `pg_net` extensions can also do this job.)

### 9. Go live on Facebook (when the Page is ready)

1. Do the Meta developer app and Page token steps (a test Page first).
2. In Vercel, set `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN`, and
   change `DRY_RUN` to `false` (or delete it). Redeploy.
3. Clear out test rows from the dry run: in the SQL Editor, run
   `delete from public.submissions where fb_post_id like 'dry-run-%';`
4. Send a test message and watch it appear on the test Page.

If posts start failing with "token expired or invalid", generate a new Page
access token and update the variable. The dashboard's Failed tab shows the
error, and Retry puts the message back in line.

## Good to know

- **Queue speed:** one post per 5 minutes is 288 a day. If messages come in
  faster than that, the queue grows. Lower the gap with
  `update public.settings set min_seconds_between_posts = 120;` if needed.
- **Failed posts:** if a message is marked failed with "result unknown," check
  the Page first. It may already be up, and retrying would post it twice.
- **Privacy:** the app saves only the message, category, and optional name.
  Your hosting provider and Cloudflare keep their own standard logs, which can
  include IP addresses, so don't promise more than "we don't save it with your
  message."
- **Replies:** the form has a "Replying to a post?" box. It accepts `42`,
  `fw42`, or `#FW0042`, and the post must already be live on the wall. The
  Facebook post then starts with "Replying to #FW0042". It's plain text, and
  Facebook should treat the number as a hashtag.
- **Pictures:** one picture per message. The browser shrinks it, the server
  checks it's really an image, shrinks it again, and saves it as a JPEG, which
  removes location and camera details. Pictures live in a private bucket,
  only admins can view them (through links that expire), and they're uploaded
  to Facebook when the post goes out. The free Supabase plan has about 1 GB of
  storage. At a few hundred KB each, that's thousands of pictures. Rejecting a
  picture deletes its file.
- **Picture review:** picture posts appear in the admin's "Pictures to review"
  tab. Approve puts it in the line. Reject stops the whole post, text included.
  Text-only messages never wait for review.
- **Flags:** links, phone numbers, repeated messages, and words in the
  `flagged_words` table get a label in the dashboard. They never stop or delay
  a post. Add words with
  `insert into public.flagged_words (word) values ('example');` (lowercase).
- **Not tested:** this code was written without being able to install or run
  it, and the picture upload to Facebook (the `/photos` endpoint) especially
  needs a trial run on a test Page before you rely on it. Expect to fix a small
  thing or two on first run. Copy any error message and ask for help.
