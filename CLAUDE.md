# GasBack — CLAUDE.md

Living "where were we" doc. Read this first in a fresh session. Keep it current. When you fix something, add a dated changelog entry (what was wrong, why, what you verified, what you did NOT verify and why). Don't trust this file over the code: audit before claiming anything is done or not done.

## What GasBack is
Turns household LPG adoption into verified carbon credits.
- **Consumers:** scan LPG purchase receipts, earn points (1 point = ₦1 of refill discount), redeem as vouchers at partner stations.
- **Carbon markets:** aggregate micro-reductions from many households, verified by AI fraud checks + on-chain dMRV, to mint institutional-grade credits.
- **Layers:** User (mobile + WhatsApp/USSD) → Verification (AI OCR + vendor dashboard/merchant APIs) → Settlement/Ledger (on-chain dMRV anchoring fuel-displacement volumes).
- **Revenue:** carbon credit arbitrage; redemption/transaction fees at partner outlets; vendor SaaS (analytics + API).

## ⚠ YOUR TODO (things only the owner can do) — kept current; tick/remove when done
Nothing below is done by Claude. Grouped by when it blocks you.

**Blocks everything (do first):**
- [x] ~~Create or restore a Supabase project~~ — **done by the user; verified 2026-10-04**: `ptuyegvfpdzrptozfjnu.supabase.co` resolves again (auth health 200; it was most likely a paused project that got restored — inference). The old keys that were once committed in source still belong to this project: **rotate them** (Supabase → Project Settings → API) and update `.env.local` + Vercel. Not done yet.
- [x] ~~Apply `001_hardening.sql` and `002_storage.sql`~~ — **applied by the user; verified live 2026-10-04** (see changelog). Do NOT run `schema.sql` on this project.
- [~] **Seed: done 2026-10-04 (by Claude via REST).** `carbon_params` row 1 (5.017 kg/kg, $15/t as of 2026-05-26, 50%, **₦1,329.12/$ official CBN NFEM 2026-09-03**, min redeem 500), merchant `TEST Station (not real)` (Lagos), and **`reserve_funding` id 1 = ₦20,000,000 labelled "TEST FUNDING - not real money"** (user asked to fund with "20m" for testing). **BEFORE REAL USERS:** delete that reserve row, wipe all test receipts/vouchers/transactions, zero test wallets (ask Claude — it will do it and verify nothing is left), then insert the real reserve. At this FX a 12.5 kg refill earns ~**625 points (₦625)**, not the plan's ₦750–800 (the plan assumed ~₦1,600/$).
- [ ] In Supabase Auth settings: add the Vercel domain to redirect URLs; confirm email-confirmation setting and that Google/Apple providers are actually configured (not checked).

