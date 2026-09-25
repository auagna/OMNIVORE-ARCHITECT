# OMNIVORE ARCHITECT Project Guidance

## Product purpose

Build the operating web app for the youth architecture community **OMNIVORE ARCHITECT**. The product coordinates official programs and member-led activity while preserving records as a growing archive and learning system.

The canonical English name is `OMNIVORE ARCHITECT`. Do not write `omnivore-architect` as a public brand name.

## Product principles

- Treat the dining-table-like community experience—meeting, learning, making, and recording—as more important than feature volume.
- Every program should leave a useful `Record`; records are required product structure, not optional promotional content.
- Keep governance understandable: members can initiate lightweight activity, while official programs and protected communication remain moderated.
- Do not expose unopened concepts as active navigation or imply that planned programs already operate.
- Preserve an editorial, spatial character without sacrificing task clarity.

## Program model

Current public program types:

- `Lecture` — official lecture schedule and records.
- `Reading` — official reading meetings and records.
- `Beongae` — lightweight member-initiated gatherings.
- `Workshop` — initially operates as a Beongae subtype or derived format; promote to an independent top-level program only after repeated demand and operational sustainability are verified.

`Collective` is reserved and must remain closed. Do not publish it as an available program, route, filter, or creation option until the user explicitly opens it.

Apply the promotion rule to new programs:

`Beongae pilot -> repeated operation -> demand and sustainability evidence -> independent program decision`

Volunteer work and shelter or housing-improvement initiatives follow the same rule. Do not prematurely hard-code every experimental format as a permanent taxonomy.

## Roles and permissions

### Visitor

- View public introduction, program listings, schedules, and public records.
- Cannot create events, join protected chats, or view member-only information.

### Member

- Account profile includes at least name and participation cohort.
- Create Beongae with place, date and time, participation method, and payment method.
- Join eligible programs and access participant-only communication for joined programs.
- Cannot publish official notices, change official program status, or access operations-only data.

### Operator

- Manage official programs, members, records, notices, moderation, and program status.
- Review or intervene in member-created Beongae when operational or safety issues arise.
- Access operator-only inquiries and administrative views.

Enforce authorization server-side. Hidden UI is not authorization.

## Beongae and event rules

- Support both individual ticket purchase and organizer-collected participation fees without conflating them.
- Make cost responsibility and refund or cancellation terms visible before joining.
- Require place, time, host, participation capacity or policy, and contact path.
- Distinguish draft, published, full, cancelled, completed, and archived states.
- Do not erase completed programs; transition them into records.

## Communication

- Participant chat is available only to joined participants and authorized operators.
- Inquiry and announcement visibility must follow explicit role and participation rules.
- Emoji reactions on chat bubbles are lightweight metadata, not separate messages.
- Reactions must support toggle, aggregate counts, current-user state, real-time updates, and accessible labels.
- Define moderation, deletion, and audit behavior before expanding chat into a general social feed.

## Records and media

- A program record should connect schedule, host, participants where appropriate, images, links, and written reflection.
- Imported event images and linked media may be normalized, cropped, and corrected, but preserve original source attribution and avoid destructive replacement.
- Use stable object relationships so records remain useful if the navigation or program taxonomy changes.

## Information architecture

Prefer user intent over organizational hierarchy:

1. Discover what is happening.
2. Understand the program and eligibility.
3. Join or create an activity.
4. Communicate with the relevant people.
5. Return to the record afterward.

Avoid duplicate entry points that perform the same action with different labels. Preserve a clear difference between `Program`, `Schedule/Event`, `Record`, `Member`, and `Message`.

## Visual system

- Base palette: black `#000000`, white `#FFFFFF`, gray `#8A8A8A`, line `#E8E8E8`.
- Use near-black only when it improves long-form reading or hierarchy; do not introduce decorative color without a semantic role.
- Establish hierarchy through scale, spacing, alignment, density, and motion before adding containers or ornament.
- Prefer an editorial and architectural composition: strong grid, generous negative space, precise typography, and restrained surfaces.
- The mini logo is a rectangle with only the upper-right area cut out as a square. Do not reinterpret it as a generic notch, folded corner, or irregular polygon.
- Design mobile and desktop together; do not treat mobile as a compressed desktop layout.

## Motion

- Match one primary motion behavior to each page's purpose.
- Motion must clarify entry, status, relationship, or archive continuity.
- Avoid stacking multiple showcase effects on one page.
- Cursor-driven effects require a non-pointer fallback and must not block reading or primary actions.
- Respect reduced-motion preferences and verify keyboard and touch behavior.
- Componentry references may inspire implementation, but do not copy an effect before validating performance, licensing, accessibility, and product relevance.

## Engineering boundaries

- Inspect the actual framework, package manager, schema, auth model, and commands before changing code; do not infer them from this document.
- Keep roles, program types, and lifecycle states centralized and typed rather than duplicated as UI strings.
- Model experimental categories as data or configuration when possible instead of permanent routes.
- Protect personal data and participant-only content in queries and server actions.
- Add migrations, seed changes, and rollback notes when data models change.
- Preserve user changes and avoid unrelated visual or architectural refactors.

## Required verification

For relevant changes, verify:

- lint, formatting, type checks, tests, and production build using repository-defined commands;
- visitor, member, operator, participant, and non-participant authorization paths;
- loading, empty, error, full, cancelled, and archived states;
- responsive behavior at representative mobile and desktop widths;
- keyboard navigation, focus visibility, labels, contrast, and reduced motion;
- persistence and real-time behavior for chat and reactions;
- no public exposure of `Collective` or other unopened programs.

Do not claim completion if the relevant checks were not executed. Record unavailable checks and the remaining risk.

## Planning trigger

Use `PLANS.md` for work that crosses data model, authorization, navigation, or more than one major feature area. Invoke `llm-council` before changing the core taxonomy, role model, record model, or program-promotion rule.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
