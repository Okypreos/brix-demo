/**
 * Convex auth configuration.
 *
 * Tells the Convex backend to accept JWTs issued by our Clerk instance.
 * Without this file `ctx.auth.getUserIdentity()` always returns null,
 * even if the client has a valid Clerk session.
 *
 * - `domain` is the Clerk Frontend API URL (shown in Clerk's dashboard
 *   under the Convex integration). Convex fetches
 *   `${domain}/.well-known/openid-configuration` to discover the JWKS
 *   endpoint and validate token signatures.
 * - `applicationID` must match the JWT `aud` claim. Clerk's built-in
 *   "Convex" integration sets this to "convex" automatically.
 *
 * The env var must be set on the Convex deployment (not just `.env.local`)
 * via `npx convex env set CLERK_FRONTEND_API_URL <url>`, because Convex
 * functions run in a separate runtime that doesn't share the Next.js env.
 */
const authConfig = {
  providers: [
    {
      domain: process.env.CLERK_FRONTEND_API_URL!,
      applicationID: "convex",
    },
  ],
};

export default authConfig;
