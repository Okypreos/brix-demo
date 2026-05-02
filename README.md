# Demo Scheduling

Multi-manager job scheduling with backend-enforced conflict prevention,
realtime updates, and role-aware UI.

**Live demo:** *link to be added on deploy*

---

## Tech stack & why


| Layer         | Choice                      | Why                                                                                                                                                         |
| ------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework     | Next.js 16 (App Router)     | Server Components by default keep the client bundle small. Async route params and the `(group)/` layout convention map cleanly onto the manager/tech split. |
| Backend       | Convex                      | Reactive queries, ACID transactions, and serializable optimistic concurrency control out of the box — exactly the primitives this challenge needs.          |
| Auth          | Clerk                       | First-class JWT integration with Convex; no homemade session table.                                                                                         |
| Styling       | Tailwind CSS v4 + shadcn/ui | Tokenised design system, no CSS-in-JS runtime cost, every component is owned source we can edit.                                                            |
| Forms         | react-hook-form + zod       | Uncontrolled inputs (no per-keystroke re-renders), schema-validated client-side; the server re-validates everything via `convex/values`.                    |
| Calendar      | react-big-calendar          | Mature week/day/agenda views; lazy-loaded (`next/dynamic`, `ssr: false`) so unrelated pages don't pay for the ~18 KB CSS or its localizer chain.            |
| Notifications | Sonner                      | Tiny, accessible, integrates with the reactive feed via a thin bridge component.                                                                            |


---

## Architecture at a glance

```
Browser
  │
  │  HTTPS, Clerk session cookie
  ▼
Next.js (App Router)
  ├─ Server Components            ── HTML on first request
  ├─ Client Components ("use client") for anything reactive
  │     │
  │     │  WebSocket, Clerk JWT in every frame
  │     ▼
  │  Convex client (ConvexProviderWithClerk)
  │     │
  ▼     ▼
Convex
  ├─ auth.config.ts         ── verifies Clerk JWT before any function runs
  ├─ queries  (read-only, reactive)
  ├─ mutations (serializable transactions, ACID)
  ├─ HTTP routes (Clerk webhook → users sync)
  └─ schema.ts (typed tables + indexes)
```

The interesting properties of this layout:

- **Reads are subscriptions, not requests.** `useQuery(api.jobs.listWithQuotes, { … })` opens a WebSocket subscription. When any mutation writes a row that intersects this query's read set, Convex invalidates and pushes the new result. No polling, no manual cache invalidation.
- **Mutations are atomic and serializable.** Multiple writes in a single mutation either all commit or none do. Concurrent mutations behave as if they ran one after another, in some order.
- **The server is the only authority.** Every role check, every overlap check, every business rule lives inside a Convex function. The client is purely a view of the server's truth.

---

## Data model

Five logical entities, four physical tables. See `convex/schema.ts`.

```
users           ── single table, role ∈ {"manager", "technician"}
quotes          ── unscheduled → scheduled → completed
jobs            ── (quote, technician, manager, [start, end))
notifications   ── (recipient, kind, jobId, message, readAt?)
```

### Why one `users` table instead of two

The original spec lists Managers and Technicians as separate entities. My first design followed that literally — two tables, two FK columns on every dependent record (`managerId`, `technicianId` typed against different tables). After auditing it I collapsed both into a single `users` table with a `role` field. The two-table design produced:

- **Code duplication** — separate `getManager` / `getTechnician` queries, two webhook upsert paths, two auth helpers.
- **FK fragility** — promoting a technician to manager would orphan every `jobs.technicianId` pointing at them, since the row would have to move between tables. The type system wouldn't catch it; everything would break at runtime.
- **A discriminated union on the client** that every consumer had to branch on (`user.kind === "manager"` vs `"technician"`), even when the role didn't matter.

A single `users` table eliminates all three. Role transitions are an in-place `ctx.db.patch(userId, { role: "manager" })` — every existing FK keeps working. Authorization moves from a compile-time invariant to a runtime check at the function boundary (`requireRole`), which is easy to read and easy to test.

