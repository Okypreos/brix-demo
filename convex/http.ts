import { httpRouter } from "convex/server";
import type { WebhookEvent } from "@clerk/backend";
import { Webhook } from "svix";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Convex HTTP routes.
 *
 * HTTP actions are exposed at `https://<deployment>.convex.site/<path>`
 * (note: `.site`, not `.cloud`). For our dev deployment that's
 * `https://lovely-mongoose-282.convex.site/clerk-users-webhook`.
 *
 * The single route here is the Clerk → Convex sync webhook. Setting up:
 *
 * 1. Clerk dashboard -> Webhooks -> Add Endpoint
 *    - URL:       <site-url>/clerk-users-webhook
 *    - Events:    user.created, user.updated, user.deleted
 *    (or just "user" to subscribe to all user.* events)
 * 2. Copy the signing secret (starts with `whsec_`).
 * 3. Set it on the Convex deployment:
 *      npx convex env set CLERK_WEBHOOK_SECRET <secret>
 *
 * See https://docs.convex.dev/auth/database-auth#set-up-webhooks
 */
const http = httpRouter();

http.route({
  path: "/clerk-users-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const event = await validateRequest(request);
    if (!event) {
      return new Response("Invalid signature", { status: 400 });
    }

    switch (event.type) {
      case "user.created":
      case "user.updated":
        await ctx.runMutation(internal.users.upsertFromClerk, {
          data: event.data,
        });
        break;
      case "user.deleted": {
        // Clerk's type allows `id` to be undefined here, but in practice
        // it's always populated for user.deleted events.
        const clerkId = event.data.id;
        if (clerkId) {
          await ctx.runMutation(internal.users.deleteFromClerk, { clerkId });
        }
        break;
      }
      default:
        // Other Clerk event types (organization.*, session.*, etc.) are
        // ignored. Logging at info level so it's visible in the Convex
        // dashboard's function logs without flagging as an error.
        console.log("Ignored Clerk webhook event:", event.type);
    }

    return new Response(null, { status: 200 });
  }),
});

/**
 * Verifies the incoming request was signed by Clerk and parses the
 * payload into a typed WebhookEvent. Returns null if verification fails;
 * the caller responds 400 in that case so Clerk's Svix client retries.
 */
async function validateRequest(req: Request): Promise<WebhookEvent | null> {
  // svix.verify needs the raw body string (not parsed JSON) because the
  // signature is computed over the bytes.
  const payload = await req.text();
  const headers = {
    "svix-id": req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  };

  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error(
      "CLERK_WEBHOOK_SECRET is not set on the Convex deployment. " +
        "Run: npx convex env set CLERK_WEBHOOK_SECRET <secret>",
    );
    return null;
  }

  try {
    const wh = new Webhook(secret);
    return wh.verify(payload, headers) as unknown as WebhookEvent;
  } catch (error) {
    console.error("Webhook signature verification failed:", error);
    return null;
  }
}

export default http;
