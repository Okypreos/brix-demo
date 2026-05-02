"use node";

import { createClerkClient } from "@clerk/backend";
import { ConvexError, v } from "convex/values";
import { internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";

// Demo seeder orchestrator. Run from the repo root with:
//   npx convex run seedAction:run
//
// Idempotent. Each step looks up existing rows by a stable key (Clerk
// email / quote title / quote id) before inserting.
//
// "use node" because @clerk/backend uses Node APIs that aren't in
// Convex's default V8 isolate.
//
// Required env vars (set via `npx convex env set ...`):
//   CLERK_SECRET_KEY        — Clerk Backend SDK key
//   CLERK_FRONTEND_API_URL  — also used by the webhook handler
//   DEMO_USER_PASSWORD      — password for every seeded demo user.
//                             Communicated to reviewers out-of-band.

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
    email: "manager.morgan@example.com",
    firstName: "Morgan",
    lastName: "Lee",
    role: "manager",
  },
  {
    email: "manager.casey@example.com",
    firstName: "Casey",
    lastName: "Brooks",
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

// Demo job assignments. Offsets are relative to "now" at seed time, so
// a fresh seed always shows yesterday's completed work + this week's
// upcoming jobs.
//
// `quoteIdx` and `techIdx` are indices into DEMO_QUOTES and the
// technicians-only sub-list of DEMO_USERS. Raw indices keep the table
// compact and prevent typo drift.
const DEMO_JOBS: Array<{
  quoteIdx: number;
  techIdx: number;
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
  handler: async (ctx): Promise<{
    users: Array<{
      email: string;
      clerkId: string;
      role: "manager" | "technician";
      wasCreated: boolean;
      emailVerified: boolean;
    }>;
    quotes: { created: number; skipped: number };
    jobs: { created: number; skipped: number };
  }> => {
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
          "Run `npx convex env set DEMO_USER_PASSWORD <password>` first.",
      );
    }
    const clerk = createClerkClient({ secretKey });

    // Step 1 — create-or-fetch each Clerk user.
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
          // Skip leaked-password heuristics — this is a demo account.
          skipPasswordChecks: true,
          skipPasswordRequirement: false,
        });
        wasCreated = true;
      }

      // Step 1.5 — mark the primary email as verified.
      //
      // Backend API doesn't auto-verify on creation (production flows
      // verify via email link). For demo addresses (@example.com, no
      // real inbox) we flip verified=true so sign-in works.
      // Idempotent: only updates if not already verified.
      let emailVerified = true;
      for (const ea of clerkUser.emailAddresses) {
        if (ea.verification?.status !== "verified") {
          await clerk.emailAddresses.updateEmailAddress(ea.id, {
            verified: true,
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

    // Step 2 — wait for each Clerk user to be mirrored into Convex by
    // the user.created webhook. Times out with a clear message if the
    // webhook isn't configured or is pointed at a stale tunnel.
    for (const u of userResults) {
      const startedAt = Date.now();
      const TIMEOUT_MS = 10_000;
      const POLL_MS = 250;
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

    // Step 3 — promote managers. We promote every role=manager user so
    // each manager account can sign in, but record the FIRST one as
    // the canonical seeder of quotes and jobs. Keeps re-seeded data
    // attributed to the same user across runs.
    let managerClerkId: string | null = null;
    for (const u of userResults) {
      if (u.role !== "manager") continue;
      await ctx.runMutation(internal.users.promoteToManager, {
        clerkId: u.clerkId,
      });
      if (managerClerkId === null) {
        managerClerkId = u.clerkId;
      }
    }
    if (!managerClerkId) {
      throw new ConvexError(
        "No manager defined in DEMO_USERS — at least one user with " +
          "role=manager is required for seeding quotes.",
      );
    }

    // Step 4 — seed quotes.
    //
    // The explicit return type annotation breaks a TS inference cycle
    // between `run`'s return type and `internal.seed.*` references.
    const quoteRes: {
      created: number;
      skipped: number;
      quoteIds: string[];
    } = await ctx.runMutation(internal.seed.seedDemoQuotes, {
      managerClerkId,
      quotes: DEMO_QUOTES,
    });

    // Step 5 — seed jobs.
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

    const jobRes: { created: number; skipped: number } = await ctx.runMutation(
      internal.seed.seedDemoJobs,
      {
        managerClerkId,
        now: Date.now(),
        jobs: jobInputs,
      },
    );

    return {
      users: userResults,
      quotes: { created: quoteRes.created, skipped: quoteRes.skipped },
      jobs: { created: jobRes.created, skipped: jobRes.skipped },
    };
  },
});
