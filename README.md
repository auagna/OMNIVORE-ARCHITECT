# OMNIVORE ARCHITECT

Mobile-first program operations MVP for the OMNIVORE ARCHITECT community.

The current v3.3 implementation keeps Program as the central object and covers:

- Discover → Detail → Join → MY Upcoming
- Propose Gathering → Preview → Admin approval → Publish
- Changes requested → Member revision → Resubmit
- Domain capabilities for view, participation, TALK, approval, operations, payment, and Record
- Operational edits applied immediately; material edits returned to Admin approval
- Program TALK with Notice / Question / Chat, pinned notices, replies, one-per-message Emoji Reactions, and read-only cancellation states
- Program Activity audit events without a member-facing Activity Feed
- WHAT-first 30-second Record with optional FOUND / MATERIAL
- Month Calendar with ALL / MINE scopes
- Google Calendar and `.ics` export
- Admin task overview, approvals, and editable PageContent
- Admin Program, member registration, conversation, and Record inventories
- Supabase SSR/Auth with email login and PENDING multi-season registration
- Typed Supabase repository with RLS/RPC authorization and scoped TALK Realtime

The default app runtime remains the typed mock repository until Supabase project
values are configured. Production mode fails closed; it never falls back to
browser-local mock data after `NEXT_PUBLIC_DATA_SOURCE=supabase` is selected.

## Supabase SQL order

### Fresh project / manual SQL Editor

For a new project provisioned through the Supabase SQL Editor, apply every file
in this exact order. Run one file at a time and stop on the first error:

1. `supabase/migrations/20260829000000_base.sql`
2. `supabase/migrations/20260829010000_auth_registration.sql`
3. `supabase/migrations/20260829020000_v3.sql`
4. `supabase/migrations/20260829030000_v3_1.sql`
5. `supabase/migrations/20260829040000_v3_2.sql`
6. `supabase/migrations/20260829050000_lifecycle_rpc.sql`
7. `supabase/migrations/20260829060000_revision_apply.sql`
8. `supabase/migrations/20260829070000_read_models.sql`
9. `supabase/migrations/20260829080000_gathering_write_rpc.sql`
10. `supabase/migrations/20260829090000_talk_realtime.sql`
11. `supabase/migrations/20260830000000_admin_operations.sql`
12. `supabase/migrations/20260831000000_create_message_reactions.sql`
13. `supabase/migrations/20260831010000_add_program_message_hidden_state.sql`
14. `supabase/migrations/20260831020000_seed_default_seasons.sql`
15. `supabase/migrations/20260831030000_seed_default_page_content.sql`
16. `supabase/migrations/20260831040000_reaction_security_hardening.sql`

The sequence creates the physical model and registration trigger first, then
approval/lifecycle/revision rules, safe read models, atomic Gathering mutations,
the approval-aware TALK Realtime boundary, Admin-only member registration RPCs,
TALK-authorized Message Reaction storage, hidden-message moderation guards, the
agreed Season and PageContent defaults, and finally the Admin-only moderation
RPC plus locked Reaction authorization inputs. The PageContent seed never
overwrites an existing key. Member approval allows only the locked
`PENDING -> MEMBER` transition; direct browser updates to `users.status` remain
unavailable. No SQL file is applied automatically.

### Linked Supabase CLI migration history

The SQL Editor executes SQL but does not add rows to the Supabase CLI migration
history. Do not paste a timestamped migration in the SQL Editor and then run it
again with `supabase db push`. For an already linked project, first run
`supabase migration list` and verify the remote history against the schema. Use
`supabase migration repair --status applied <version>` only for a timestamped
file whose effects have already been verified in that project; never mark an
unverified migration as applied. Once the verified baseline and remote history
match, preview the pending set with `supabase db push --dry-run`, then apply the
reviewed timestamped files with `supabase db push`.

`supabase/migrations` is the release source of truth and now contains the full
fresh-project chain. A new linked project may use `supabase db push` after a
reviewed dry run. The legacy root SQL files remain only as historical references
and must not be applied in addition to the timestamped migration copies.

Reaction Realtime uses the private `oa-program-talk:<program_id>` Broadcast
topic. In Supabase Realtime Settings, disable public channel access before
enabling the Supabase runtime; clients authenticate the channel before joining.

The Season seed creates `0기`, `1기`, `2기`, and current `3기`; the registration
trigger rejects empty or unknown season IDs. Bootstrap the first Admin by
registering a normal account with one of those Seasons, then promote that
specific `public.users` row from the Supabase SQL Editor. Never expose a service
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

The mock repository persists participation, proposals, approvals, TALK and its
Emoji Reactions, Activity, Record, and PageContent in browser local storage. Use the reset
control under MY when you need the original seed.
