import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { PictoryFileUsageLedgerStore } from "../server/pictoryFileUsageStore";
import { createNewUsageAccount } from "../server/pictoryUsageLedger";

let tempDir: string | undefined;

describe("PictoryFileUsageLedgerStore", () => {
  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("persists usage accounts without storing image payloads", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "pictory-ledger-"));
    const filePath = join(tempDir, "ledger.json");
    const store = new PictoryFileUsageLedgerStore(filePath);
    const account = {
      ...createNewUsageAccount("user-1", "plus"),
      monthlyServerAiUsed: 7,
      serverAiCredits: 120,
    };

    await store.writeAccount(account);

    expect(await store.readAccount("user-1")).toMatchObject({
      subjectId: "user-1",
      monthlyServerAiUsed: 7,
      serverAiCredits: 120,
    });
    expect(await store.readAccount("missing")).toBeNull();
    const raw = await readFile(filePath, "utf8");
    expect(raw).not.toContain("imageDataUri");
    expect(raw).not.toContain("data:image/");
  });

  it("treats missing ledger files as an empty account store", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "pictory-ledger-"));
    const store = new PictoryFileUsageLedgerStore(
      join(tempDir, "missing.json"),
    );

    await expect(store.readAccount("user-1")).resolves.toBeNull();
  });

  it("deletes only the requested usage account", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "pictory-ledger-"));
    const filePath = join(tempDir, "ledger.json");
    const store = new PictoryFileUsageLedgerStore(filePath);
    await store.writeAccount(createNewUsageAccount("user-1", "plus"));
    await store.writeAccount(createNewUsageAccount("user-2", "free"));

    await expect(store.deleteAccount("user-1")).resolves.toBe(true);
    await expect(store.deleteAccount("missing")).resolves.toBe(false);

    expect(await store.readAccount("user-1")).toBeNull();
    expect(await store.readAccount("user-2")).toMatchObject({
      subjectId: "user-2",
    });
    expect(await readFile(filePath, "utf8")).not.toContain("user-1");
  });
});
