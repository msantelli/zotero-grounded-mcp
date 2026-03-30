import { readFileSync } from "node:fs";

interface PackageJsonShape {
  version?: string;
}

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
) as PackageJsonShape;

export const serverVersion = packageJson.version ?? "0.0.0";
