/**
 * Clerk auth proxy for Next.js 16.
 *
 * In Next.js 16 the legacy `middleware.ts` file convention was renamed
 * to `proxy.ts` to better reflect its role as a request boundary. The
 * Clerk SDK's `clerkMiddleware()` helper continues to work unchanged;
 * only the file name and exported function name change.
 *
 * See:
 * - https://nextjs.org/docs/messages/middleware-to-proxy
 * - https://clerk.com/docs/reference/nextjs/clerk-middleware
 */
import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and all static files unless found in search
    // params. Run on every other route.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
