// Tells Convex to accept JWTs from our Clerk instance. Without this,
// `ctx.auth.getUserIdentity()` always returns null.
//
// `domain` must be set on the Convex deployment via:
//   npx convex env set CLERK_FRONTEND_API_URL <url>
const authConfig = {
  providers: [
    {
      domain: process.env.CLERK_FRONTEND_API_URL!,
      applicationID: "convex",
    },
  ],
};

export default authConfig;
