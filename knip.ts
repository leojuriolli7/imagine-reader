/** CLI entry points are discovered from scripts normally, but must be explicit in production analysis. */
export default function configuration({ production }: { production?: boolean }) {
  return {
    workspaces: {
      ".": {
        entry: ["scripts/*.mjs!", "vitest*.config.ts"],
        project: ["scripts/*.mjs!", "*.ts"],
        ignoreDependencies: ["react-pdf"],
      },
      "apps/web": {},
      "apps/worker": {},
      "packages/server": {
        entry: production
          ? ["src/main/check-env.ts!", "src/main/check-storage.ts!", "src/main/migrate.ts!"]
          : [],
        project: ["src/**/*.ts!", "tests/**/*.ts"],
        includeEntryExports: true,
      },
      "packages/contracts": {
        includeEntryExports: true,
      },
      "packages/ui": {
        includeEntryExports: true,
      },
      "packages/local-observability": { entry: production ? ["src/inspect.ts!"] : [] },
      "packages/typescript-config": {
        ignoreUnresolved: ["next"],
      },
    },
  };
}
