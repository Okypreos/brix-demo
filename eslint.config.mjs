import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Reference repos used for research only.
    "clones/**",
    // Convex codegen — owned by `npx convex dev`, not us. Convex ships
    // its own `eslint-disable` directives that newer ESLint flags as
    // unused; ignoring the folder is the cleanest fix.
    "convex/_generated/**",
  ]),
]);

export default eslintConfig;
