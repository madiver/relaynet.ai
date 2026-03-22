import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as esbuild from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, "dist");

await fs.mkdir(distDir, { recursive: true });

await esbuild.build({
  entryPoints: [path.join(__dirname, "index.ts")],
  outfile: path.join(distDir, "index.js"),
  bundle: true,
  format: "esm",
  legalComments: "none",
  packages: "bundle",
  platform: "node",
  sourcemap: false,
  target: "node20"
});

await fs.copyFile(path.join(__dirname, "prompt-profile.json"), path.join(distDir, "prompt-profile.json"));
