import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    exclude: ["**/*.integration.test.ts", "**/node_modules/**"],
    coverage: { provider: "v8", include: ["packages/server/src/**/*.ts", "apps/web/lib/*.ts"] },
  },
});
