import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalStorage } from "../src/modules/storage/service.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("LocalStorage", () => {
  it("writes below its root and rejects traversal", async () => {
    const root = await mkdtemp(join(tmpdir(), "smart-grocery-storage-"));
    directories.push(root);
    const storage = new LocalStorage(root);

    const saved = await storage.writeFile({
      scope: "flyers",
      filename: "sample.pdf",
      mimeType: "application/pdf",
      body: Buffer.from("pdf"),
    });

    expect(saved.relativePath).toMatch(/^flyers\//);
    expect(saved.sha256).toHaveLength(64);
    await expect(storage.readFile("../../secret")).rejects.toMatchObject({ code: "INVALID_PATH" });
  });
});
