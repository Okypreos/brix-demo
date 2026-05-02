import { httpRouter } from "convex/server";
import type { WebhookEvent } from "@clerk/backend";
import { Webhook } from "svix";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
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
        // Clerk's type allows undefined here, but in practice it's
        // always populated for user.deleted.
        const clerkId = event.data.id;
        if (clerkId) {
          await ctx.runMutation(internal.users.deleteFromClerk, { clerkId });
        }
        break;
      }
      default:
        console.log("Ignored Clerk webhook event:", event.type);
    }

    return new Response(null, { status: 200 });
  }),
});

// Verifies the request was signed by Clerk. 
async function validateRequest(req: Request): Promise<WebhookEvent | null> {
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