The only thing the single-table design needs that the two-table one didn't is a *runtime* role check inside `jobs.assign` (`if (technician.role !== "technician") throw NOT_FOUND`). One line. Worth the trade.

### Indexes

```ts
users.by_clerk_id              // every authenticated read does this lookup
users.by_role                  // listTechnicians()
quotes.by_status               // KPI counts + filtered list views
quotes.by_manager              // seed deduplication, future ownership filter
jobs.by_technicianId_and_start // overlap predicate (the important one)
jobs.by_technicianId_and_status
jobs.by_quoteId
jobs.by_managerId
notifications.by_recipientId_and_readAt
notifications.by_recipientId
```

The `jobs.by_technicianId_and_start` index is the load-bearing one — it's how `findOverlappingJob` narrows the read set so concurrent assigns to *different* technicians don't contend at all. More on that below.

---

## Conflict prevention

This is the part of the spec that drove the most architectural decisions.

### The requirement

> A technician must never end up with two overlapping jobs. The check must be enforced on the backend.

### The naive approach

The obvious solution is `SELECT … WHERE technicianId = ? AND end > newStart AND start < newEnd; if empty, INSERT`. That works for one user. With two managers clicking *Assign* on the same technician at the same instant, there's a window between the SELECT and the INSERT where both observe an empty slot and both insert. Classic TOCTOU.

The traditional fixes are:

1. `**SELECT … FOR UPDATE`** — pessimistic row locks. Serialises all assigns to a technician through a single bottleneck.
2. **Application-level mutex** (Redis lock, queue) — adds a moving part, requires careful release on failure, doesn't help if the mutex itself partitions.
3. **PostgreSQL exclusion constraints** — beautiful, but tied to one database.

### What this codebase does

Convex mutations are **serializable transactions with optimistic concurrency control**. Each mutation runs as if it were the only one in the system; the runtime tracks the *read set* (every row, range, and index lookup the function read) and the *write set* (every row it inserted, patched, or deleted). At commit time:

- If no other committed transaction's write set intersects this transaction's read set, it commits.
- Otherwise it aborts and the entire mutation function is re-run from scratch. The retry observes the latest committed state, so on the second pass it sees whatever the conflicting writer just committed.

This gives us "serialise only when you actually conflict" for free. Two assigns to *different* technicians never touch each other's read sets and commit in parallel. Two assigns to the same technician with non-overlapping windows hit *different keys* on the `by_technicianId_and_start` index and also commit in parallel. Two assigns to the same technician with overlapping windows do conflict — one wins, one retries, the retry observes the winner in its read set, and we throw a deterministic `OVERLAP` error.

### A walkthrough of the race

Two managers click *Assign Jordan, Tue 14:00–16:00* at the same instant. Mutation A and Mutation B are dispatched simultaneously.

```
T0  A reads jobs.by_technicianId_and_start
       where technicianId = jordan AND start < 16:00
       → []                                   (read set: this index range)
T0  B reads jobs.by_technicianId_and_start
       where technicianId = jordan AND start < 16:00
       → []                                   (same read set)
T1  A inserts jobs(jordan, 14:00, 16:00)
       commit attempt → no conflicting writer → COMMIT
T1  B inserts jobs(jordan, 14:00, 16:00)
       commit attempt → A's write intersects B's read set → ABORT
T2  Convex transparently retries B's mutation
T2  B reads jobs.by_technicianId_and_start
       where technicianId = jordan AND start < 16:00
       → [A's row]
T2  findOverlappingJob returns A's row
       throw new ConvexError({ code: "OVERLAP",
                               conflictStart, conflictEnd, … })
T3  Manager B's UI catches the ConvexError, formats the
    conflicting window, and shows:
       "Jordan already has a job during that time
        · Tue Apr 30, 2:00pm – 4:00pm"
```

No application-level locks. No retry loop in the calling code. No race window. The retry is invisible to the application — it's the runtime's job.

### Why the index matters

