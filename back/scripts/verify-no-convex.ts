import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = process.cwd();
const forbidden = ["convex/react", "convex/browser", "convex/server", "@convex-dev/auth", "NEXT_PUBLIC_CONVEX_URL", "CONVEX_URL"];
const ignored = new Set(["node_modules", ".git", "generated", "dist", ".next"]);
const allowedDocs = new Set(["docs/convex-removal-inventory.md"]);
const hits: string[] = [];

async function walk(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { await walk(path); continue; }
    if (!entry.isFile()) continue;
    const file = relative(root, path);
    if (file === "scripts/verify-no-convex.ts" || allowedDocs.has(file) || file.startsWith("docs/")) continue;
    const content = await readFile(path, "utf8").catch(() => "");
    for (const token of forbidden) if (content.includes(token)) hits.push(`${file}: ${token}`);
  }
}

await walk(root);
if (hits.length) {
  console.error("Forbidden Convex references found:\n" + hits.join("\n"));
  process.exit(1);
}
console.log("No forbidden Convex runtime references found.");