**Before any real user:**
- [ ] Replace/add real partner stations in `merchants` (only a labelled TEST station exists; set `active=false` on it once real ones are in) (template at the bottom of `seed_pilot.sql`). Redeem page says "No partner stations are live yet" until then.
- [ ] Give me ~10–20 **real receipt photos** from Nigerian LPG stations. The parser and every threshold were built from assumptions and synthetic text and are untuned (see Known issues).
- [ ] Provide **PWA icons** (192×192 and 512×512 PNG at `public/icons/`). `public/manifest.json` references `/icons/icon-192.png`, which 404s — the app can't install to a home screen properly without them.
- [ ] Legal/counsel: (a) registered company name (pages say "GasBack Technologies Ltd" — unverified; I removed the placeholder "RC 1234567"); (b) whether ₦-pegged points count as stored value/e-money in Nigeria; (c) promises in Privacy/Terms that nothing implements yet: 12-month receipt-image deletion, 7-year retention, 24-month point expiry, DPO appointment + quarterly policy review, human fraud review + permanent bans incl. device fingerprints, vouchers "valid 30 days / single-use / invalidated on use" (no expiry job and no merchant redemption tool exist); (d) your actual Supabase region (I removed the unverified "EU-West" claim).
- [ ] Confirm these mailboxes exist (shown on public pages): partners@ / credits@ / privacy@ / dpo@ / legal@gasback.ng.
- [ ] Vercel: create the project, set env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CREDENTIALS_JSON`); decide git hosting; retire the old Netlify site. Note: `next build` needs the two `NEXT_PUBLIC_` vars present or it fails (by design — no fallback keys). I will ask before any push/deploy.
- [ ] **Vercel (needs your account):** repo is on GitHub (`scotty126/GasBack-`, private/public not checked by me). In Vercel: Add New → Project → import it → add the 4 env vars → Deploy; then add the Vercel URL to Supabase Auth → URL Configuration (Site URL + redirect URLs). `gh` and the Vercel CLI are not installed on this PC. Git author is the pre-configured user (Giwa-lu / lucianagiwa@gmail.com).
- [ ] `plan/` (business plan + roadmap PDFs) is **gitignored on purpose** (confidential). Remove `/plan/` from `.gitignore` if you want it in the repo. `GasBack Images/` (3 unreferenced .webp design assets, ~480 KB) *is* committed.
- [ ] Decide: reserve size and FX source (default: dated value in `carbon_params`, updated by you); whether receipts sold by exact refill weight (e.g. 10.5 kg) must be accepted — today only 6 / 12.5 / 25 / 50 kg pass.
- [ ] After the first real scans: tell me what got wrongly rejected, so I can tune.

## Source of truth: [plan/](plan/)
Two PDFs: Business Plan and Development Roadmap. They disagree on WhatsApp timing (plan: Phase 1; roadmap: Phase 4). **User decided: Phase 4 per the roadmap.**

### The formula (business plan unit-economics table — arithmetic verified 2026-10-04)
- **5.017 kg CO2e avoided per kg LPG** → 12.5 kg = **62.71 kg CO2e**; at **$15/tCO2e** = **$0.941**; **50/50** → user **$0.47**, GasBack **$0.47**. Plan says user side ≈ "750–800 in reward points" (currency symbol lost in PDF extraction; read as ₦).
- **Now implemented** (see Current state): points = ⌊ kg × factor ÷ 1000 × price × user_share × FX ⌋, parameters in the `carbon_params` table (append-only, latest row wins, each receipt stores its `params_id`). With the plan's numbers and the placeholder ₦1,600/$, 12.5 kg → **752 points** (verified in SQL tests and TS tests).
- **Market check (2026-10-04, web search; no free live feed exists):** Fastmarkets cookstove SSA: CCP-labelled **$15.00 (26 May 2026)**, CORSIA-eligible **$10.55 (27 May 2026)**, down from $23.20 seven months earlier. Secondary sites: Gold Standard cookstove ~$8–25, top-integrity up to ~$39. The plan's $15 matches the CCP-labelled benchmark only. Newest data is ~4 months old.
- **Credibility risk (background knowledge, not searched):** registries/buyers typically discount cookstove claims; 5.017 assumes full charcoal displacement → treat as an upper bound until a methodology is chosen. `/methodology` says so publicly.

## Stack
Next.js 14.2.3 (App Router) · React 18 · TypeScript · Tailwind 3 · Supabase (auth, Postgres, private Storage bucket `receipt-uploads`) · Google Cloud Vision (OCR) · sharp + exifr (image checks) · lucide-react · next-themes.
Dev deps for tests: `@electric-sql/pglite` (real Postgres in WASM).

## Where things run
- **Dev:** `npm run dev`. No working Supabase project right now (see TODO).
- **Deployed:** previously Netlify; **going to Vercel**, mobile-optimised web app. Not deployed. API routes use `maxDuration = 30`.
- **Platform decision:** roadmap Phase 1 says native iOS/Android; user chose a Vercel mobile web app for now. Native deferred, not dropped.
- **Env vars** (`.env.local`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CREDENTIALS_JSON` (one line), `ADMIN_EMAIL` (unused in code).
- **Database order:** `schema.sql` (baseline) → `migrations/001_hardening.sql` → `migrations/002_storage.sql` → `seed_pilot.sql` (hand-edited). Migrations are re-runnable.
- **Tests:** `npm test` (19 Node tests: receipt parser, reward math, image checks) · `npm run test:sql` (47 checks of the migrations on PGlite) · `npx tsc --noEmit` · `npm run build`. `npm run lint` is NOT usable: no ESLint config exists, so it launches an interactive setup.

## Current state (2026-10-04)

