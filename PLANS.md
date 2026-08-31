# OMNIVORE ARCHITECT Execution Plans

Use this file for multi-stage work that cannot be completed and verified in one focused change. Keep plans alive: update decisions, evidence, progress, and discoveries as work proceeds.

## Plan status

- `Draft` — scope or acceptance criteria remain unresolved.
- `Ready` — dependencies and acceptance criteria are known.
- `In progress` — implementation has begun.
- `Blocked` — a named dependency or decision prevents progress.
- `Verified` — acceptance evidence is recorded.
- `Superseded` — replaced by a linked decision or plan.

## Active plan template

### Title

`[Outcome, not activity]`

### Status

`Draft | Ready | In progress | Blocked | Verified | Superseded`

### Decision

State the smallest decision being made now and what is explicitly outside scope.

### User outcome

Describe the observable change for visitor, member, operator, or participant.

### Current evidence

- User-provided facts:
- Repository facts with file references:
- Assumptions requiring validation:
- Prior decisions that must remain intact:

### Constraints

- Product and program rules:
- Authorization and privacy:
- Data compatibility:
- Design and accessibility:
- Time, budget, or platform:

### Failure and falsification

- Strongest reason this plan may be wrong:
- Evidence that would reject the proposed structure:
- Cheapest discriminating test:

### Affected surfaces

- Routes and navigation:
- Components:
- Data model and migrations:
- Server actions or API:
- Authorization:
- Real-time behavior:
- Tests and documentation:

### Milestones

1. **Inspect** — map the existing implementation and record contradictions.
2. **Decide** — settle the smallest viable structure and acceptance criteria.
3. **Vertical slice** — implement one complete user path with real persistence and authorization.
4. **Expand** — cover remaining states and surfaces without duplicating logic.
5. **Verify** — run checks, review the diff, repair findings, and record evidence.

For each milestone record:

- Scope:
- Files or systems:
- Acceptance criteria:
- Verification command or observable test:
- Result:

### Acceptance matrix

| Actor/state | Expected behavior | Verification | Result |
|---|---|---|---|
| Visitor | | | |
| Member | | | |
| Participant | | | |
| Non-participant | | | |
| Operator | | | |
| Loading/empty/error | | | |
| Mobile/desktop | | | |

### Progress log

- `YYYY-MM-DD` — decision, implementation, discovery, blocker, or test result.

### Completion evidence

- Commands executed and results:
- Manual paths verified:
- Diff review findings and repairs:
- Known limitations:
- Follow-up work deliberately excluded:

## Initial recommended plan

### Title

Establish the program-to-record vertical slice

### Status

Draft

### Decision

Validate one end-to-end path—published Beongae discovery, member joining, participant communication, completion, and Record transition—before expanding all program categories or decorative motion.

### User outcome

A member can discover a real Beongae, understand payment and participation conditions, join it, access protected communication, and later return to its Record. A visitor or non-participant cannot access protected chat; an operator can moderate the lifecycle.

### Why first

This slice tests the product's central relationships: program, event state, member role, participation, protected communication, and record continuity. It exposes structural mistakes earlier than building isolated pages.

### Explicitly outside scope

- Opening `Collective`.
- Promoting Workshop to an independent program.
- General-purpose social feeds or direct messages.
- Multiple page-specific showcase animations.
- Full payment processing before payment responsibility and cancellation policy are resolved.

### Smallest test

Use one seeded Beongae and three test identities—visitor, member, operator—to verify the complete lifecycle with real authorization and persistence. Do not substitute clickable mockups for this test.

## Active plan — Program TALK emoji reactions

### Status

Implemented; live Supabase and device/browser release validation pending

### Decision

Add emoji reactions as message metadata, not as messages, Likes, rankings, or a general social feature. Use a small fixed OA reaction set for MVP; participants toggle one reaction row in the existing Program TALK. No free-form picker, custom emoji, reaction notifications, or reaction inbox entries.

### User outcome

