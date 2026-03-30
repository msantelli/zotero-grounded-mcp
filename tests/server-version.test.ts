import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { serverVersion } from "../src/server-version.js";

describe("server version", () => {
  it("matches package.json", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8")
    ) as { version: string };

    expect(serverVersion).toBe(pkg.version);
  });
});
