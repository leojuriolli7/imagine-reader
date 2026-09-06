import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

if (!existsSync(".env")) {
  const content = readFileSync(".env.example", "utf8").replace(
    "replace-with-a-random-secret-at-least-32-characters",
    randomBytes(32).toString("hex"),
  );
  writeFileSync(".env", content, { mode: 0o600 });
}
console.log("Local environment ready.");