A confirmed participant, Program host, or Admin can add and remove an emoji reaction on a visible Program message. Counts and the current viewer's selection update through the existing Program TALK realtime invalidation path.

### Current evidence

- User-provided fact: chat needs emoji display/support.
- Repository fact: `AGENTS.md` requires reaction toggle, aggregate counts, current-user state, realtime updates, and accessible labels.
- Repository fact: Program TALK already has repository-level authorization, RLS-protected messages, and one shared realtime subscription per Program.
- Prior decision: reaction is not a new message type and must not become Like/feed behavior.

### Constraints

- Reuse confirmed-participant/host/Admin TALK authorization at DB and repository boundaries.
- Show reactor names only inside an authorized Program TALK reaction detail; never expose them to locked, logged-out, or unrelated members.
- Use the exact MVP allowlist `👍`, `❤️`, `😂`, `😮`, `👏`, `✅` and permit only one reaction per user/message.
- Preserve NOTICE/QUESTION/CHAT exactly; no schema changes to `program_messages`.
- Use rectangular, divider-led OA UI with 44px touch targets and accessible toggle labels.
- Keep migration additive and deterministic; include rollback notes.

### Failure and falsification

- Strongest risk: reaction metadata leaks Program participation or lets an unauthorized user infer protected messages.
- Reject the structure if a non-participant can select, aggregate, or subscribe to reactions for a protected Program.
- Cheapest test: run repository and SQL policy tests with confirmed, waitlist, cancelled, host, Admin, and logged-out actors.

### Affected surfaces

- Route: `/program/[programId]?tab=talk`
- Components: Program detail TALK message list
- Data: `message_reactions`
- Repository: list/toggle/watch Program TALK
- Authorization: RLS and repository capability checks
- Realtime: invalidate the existing Program TALK query on reaction changes
- Tests: domain/repository/component/SQL/realtime regressions

### Acceptance matrix

| Actor/state | Expected behavior | Verification | Result |
|---|---|---|---|
| Visitor | No TALK or reaction data | Repository/RLS test | PASS — repository + static SQL policy |
| Confirmed participant | Read and toggle reactions | Integration/component test | PASS |
| Waitlist/APPLIED | No reaction read or write | Permission/SQL test | PASS |
| CANCELLED participant | Existing reactions and reactor list remain readable; add/change/remove is denied | Permission/SQL/component test | PASS |
| CANCELLED Program | Existing reactions remain readable; add/change/remove is denied | Permission/SQL/component test | PASS |
| Host | Read and toggle regardless of participation row | Integration test | PASS |
| Admin | Read and toggle on every Program TALK | Permission/SQL test | PASS |
| Loading/empty/error | Existing TALK states remain intact; mutation error is announced | Component test | PASS |
| Mobile/desktop | 44px controls, no horizontal overflow | Component/CSS review | PARTIAL — automated review PASS; physical-device QA pending |

### Milestones

1. Inspect existing TALK, repository, RLS, and realtime implementation.
2. Add the smallest reaction read model and authorization-preserving migration.
3. Implement one message reaction row and toggle path in mock and Supabase adapters.
4. Repair pending Admin/TALK access regressions without broad refactors.
5. Run typecheck, lint, tests, build, diff review, and record evidence.

### Progress log

- `2026-08-31` — Selected fixed-set message reactions after repository guidance clarified the user's emoji request. Began architecture and permission audit.
- `2026-08-31` — Added one-reaction-per-member storage, authorized batch/toggle RPCs, private Program Broadcast invalidation, mock/Supabase adapters, optimistic UI queue, long press, keyboard picker, and reactor list.
- `2026-08-31` — Reaction validation PASS: 7 files / 41 tests; Admin regressions PASS: 3 files / 8 tests; strict TypeScript and targeted ESLint PASS.
- `2026-08-31` — Browser/device and live Supabase validation remain open: the current workspace dependency cache did not return a compiled route, and no linked Supabase CLI/database credential is available.
