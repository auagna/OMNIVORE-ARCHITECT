# OMNIVORE ARCHITECT

Mobile-first program operations MVP for the OMNIVORE ARCHITECT community.

The current v3.3 implementation keeps Program as the central object and covers:

- Discover → Detail → Join → MY Upcoming
- Propose Gathering → Preview → Admin approval → Publish
- Changes requested → Member revision → Resubmit
- Domain capabilities for view, participation, TALK, approval, operations, payment, and Record
- Operational edits applied immediately; material edits returned to Admin approval
- Program TALK with Notice / Question / Chat, pinned notices, replies, and read-only cancellation states
- Program Activity audit events without a member-facing Activity Feed
- WHAT-first 30-second Record with optional FOUND / MATERIAL
- Month Calendar with ALL / MINE scopes
- Google Calendar and `.ics` export
- Admin task overview, approvals, and editable PageContent
- Supabase SSR/Auth with email login and PENDING multi-season registration
- Typed Supabase repository with RLS/RPC authorization and scoped TALK Realtime

The default app runtime remains the typed mock repository until Supabase project
values are configured. Production mode fails closed; it never falls back to
browser-local mock data after `NEXT_PUBLIC_DATA_SOURCE=supabase` is selected.

## Supabase SQL order

Apply every file in this exact order to a new project:

1. `supabase-v3.3-base.sql`
2. `supabase-v3.3-auth-registration.sql`
3. `supabase-v3.sql`
4. `supabase-v3.1.sql`
5. `supabase-v3.2.sql`
6. `supabase-v3.3-lifecycle-rpc.sql`
7. `supabase-v3.3-revision-apply.sql`
8. `supabase-v3.3-read-models.sql`
9. `supabase-v3.3-gathering-write-rpc.sql`
10. `supabase-v3.3-talk-realtime.sql`

The sequence creates the physical model and registration trigger first, then
approval/lifecycle/revision rules, safe read models, atomic Gathering mutations,
and finally the approval-aware TALK Realtime boundary. No SQL file is applied
automatically.

Before opening registration, create the real `Season` rows in Supabase. The
registration trigger rejects empty or unknown season IDs. Bootstrap the first
Admin by registering a normal account with a valid Season, then promote that
specific `public.users` row from the Supabase SQL editor. Never expose a service
role key to the browser.

## Production runtime

Copy `.env.example` to `.env.local` and set browser-safe project values:

```bash
NEXT_PUBLIC_DATA_SOURCE=supabase
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

The legacy anon key variable remains supported for older Supabase projects.
Do not put the secret/service-role key in a `NEXT_PUBLIC_` variable.

## Run

```bash
npm install --no-audit --no-fund
npm run dev
```

Then open http://localhost:3000.

## Verify

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

The mock repository persists participation, proposals, approvals, TALK,
Activity, Record, and PageContent in browser local storage. Use the reset
control under MY when you need the original seed.
