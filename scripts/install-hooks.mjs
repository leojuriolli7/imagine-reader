import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

// Release archives have no Git metadata; hook installation only applies to checkouts.
if (existsSync(new URL("../.git", import.meta.url))) {
  execFileSync("git", ["config", "--local", "core.hooksPath", ".githooks"], {
    cwd: new URL("..", import.meta.url),
    stdio: "inherit",
  });
}
