"use node";

import { createClerkClient } from "@clerk/backend";
import { ConvexError, v } from "convex/values";
import { internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";

/**
 * Demo seeder orchestrator.
 *
 * Run from the repo root with:
 *
 *   npx convex run seedAction:run
 *
 * Idempotent: it can be run multiple times against the same deployment
 * without producing duplicate users, quotes, or jobs. Each step looks
 * up existing rows by a stable key (Clerk email / quote title / quote
 * id) before inserting.
 *
 * Why a Node-runtime action?
 *
 * - `@clerk/backend` uses Node APIs that aren't available in Convex's
 *   default V8 isolate, so this file is pinned to "use node".
 * - Internal actions can call internal mutations via `ctx.runMutation`
 *   without any auth setup, so we keep the entire seed inside Convex
 *   (no `scripts/` orchestrator needed).
 * - `CLERK_SECRET_KEY` lives only in Convex's env vars, never in the
 *   browser bundle.
 *
 * Required Convex env vars:
 *   CLERK_SECRET_KEY        — set with `npx convex env set CLERK_SECRET_KEY sk_test_...`
 *   CLERK_FRONTEND_API_URL  — already required by the webhook handler
 *   DEMO_USER_PASSWORD      — password assigned to every seeded demo user.
 *                             Kept out of the repo so this file can stay
 *                             public; you communicate it to reviewers
 *                             out-of-band (e.g. by email) along with the
 *                             demo email addresses.
 */

// -----------------------------------------------------------------------
// Demo data definitions. Edit these to change what the demo looks like.
// -----------------------------------------------------------------------

type SeedUser = {
  email: string;
  firstName: string;
  lastName: string;
  role: "manager" | "technician";
};

const DEMO_USERS: SeedUser[] = [
  {
    email: "manager.alex@example.com",
    firstName: "Alex",
    lastName: "Manager",
    role: "manager",
  },
  {
    email: "tech.jordan@example.com",
    firstName: "Jordan",
    lastName: "Rivera",
    role: "technician",
  },
  {
    email: "tech.sam@example.com",
    firstName: "Sam",
    lastName: "Okafor",
    role: "technician",
  },
  {
    email: "tech.priya@example.com",
    firstName: "Priya",
    lastName: "Patel",
    role: "technician",
  },
];

const DEMO_QUOTES = [
  {
    title: "Replace kitchen sink",
    description:
      "Customer reports persistent leak from drain. Replace sink + P-trap; flush line; pressure-test before leaving.",
    customerName: "Eleanor Chen",
    customerAddress: "412 Oak Street, Apt 3B",
    estimatedHours: 2,
  },
  {
    title: "Bathroom faucet repair",
    description:
      "Hot water handle stripped — replace cartridge and inspect supply lines for corrosion.",
    customerName: "Marcus Reeves",
    customerAddress: "88 Linden Ave",
    estimatedHours: 1.5,
  },
  {
    title: "Install ceiling fan",
    description:
      "Customer-supplied 52\" fan with light kit. Existing junction box rated for fan support — verify, install, balance, test all speeds.",
    customerName: "Dana Kowalski",
    customerAddress: "1701 Birch Lane",
    estimatedHours: 2,
  },
  {
    title: "Diagnose intermittent breaker trip",
    description:
      "Master bedroom outlet circuit trips ~once per day. Inspect panel, test loads, identify and remediate root cause.",
    customerName: "Theo Bautista",
    customerAddress: "23 Hillcrest Dr",
    estimatedHours: 3,
  },
  {
    title: "Replace water heater anode rod",
    description:
      "8-year-old 50gal tank — preventive anode swap. Drain partial, swap rod, refill, verify recovery time.",
    customerName: "Isabella Romero",
    customerAddress: "905 Crescent Way",
    estimatedHours: 1.5,
  },
  {
    title: "Repair garage door opener",
    description:
      "Door reverses 4ft up. Likely safety sensor misalignment or worn travel limit. Diagnose and repair.",
    customerName: "Henrik Olsson",
    customerAddress: "62 Pinewood Ct",
    estimatedHours: 1,
  },
];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Demo job assignments. Offsets are relative to "now" at seed time, so
 * a fresh seed always shows yesterday's completed work + this week's
 * upcoming jobs.
 *
 * Indices into DEMO_QUOTES + DEMO_USERS (technicians only). Keeping
 * raw indices instead of titles/emails keeps the table compact and
 * prevents typo drift.
 */
const DEMO_JOBS: Array<{
  quoteIdx: number;
  techIdx: number; // 0-based into the technicians-only sub-list
  startOffsetMs: number;
  durationMs: number;
  complete?: boolean;
}> = [
  // Yesterday: Jordan completed the bathroom faucet
  {
    quoteIdx: 1,
    techIdx: 0,
    startOffsetMs: -1 * DAY_MS - 4 * HOUR_MS,
    durationMs: 1.5 * HOUR_MS,
    complete: true,
  },
  // Tomorrow morning: Sam installs the ceiling fan
  {
    quoteIdx: 2,
    techIdx: 1,
    startOffsetMs: 1 * DAY_MS + 1 * HOUR_MS,
    durationMs: 2 * HOUR_MS,
  },
  // Day after tomorrow: Priya does the breaker diagnosis
  {
    quoteIdx: 3,
    techIdx: 2,
    startOffsetMs: 2 * DAY_MS + 2 * HOUR_MS,
    durationMs: 3 * HOUR_MS,
  },
];

// -----------------------------------------------------------------------
// Action
// -----------------------------------------------------------------------

export const run = internalAction({
  args: {},
  returns: v.object({
    users: v.array(
      v.object({
        email: v.string(),
        clerkId: v.string(),
        role: v.union(v.literal("manager"), v.literal("technician")),
        wasCreated: v.boolean(),
        emailVerified: v.boolean(),
      }),
    ),
    quotes: v.object({ created: v.number(), skipped: v.number() }),
    jobs: v.object({ created: v.number(), skipped: v.number() }),
  }),
  handler: async (ctx) => {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      throw new ConvexError(
        "CLERK_SECRET_KEY is not set on this Convex deployment. " +
          "Run `npx convex env set CLERK_SECRET_KEY sk_test_...` first.",
      );
    }
    const demoPassword = process.env.DEMO_USER_PASSWORD;
    if (!demoPassword) {
      throw new ConvexError(
        "DEMO_USER_PASSWORD is not set on this Convex deployment. " +
          "Run `npx convex env set DEMO_USER_PASSWORD <password>` first. " +
          "The password must satisfy your Clerk instance's password policy " +
          "(or contain enough entropy that skipPasswordChecks lets it through).",
      );
    }
    const clerk = createClerkClient({ secretKey });

    // ---------------------------------------------------------------
    // Step 1 — create-or-fetch each Clerk user.
    // ---------------------------------------------------------------
    const userResults: Array<{
      email: string;
      clerkId: string;
      role: "manager" | "technician";
      wasCreated: boolean;
      emailVerified: boolean;
    }> = [];

    for (const u of DEMO_USERS) {
      const existing = await clerk.users.getUserList({
        emailAddress: [u.email],
        limit: 1,
      });

      // We need the full User object (with `emailAddresses` populated)
      // for the verification pass below, regardless of whether we
      // created or fetched it. `getUserList` already returns full
      // User objects, so no follow-up fetch is needed.
      let clerkUser;
      let wasCreated = false;
      if (existing.data.length > 0) {
        clerkUser = existing.data[0];
      } else {
        clerkUser = await clerk.users.createUser({
          emailAddress: [u.email],
          password: demoPassword,
          firstName: u.firstName,
          lastName: u.lastName,
          // Allow a deliberately well-known shared password through
          // Clerk's leaked-password heuristics — this is a demo
          // account, not a real user.
          skipPasswordChecks: true,
          skipPasswordRequirement: false,
        });
        wasCreated = true;
      }

      // -------------------------------------------------------------
      // Step 1.5 — mark the primary email as verified.
      //
      // The Backend API doesn't auto-verify the email when creating
      // a user with a password (this is by design — production flows
      // verify via email link/code). For a demo seed where we own
      // the addresses (`@example.com`, no real inbox), we flip
      // `verified: true` administratively. Otherwise sign-in routes
      // every demo reviewer through Clerk's email-verification flow,
      // which never completes.
      //
      // Idempotent: we only call updateEmailAddress if the email
      // isn't already verified, so re-runs are essentially free.
      // -------------------------------------------------------------
      let emailVerified = true;
      for (const ea of clerkUser.emailAddresses) {
        if (ea.verification?.status !== "verified") {
          await clerk.emailAddresses.updateEmailAddress(ea.id, {
            verified: true,
            // Make sure the address we just created is also primary
            // (it will already be on freshly-created users, but
            // re-running on an instance that somehow lost the
            // primary flag will heal itself).
            primary: ea.id === clerkUser.primaryEmailAddressId,
          });
          emailVerified = true;
        }
      }

      userResults.push({
        email: u.email,
        clerkId: clerkUser.id,
        role: u.role,
        wasCreated,
        emailVerified,
      });
    }

    // ---------------------------------------------------------------
    // Step 2 — wait for each Clerk user to be mirrored into Convex by
    // the user.created webhook. We poll the byClerkId query for each.
    //
    // If you've never set up the webhook (or it's pointed at a stale
    // tunnel), this loop will time out with a clear message.
    // ---------------------------------------------------------------
    for (const u of userResults) {
      const startedAt = Date.now();
      const TIMEOUT_MS = 10_000;
      const POLL_MS = 250;
      // Loop runs in a Node action; ctx.runQuery is awaited each iter
      // so the schedule is well-behaved (no busy-spin).
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const found = await ctx.runQuery(api.users.byClerkId, {
          clerkId: u.clerkId,
        });
        if (found) break;
        if (Date.now() - startedAt > TIMEOUT_MS) {
          throw new ConvexError(
            `Timed out waiting for Clerk user ${u.email} (${u.clerkId}) ` +
              `to be mirrored into Convex via webhook. ` +
              `Verify the user.created webhook is configured to hit ` +
              `${process.env.CONVEX_SITE_URL ?? "<convex-site-url>"}/clerk-users-webhook ` +
              `and that the Convex env var CLERK_WEBHOOK_SECRET matches the dashboard secret.`,
          );
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
    }

    // ---------------------------------------------------------------
    // Step 3 — promote managers. Idempotent.
    // ---------------------------------------------------------------
    let managerClerkId: string | null = null;
    for (const u of userResults) {
      if (u.role !== "manager") continue;
      await ctx.runMutation(internal.users.promoteToManager, {
        clerkId: u.clerkId,
      });
      managerClerkId = u.clerkId;
    }
    if (!managerClerkId) {
      throw new ConvexError(
        "No manager defined in DEMO_USERS — at least one user with " +
          "role=manager is required for seeding quotes.",
      );
    }

    // ---------------------------------------------------------------
    // Step 4 — seed quotes.
    // ---------------------------------------------------------------
    const quoteRes = await ctx.runMutation(internal.seed.seedDemoQuotes, {
      managerClerkId,
      quotes: DEMO_QUOTES,
    });

    // ---------------------------------------------------------------
    // Step 5 — seed jobs.
    // ---------------------------------------------------------------
    const technicianClerkIds = userResults
      .filter((u) => u.role === "technician")
      .map((u) => u.clerkId);

    const jobInputs = DEMO_JOBS.map((j) => {
      const quote = DEMO_QUOTES[j.quoteIdx];
      const techClerkId = technicianClerkIds[j.techIdx];
      if (!quote || !techClerkId) {
        throw new ConvexError(
          `DEMO_JOBS entry references missing quote or technician ` +
            `(quoteIdx=${j.quoteIdx}, techIdx=${j.techIdx}).`,
        );
      }
      return {
        quoteTitle: quote.title,
        technicianClerkId: techClerkId,
        startOffsetMs: j.startOffsetMs,
        durationMs: j.durationMs,
        complete: j.complete,
      };
    });

    const jobRes = await ctx.runMutation(internal.seed.seedDemoJobs, {
      managerClerkId,
      now: Date.now(),
      jobs: jobInputs,
    });

    return {
      users: userResults,
      quotes: { created: quoteRes.created, skipped: quoteRes.skipped },
      jobs: { created: jobRes.created, skipped: jobRes.skipped },
    };
  },
});