### Built — and how far it was verified
| Piece | Verified how |
|---|---|
| **Auth on money routes:** `/api/scan`, `/api/redeem` take the user from the verified Supabase token (`src/lib/serverAuth.ts`); body `userId` is ignored | Real running server: spoofed-userId/no-token requests → 401; against a *fake* Supabase: invalid token → 401, and the DB call used the token's user even when the body named another user |
| **No hardcoded keys:** fallbacks removed from `supabaseClient.ts`; `/debug` page deleted | Grep of src; service-role key and Google creds absent from `.next` build output (0 hits; anon key present as expected) |
| **Private receipt bucket; scan takes a storage *path*, not a URL** (no URL fetching → no SSRF; path must be in the caller's own `<user_id>/` folder) | Fake-Supabase run: other user's folder / `..` / http URL → 400; missing file → 404. Bucket policy SQL (`002_storage.sql`) only checked to apply on PGlite with stubbed `storage` — NOT on real Supabase |
| **Atomic award + redeem** as Postgres functions `award_receipt()` / `redeem_points()` (dedupe, reserve cap, receipt, wallet, ledger in one transaction; browser can't call them or write receipts/wallets) | PGlite (real Postgres engine): 47 checks incl. refusals write nothing, RLS as `authenticated`, 200 voucher codes distinct + unbiased. **NOT verified:** true concurrent calls (PGlite is single-connection; the design uses a global advisory lock + row lock) and the live Supabase environment |
| **Real formula + dated parameters** (`carbon_params`), per-receipt CO2e/USD/points stored | SQL tests (752 pts for 12.5 kg) and TS mirror agree on the plan's numbers; `/methodology` renders live values (screenshot, fake backend) |
| **Pre-funded reserve** (`reserve_funding`): lifetime points issued can never exceed lifetime funding | SQL tests (refuses, writes nothing, balance unchanged) |
| **Receipt parser** (`receiptParser.ts`): volume, labelled invoice number only, date (several formats, day-first, Lagos time), total amount, ₦/kg plausibility 200–5000, ≤30 days old, not future | 12 unit tests on **synthetic** text only |
| **Image checks** (`imageChecks.ts`): exact SHA-256; EXIF editor-software tag and stale/future capture time rejected; no EXIF allowed but recorded; min 400px | 7 tests using real generated JPEG/PNG files with embedded EXIF; route-level via fake Supabase |
| **Rate limits / device signal:** 10 scans/user/h, 20/device/h, >2 other accounts on a device/24 h → 403; `scan_attempts` table; random device id in localStorage (`deviceId.ts`) | Fake-Supabase run (429 / 403 paths); browser run confirmed the client sends the bearer token + device id header |
| **Vouchers:** saved in `vouchers` table (unique CSPRNG code, bound to a merchant, status), visible again on the Redeem page | SQL tests; page rendered in a real browser against a fake backend |
| **Merchants:** real `merchants` table replaces the invented station list; empty → "No partner stations are live yet" | SQL + browser (fake backend) |
| **Fake content removed:** preview data, fake progress bar, "Diamond Tier", "+15%", "Lagos", dead Bell/Refer buttons, profile tier; landing/meta copy no longer promises "cash"; `/partners` and `/methodology` rewritten honestly; Privacy/Terms stale/unsupported facts fixed (see changelog) | Grep + screenshots at 390px of dashboard, redeem, history, profile, methodology, partners, login, landing |
| Build/type-check | `tsc` clean; `next build` succeeds (18 pages) |

**NOT verified live (and why):** anything against a real Supabase project (none reachable); real Google Vision OCR (no usable credentials path was exercised — the OCR branch was only checked to fail gracefully with a bad key: 503 `OCR_UNAVAILABLE`, ~2 s); the full success path of `/api/scan` through the real route (OCR is the unmockable step) — parser, image checks and SQL award were each tested separately but never chained in one real request; Apple/Google OAuth; email flows; real phones/cameras.

### Not built at all
WhatsApp/USSD · merchant portal / voucher validation & "mark redeemed" tool (vouchers can be created but nothing consumes them) · voucher expiry/refund job · merchant POS cross-check · on-chain dMRV / anchoring · registry/credit minting · vendor SaaS/billing · redemption fee · admin tools (`ADMIN_EMAIL` unused) · referral · notifications · retention/deletion jobs · native camera module (blur/edge/auto-crop) · embedded wallet.

## Known issues (OPEN — flagged, not fixed)
1. **Image perceptual hashing was tried and rejected.** On synthetic receipts, a 16×16 dHash put re-photos/recompressions of the *same* receipt 13–36 bits apart but *different* receipts on the same template only 2–18 bits apart — useless in both directions. Duplicate detection is exact-image SHA-256 + OCR identity (invoice+vendor, plus receipt date when the vendor is unknown). Consequence: a receipt altered/cropped before photographing, or an OCR misread of the invoice number, can slip through; fix needs merchant POS cross-validation (plan's own mitigation) — not built.
2. **All receipt/image thresholds are untuned** (accepted sizes, 200–5000 ₦/kg band, 30-day window, 48 h EXIF window, 400 px minimum, rate limits). Real receipts are required. Likely false-reject areas: OCR layouts where label and value are on different lines, sizes sold by exact weight, receipts with extra line items inflating the total.
3. Missing EXIF is allowed (screenshots/stripped photos pass the EXIF check); client-side `capture="environment"` encourages live camera but doesn't enforce it.
4. Device id is a random localStorage UUID — clearing site data resets it; weak signal only. Terms mention "device fingerprints" bans; not implemented.
5. Awards are serialised by one global advisory lock — fine for a pilot; revisit at volume.
6. `receipts.image_url` column now holds a storage *path* (name is historical).
7. Old test data: any wallet balances created under the old 0.12-pts/₦150 scheme would be worth ₦1 per point now. The old project is unreachable, so nothing to migrate.
8. Hydration warning in dev on `/profile` (theme buttons compare `theme` before mount) — pre-existing, cosmetic.
9. PWA: manifest icons missing (404) — see TODO.
10. No ESLint config; `npm run lint` is interactive.
11. `/privacy` §4 and §7 promise deletion/retention jobs that don't exist; `/terms` §3 (24-month expiry) and §7 (30-day single-use vouchers) likewise — see TODO (legal).
12. Auth pages (login/register/forgot/callback) were not read or changed this session; Apple sign-in is offered — configuration unknown.

## Roadmap vs. what exists
**Phase 1 — App & AI OCR core (M1–3)**
| Deliverable | Status |
|---|---|
| Mobile app shell | PARTIAL — responsive web app, not native |
| Figma design system | NOT STARTED (Tailwind `gb-*` tokens only) |
| Embedded non-custodial wallet | NOT STARTED / deferred — wallet is a Postgres balance (custodial) |
| Camera scanner (edge detection, auto-crop, blur filter) | NOT STARTED — plain file input with `capture` |
| OCR (ML Kit on-device + cloud fallback) | PARTIAL — cloud Vision; now extracts volume, invoice, date, amount; **no merchant-ID matching** |
| Fraud: EXIF validation | DONE (basic, untuned) |
| Fraud: unique receipt hashing | DONE as SHA-256 + OCR identity; perceptual hash rejected (Known issue 1) |
| Fraud: device fingerprinting | PARTIAL — random device id + per-device limits |
| Merchant onboarding + web portal | PARTIAL — `merchants` table only; no portal, no onboarding flow, no validation tool |
**Phase 2** (smart contracts, dMRV anchoring, pilot, audits): NOT STARTED. Groundwork: every receipt stores CO2e, USD value, params version, hashes — ready to anchor later. The pre-pilot security list is now closed (see changelog) pending live verification.
**Phase 3** (store release, registries, off-take, 100+ merchants): NOT STARTED (mostly business work).
**Phase 4** (WhatsApp, B2B SaaS, expansion): NOT STARTED. Its prerequisite — channel-neutral, token-authenticated `/api/scan` and `/api/redeem` — is now true for scan *input* shape (a storage path), but WhatsApp will need an upload path into the private bucket and a way to map a phone number to a user.

## Path forward
Done this session: security hardening, atomic award/redeem, real formula + reserve, fake-content removal, receipt/image/device checks (items 0–4 of the earlier plan, except `git init`).
Next, in order:
1. **Get a live Supabase project, apply the SQL, run the app end-to-end for real** (TODO above). Then verify live: the full scan success path with real Vision, storage policies, RLS, concurrent redeems. This is the single biggest unverified area.
2. **Tune with real receipts** (needs your photos).
3. **Merchant side:** a partner login + web tool to validate a voucher code and mark it redeemed (this is what `/partners` will eventually promise); voucher expiry/refund rule once you decide it.
4. **PWA/mobile polish for Vercel:** icons, installability, offline/low-data behaviour, camera UX (client-side blur/size feedback), test on real phones.
5. **Admin view** of FLAGGED receipts, reserve balance and issued points (today FLAGGED rows are written but nobody can review them).
6. Phase 2+: on-chain dMRV (chain/wallet choice deferred), pilot, audits, registry, off-take, WhatsApp, SaaS.

## Decisions (user, 2026-10-04)
- Vercel, mobile-optimised web app. WhatsApp stays Phase 4. Credits must be aggregated to reach market scale.
- **Pre-funded reserve approved** — points issued ≤ reserve (enforced in the DB).
- **1 point = ₦1 of refill discount, fixed** (user: "adopt 1 naira"); earn rate comes from `carbon_params`. Discount-only, no cash-out.
- Chain/wallet: "idg" (read as no preference) → deferred until after the pilot.

## Funding / revenue analysis (from the plan's formula)
- 1 tCO2e ≈ 16 refills. 2,500 households × 12 refills ≈ 1,881 t/yr ≈ **$28k gross at $15** ($14k to users, $14k GasBack) — and credits pay only after registration + verification (12–24 months). Credit sales cannot fund the pilot; aggregation is necessary, not sufficient.
- Approach: pre-funded reserve (~$14k/yr at pilot scale); join an existing Gold Standard programme or sell verified data to an aggregator rather than registering alone; seek advance offtake / results-based clean-cooking finance; bring revenue forward via merchant-funded discounts, redemption fee, SaaS.

## External blockers
- *(resolved 2026-10-04)* Supabase project was unreachable (NXDOMAIN) earlier the same day; the user restored it and it now resolves. Live verification of the new schema/functions is still pending the SQL being applied (TODO). Note: right after a restore, PostgREST returned transient 404 PGRST205 "table not found" errors for tables that exist — wait/retry before concluding tables are missing.
- No live carbon-price feed available to me; newest dated assessment is May 2026.

## Conventions
- Reads in pages use the browser `supabase` client (anon + RLS). **Anything that moves points goes through `/api/*` → service client → the two Postgres functions.** Never add a browser write to `receipts`, `wallets` or `transactions` (RLS blocks it by design).
- Reward maths lives in SQL (`award_receipt`); `src/lib/rewards.ts` is a display mirror — change both together; `tests/rewards.test.mjs` + `tests/sql/run.mjs` cover the agreement on the plan's numbers.
- `receiptParser.ts` and `rewards.ts` are import-free so Node tests can load them directly; keep it that way.
- No fallback secrets in code. `.env.local` is gitignored; git repo initialised 2026-10-04 (branch `main`); no remote yet; never push without in-the-moment approval.
- Public pages must say only what exists. If something is planned, say "planned/not yet".
- Test pattern for routes without a live backend: run `next dev` with env pointed at a small fake Supabase HTTP server (needs CORS headers and tolerant body parsing); it proves route logic, not the real database.

## Changelog
- **2026-10-04 (test reserve)** — User answered "fund it with 20m" to the question whether the reserve must be real now (answer given: no for testing, yes before real users). Inserted `reserve_funding` id 1 = ₦20,000,000 with a note marking it test funding. Verified by reading the row back and the table count (0 → 1). Did NOT run a live award to test (it would write a real receipt); the success path is covered by the PGlite SQL tests only. The app now accepts scans in principle on the live project — not yet exercised with a real logged-in user.
- **2026-10-04 (seed applied)** — User asked Claude to do the seed editing. FX looked up by web search: official CBN NFEM ₦1,329.12/$ on 3 Sep 2026 (a month old — newest found; sources allafrica.com / primebusiness.africa). Inserted via PostgREST with the service key after confirming the tables were empty: `carbon_params` id 1 and merchant "TEST Station (not real)". Reserve NOT funded (user's choice). Verified live afterwards: `award_receipt` → `RESERVE_EXHAUSTED` with receipts/transactions still 0/0; `redeem_points` at 0 balance → `INSUFFICIENT_BALANCE`; anon sees carbon_params 1 row, merchants 1 row, reserve_funding 0 rows. Keys: `.env.local` still has the OLD keys and they still work (HTTP 200) — user says they rotated, but legacy JWT keys appear still valid; old keys stashed outside the repo in the session scratchpad to prove revocation later (delete after). Not verified: any actual award (needs reserve), real logged-in user flows.
- **2026-10-04 (live verification of migrations)** — After the user applied 001+002, verified against the real project with read-only calls (plus two refused RPC calls that write nothing): nine public tables exposed (`carbon_params, merchants, receipts, reserve_funding, scan_attempts, transactions, users, vouchers, wallets`) and rpc `award_receipt`, `redeem_points`; bucket `receipt-uploads` is now `public: false`, 10 MB limit, image mime types only; **service role** `award_receipt` → `{ok:false, code:NOT_CONFIGURED}` (correct: no params seeded); **anon key** → `permission denied for function` on both functions (grants live-confirmed), and a direct anon INSERT of a VERIFIED receipt → 401; anon sees 0 rows of the service-only tables; receipts still 0. Seed NOT applied (all three seed tables empty). `.env.local` unchanged since 2026-06-02 → keys were not rotated. Git history has never contained the old keys (first commit was scanned) but they existed in pre-git source and a Netlify deploy, so rotation still stands. Not verified: storage upload/read policies with a real logged-in user; RLS for a real `authenticated` JWT; the full scan→award path; concurrency. No writes were made to the live DB.
- **2026-10-04 (Supabase back)** — User said the project was ready. Checked with the keys in `.env.local` (no secrets printed): host resolves, auth health 200; PostgREST OpenAPI lists only `users`, `wallets`, `receipts`, `transactions` (+ an unrelated `rls_auto_enable` rpc); row counts 1/1/0/0, no wallet with points; live columns and enums match `schema.sql` exactly. Storage bucket `receipt-uploads` exists and is `public: true`. Conclusion: apply 001 → 002 → edited seed; do NOT run `schema.sql`. Transient 404s right after restore were a cold schema cache. Not verified: anything beyond metadata/counts (no writes made); the `rls_auto_enable` function (not ours — purpose unknown).
- **2026-10-04 (push)** — User supplied `https://github.com/scotty126/GasBack-` and asked to proceed. Added remote `origin`; remote was empty (`ls-remote` → no refs); plain `git push -u origin main` (no force) waited on a GitHub sign-in prompt (Git Credential Manager) and then succeeded. Verified: remote `refs/heads/main` = local HEAD `0744d7c`. Re-checked Supabase: `.env.local` unchanged since June, host still unresolvable (HTTP 000), so no tables could be checked. Nothing deployed to Vercel (needs the user's account). This changelog commit is local only until the user approves another push.
- **2026-10-04 (git)** — `git init -b main`; added `.gitignore` entries (`*.tsbuildinfo`, `.vercel`, `.claude/`, `/plan/`); reviewed the staged list (48 files; no env files/build output) and scanned staged content for both Supabase keys, the old project refs and `BEGIN PRIVATE KEY` → 0 hits; first commit `57d0307`. No remote, nothing pushed, nothing deployed: `gh`/Vercel CLI absent and both need the owner's accounts. Not verified: that a Vercel build with real env vars succeeds (local `next build` does).
- **2026-10-04 (build session — first five roadmap items)**
  - *Found & fixed:* hardcoded service-role/anon keys in `supabaseClient.ts` and a second project's keys in `/debug` (page deleted); `/api/*` trusted a body `userId` (now token-derived); `/api/scan` took any URL (now a path in the caller's folder of a private bucket); non-atomic wallet math (now `award_receipt`/`redeem_points`); `Math.random` voucher codes with no uniqueness (now CSPRNG + UNIQUE + `vouchers` table); invoice regex accepted any 5–8 digits (labelled numbers only); **old unique index made fraud-audit FLAGGED rows impossible to insert — confirmed on the baseline schema, fixed by indexing VERIFIED only**; the dashboard "Receipts verified" count was capped at 4 by a `limit(4)` query (now a real count); CO₂ tile used the points rate as a CO₂ factor (now stored `co2e_kg`); points formula contradicted the business plan (now `carbon_params`); methodology page claimed a different formula, an "approved station registry", peer review, third-party audits and unrelated standards (rewritten); `/partners` claimed 12,000 users, "+40% repeat visits", 48-hour reimbursement etc. (removed); Terms quoted 0.12 pts/kg and ₦150/pt (replaced); Privacy/Terms placeholder company number removed, unverified "EU-West" removed, device id + photo metadata now disclosed.
  - *Design change after measuring:* dropped perceptual image hashing (Known issue 1).
  - *Tests written bug-first:* the first runs caught real bugs — "12.50 kg" didn't match; PNG headers were counted as EXIF; (my test had a wrong UTC conversion, not a code bug).
  - *Verified:* see Current state table. *Not verified:* see the list under it — chiefly everything against a real Supabase/Vision.
  - *Dependencies added:* `sharp`, `exifr`; dev: `@electric-sql/pglite`. Added `npm test`, `npm run test:sql`.
  - *Scratch cleanup:* test servers stopped; temporary mock/script files removed from the repo (kept outside it).
- **2026-10-04 (decisions / price check / plan read / audit)** — Created this file; audited code; read both plan PDFs (text via `pdftotext`); recorded formula, roadmap matrix, platform decision, funding analysis; web-searched carbon prices (no live feed; Fastmarkets May 2026 is the newest); user approved the reserve and the 1 pt = ₦1 unit.