`findOverlappingJob` (`convex/jobs.ts`) uses `withIndex("by_technicianId_and_start", q => q.eq("technicianId", id).lt("start", newEnd))`. The reason this is in an index range — not a `.filter()` over all jobs — is that it bounds the read set to a single technician's slice of the table. Without the index, every `jobs.assign` would read every row in the table, every assign would conflict with every other concurrent assign, and the system would serialise all writes to all technicians through a single bottleneck. With the index, only assigns to the *same* technician with *overlapping* windows ever contend. This is what makes the OCC approach scale.

### Half-open intervals

`overlaps(aStart, aEnd, bStart, bEnd) ⇔ aStart < bEnd && bStart < aEnd`. Half-open `[start, end)` semantics mean a job ending at 14:00 and one starting at 14:00 are *not* in conflict — the standard convention for calendar systems. Pure function in `convex/lib/intervals.ts`, reusable on the client for an instant "this slot is taken" preview if we ever want one.

### What the user sees on conflict

The mutation throws `ConvexError({ code: "OVERLAP", conflictStart, conflictEnd, … })`. The form catches it, formats the conflicting window with `formatJobWindow`, and shows:

> Time slot taken — Jordan already has a job during that time · Tue Apr 30, 2:00pm – 4:00pm

The user knows the exact window to dodge without a second round-trip.

---

## Authorization

Authorization is layered. Each layer has one job, and each layer is independently sufficient for the next layer's failure mode.

### Layer 0 — JWT validation (Convex auth boundary)

`convex/auth.config.ts` declares Clerk as the trusted issuer. Before *any* query or mutation runs, Convex fetches Clerk's JWKS, verifies the JWT signature, and exposes the identity via `ctx.auth.getUserIdentity()`. Without a valid token, `getUserIdentity()` returns `null`, and our `requireCurrentUser` helper throws `UNAUTHENTICATED`. The function body never executes.

### Layer 1 — `RoleGate` (client-side, UX)

`components/layout/role-gate.tsx` wraps every workspace layout. It reads `useConvexAuth()` + `useQuery(api.users.current)` and:

- Bounces signed-out users back to `/`.
- Bounces wrong-role users to their correct workspace (e.g. a technician hitting `/dashboard` is redirected to `/schedule`).
- Shows a "syncing your account" card during the brief gap where Clerk has authenticated the user but the `user.created` webhook hasn't yet mirrored them into Convex.
- Renders the workspace shell only when the role matches.

This layer exists for UX, not security — it turns "broken page" into "redirected to the right place".

### Layer 2 — `requireRole` (server-side, security)

`convex/lib/auth.ts` exposes `requireManager(ctx)` / `requireTechnician(ctx)`. Every role-protected function calls one of them as its first line. Even if Layer 1 were entirely bypassed (devtools edit, malicious extension), a technician hitting a manager-only function still sees `FORBIDDEN`. The data is unreachable.

### A worked example of the layering

Technician Jordan signs in and types `/dashboard` into the address bar.

1. Next.js loads the manager group layout (`app/(manager)/layout.tsx`).
2. `<RoleGate role="manager">` mounts. It reads Jordan's user doc, sees `role === "technician"`, and `router.replace("/schedule")`.
3. Even if Jordan disabled JS or patched the gate to render anyway, `<DashboardKpis>` would call `useQuery(api.quotes.counts)`. That function calls `requireManager(ctx)` and throws `FORBIDDEN`. No counts are returned.

No path through the system gives a technician manager-only data.

---

## Notifications

The spec allows notifications to be "simulated (DB or logs)". This implementation uses a real DB-backed feed with realtime delivery, because the cost over a logging stub was minimal once Convex's reactive query layer was already in place.

### Atomicity

Notifications are inserted *inside* the same mutation that triggers them — there is no worker, no queue, no cron. From `jobs.assign`:

```ts
const jobId = await ctx.db.insert("jobs", { … });
await ctx.db.patch(quoteId, { status: "scheduled" });
await ctx.db.insert("notifications", {
  recipientId: technicianId,
  kind: "job_assigned",
  jobId,
  message: `New job: ${quote.title}`,
});
return jobId;
```

The four writes commit atomically. There is no state where the job exists but the notification was lost, or the notification fired but the assignment didn't take. ACID transactions replace what would otherwise need an outbox table or an at-least-once message bus.

### Delivery

