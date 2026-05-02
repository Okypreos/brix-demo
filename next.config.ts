import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin Turbopack's project root explicitly.
  //
  // Turbopack auto-detects the project root by walking up from the
  // working directory until it finds a recognised lockfile
  // (package-lock.json, pnpm-lock.yaml, yarn.lock, bun.lock[b]). On this
  // machine the project lives under `%USERPROFILE%\OneDrive\Desktop\…`
  // (Windows Known-Folder redirection — not an actively-syncing OneDrive
  // folder), and Turbopack's auto-detection overshoots the project
  // directory. The symptom is:
  //
  //   Error: Can't resolve 'tailwindcss' in 'C:\Users\giorg\OneDrive\Desktop'
  //
  // because Turbopack tries to resolve `@import "tailwindcss"` from
  // `app/globals.css` against a root one level above `node_modules`.
  //
  // We pin the root using `process.cwd()` rather than `__dirname` /
  // `import.meta.url` because Next.js's TypeScript config loader is
  // sensitive to which module flavour `next.config.ts` ends up emitting:
  // touching `import.meta.url` flips the loader into ESM mode, which
  // then fails with `ReferenceError: exports is not defined in ES module
  // scope` when the bootstrapper still treats the compiled file as CJS.
  // `process.cwd()` is the directory from which `next` was invoked,
  // which `npm run dev` / `npm run build` always normalise to the
  // project root (the dir containing `package.json`). See:
  // node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/turbopack.md
  // (the "Root directory" example).
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
