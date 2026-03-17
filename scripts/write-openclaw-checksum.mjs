import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const cwd = process.cwd();
const files = await readdir(cwd);
const archives = files.filter((name) => name.endsWith(".tgz"));

if (archives.length === 0) {
  throw new Error("No .tgz archive found in repository root. Run `npm run pack:openclaw` first.");
}

const archiveWithTimes = await Promise.all(
  archives.map(async (name) => ({
    mtimeMs: (await stat(path.join(cwd, name))).mtimeMs,
    name
  }))
);

archiveWithTimes.sort((left, right) => right.mtimeMs - left.mtimeMs || left.name.localeCompare(right.name));
const archive = archiveWithTimes[0]?.name;

const archivePath = path.join(cwd, archive);
const hash = createHash("sha256").update(await readFile(archivePath)).digest("hex");
await writeFile(`${archivePath}.sha256`, `${hash}  ${archive}\n`, "utf8");
console.log(`${archivePath}.sha256`);