The bell badge subscribes to `notifications.unreadCountForCurrentUser`. The popover subscribes to `notifications.listForCurrentUser`. Convex tracks each subscription's read set; the moment `jobs.assign` commits, those subscriptions are invalidated and re-pushed over the WebSocket. Both update with no client-side polling and no manual invalidation.

### Toast bridge with watermark

`components/notifications/notification-toast-bridge.tsx` mounts once per authenticated layout. It re-uses the same reactive query and toasts each *newly arrived* notification:

```ts
useEffect(() => {
  if (notifications === undefined) return;
  if (watermarkRef.current === null) {
    // First resolve — set the watermark, don't toast historicals.
    watermarkRef.current = max(notifications.map(n => n._creationTime));
    return;
  }
  const fresh = notifications.filter(n => n._creationTime > watermarkRef.current);
  fresh.forEach(toast);
  watermarkRef.current = max(fresh.map(n => n._creationTime));
}, [notifications]);
```

Two annoyances this avoids:

1. Toasting every historical notification on page load.
2. Re-toasting the same notification when the user navigates between pages and the query re-resolves with the same data.

A `useRef` (not state) is used so the watermark survives re-renders without triggering them.

---

## End-to-end reactivity

A worked example of how a single write propagates without any explicit cache invalidation.

```
Manager A in Tab 1 clicks "Assign Jordan, Tue 14:00–16:00"
  │
  ▼
api.jobs.assign mutation runs server-side
  ├─ insert jobs row
  ├─ patch quotes row → status: "scheduled"
  └─ insert notifications row for Jordan
  │
  │ Convex tracks the new write set; checks every active subscription
  │ for read-set intersection
  ▼
Subscriptions invalidated:
  ├─ Tab 1 (Manager A):  api.quotes.list           → row moves to "Scheduled" tab
  ├─ Tab 1 (Manager A):  api.quotes.counts         → KPI updates
  ├─ Tab 2 (Manager B):  api.jobs.listForManager   → cross-tech calendar updates
  ├─ Jordan's browser:   api.jobs.listWithQuotes   → calendar event appears
  ├─ Jordan's browser:   api.notifications.unreadCountForCurrentUser → bell badge ticks
  └─ Jordan's browser:   api.notifications.listForCurrentUser
                                                   → popover row + Sonner toast
```

No `router.refresh()`. No SWR mutate. No hand-written invalidation. Each subscription is responsible for its own freshness, and Convex pushes the diff.

---

## AI-assisted development

### What I used

- **Cursor + Claude Opus** as the primary coding partner. Mostly for boilerplate, type plumbing, and "find me the right Convex pattern for X" questions.
- **Vercel React/Next.js best-practices skill** (`vercel-react-best-practices`). Used as a checklist while reviewing client/server boundaries, data fetching, and bundle composition. Concrete decisions traceable to it:
  - Server Components are the default. `"use client"` is only added when a file actually uses hooks, browser APIs, or interactive event handlers. Pages like `app/(manager)/quotes/page.tsx` stay server-rendered and only the interactive `<QuotesPageClient>` is client-side.
  - `react-big-calendar` is dynamically imported with `ssr: false` so the dashboard, quotes, and technicians pages never download its bundle or stylesheet.
  - `useMemo`/`useRef` are used only where they pay off (the calendar's query window, the toast bridge's high-water mark). I avoided memoising trivial values where the hook overhead isn't worth it.
  - Loading states use shaped Skeletons sized to the eventual content, not generic spinners, so layouts don't shift.
- **Convex skill packs** (`convex-create-component`, `convex-migration-helper`, `convex-performance-audit`, etc.) for project-specific conventions.

### AI Limitations

A few places where the first AI suggestion was wrong or weaker than the eventual choice:

- **Authentication.** The first design used server-side `auth()` + `fetchQuery(api.users.current)` in every layout. It worked but raced with Clerk's post-sign-in `router.refresh()`, leaving users stuck on the landing page until they pressed F5. Auth flow had to be written to the canonical Convex + Clerk pattern (`<Authenticated>` / `<Unauthenticated>` / `<AuthLoading>` boundaries plus a client-side `RoleGate`). Sign-in is now near-instant.
- **Two `users` tables.** The initial schema had separate `managers` and `technicians` tables to mirror the spec literally. After auditing the resulting code duplication and FK fragility I migrated to a single `users` table with a `role` field. See *Why one users table* above.
- **Verbose error handling.** The first version of every form's `catch` block had a five-branch type guard for ConvexError data shapes that the server never actually emits. I trimmed each catch to the shapes we genuinely throw — half the lines, same behaviour..

---

## Trade-offs & what's deferred

Things I deliberately *didn't* build, with the reasoning. Showing the cut line is more honest than pretending the project is feature-complete.


| Deferred                           | Why now                                                        | What I'd do for production                                                                               |
| ---------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Pagination on quotes/jobs          | Demo data fits in 100 rows; `take(100)` is honest about that   | Convex `paginate({ numItems, cursor })` on the listing queries                                           |
| Drag-to-reschedule on the calendar | `jobs.reschedule` mutation exists; no UI surface yet           | Wire up `react-big-calendar`'s `onEventDrop` to the mutation                                             |
| Manager UI for promote/demote      | `users.promoteToManager` exists as an internal mutation        | Admin-only page calling it; gate via a `role: "admin"` extension                                         |
| Soft deletes / audit trail         | Quotes are hard-deleted (only when unscheduled)                | Add `deletedAt`; route filtering through a helper instead of the schema                                  |
| Accessibility audit                | Keyboard-navigable, dialogs trap focus, but no formal axe pass | Run axe in CI; manual screen reader pass                                                                 |
| Tests                              | Skipped to focus engineering effort on the architecture & UX   | Convex function tests for `jobs.assign` (especially the OCC race), Playwright for the calendar drag flow |
|                                    |                                                                |                                                                                                          |


---

## Requirement → implementation map

Use this section to find the relevant code in a few seconds.

### Must Have


| Requirement                                                     | Where                                                                                                                  |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Data model — Managers, Technicians, Quotes, Jobs, Notifications | `convex/schema.ts`                                                                                                     |
| A Job belongs to a Technician, Quote, and Manager               | `convex/schema.ts` (jobs table FKs); enforced in `convex/jobs.ts:assign`                                               |
| View unscheduled quotes                                         | `app/(manager)/quotes/page.tsx` → `components/quotes/quotes-page-client.tsx` ("Unscheduled" tab)                       |
| Assign quote to technician                                      | `components/forms/assign-job-form.tsx` → `convex/jobs.ts:assign`                                                       |
| Select a 2-hour time window                                     | `components/forms/assign-job-form.tsx` (default duration seeded from quote.estimatedHours, snapped to 0.5/1/2/4/6/8 h) |
| **Conflict prevention enforced on backend**                     | `convex/jobs.ts:findOverlappingJob` + `convex/jobs.ts:assign` + `convex/lib/intervals.ts:overlaps`                     |
| Job lifecycle: scheduled → completed                            | `convex/schema.ts` (jobs.status union); `convex/jobs.ts:complete`                                                      |
| Technician marks job complete                                   | `components/technician/job-detail-dialog.tsx` → `convex/jobs.ts:complete` (gated by `requireTechnician`)               |
| Notify technician on assign / update                            | `convex/jobs.ts:assign` + `convex/jobs.ts:reschedule` (atomic notification insert)                                     |
| Notify manager on completion                                    | `convex/jobs.ts:complete`                                                                                              |


### Optional Extensions


| Extension                        | Where                                                                                                                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Technician schedule UI           | `components/technician/schedule-calendar.tsx` (week / day / agenda views, react-big-calendar)                                                                           |
| **Concurrency handling**         | Serializable OCC with read-set narrowing — see *Conflict prevention* above; `convex/jobs.ts`                                                                            |
| Improved UX                      | Conflict toast with the exact busy window; bell badge with single-shot CSS shake on each new arrival; reactive everything; deep-linkable "new quote" sheet via `?new=1` |
| Event-driven notification design | Notifications are committed atomically with the triggering mutation; reactive subscriptions push to bell, popover, and toast bridge — no polling, no separate event bus |


---

