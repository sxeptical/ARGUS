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
    // Generated maplibre-gl v6 worker bundles (scripts/copy-maplibre-worker.mjs).
    "public/maplibre/**",
    // Local agent-tool scratch space; already in .gitignore, but ESLint
    // does not read .gitignore and fails `bun run lint` on these temp files.
    ".ua/**",
    // OpenNext / Wrangler build output.
    ".open-next/**",
    ".wrangler/**",
  ]),
]);

export default eslintConfig;
