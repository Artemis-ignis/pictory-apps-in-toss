import { describe, expect, it, vi } from "vitest";
import { createPictoryAccountHttpHandler } from "../server/pictoryAccountHttpAdapter";
import {
  createNewUsageAccount,
  type PictoryUsageAccount,
  type PictoryUsageLedgerStore,
} from "../server/pictoryUsageLedger";

describe("pictoryAccountHttpAdapter", () => {
  it("deletes a server-authenticated usage account", async () => {
    const store = createMemoryStore(createNewUsageAccount("user-1", "plus"));
    const handler = createPictoryAccountHttpHandler({
      store,
      env: { PICTORY_SERVER_SECRET: "server-secret" },
    });

    const response = await handler({
      method: "DELETE",
      headers: {
        "x-pictory-server-secret": "server-secret",
        "x-pictory-subject-id": "user-1",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers["Cache-Control"]).toBe("no-store");
    expect(JSON.parse(response.body)).toMatchObject({
      subjectId: "user-1",
      deleted: true,
    });
    expect(await store.readAccount("user-1")).toBeNull();
  });

  it("reports missing accounts without recreating them", async () => {
    const store = createMemoryStore();
    const handler = createPictoryAccountHttpHandler({
      store,
      env: { PICTORY_SERVER_SECRET: "server-secret" },
    });

    const response = await handler({
      method: "DELETE",
      headers: {
        "x-pictory-server-secret": "server-secret",
        "x-pictory-subject-id": "missing-user",
      },
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      subjectId: "missing-user",
      deleted: false,
    });
  });

  it("rejects unauthenticated deletes", async () => {
    const handler = createPictoryAccountHttpHandler({
      store: createMemoryStore(createNewUsageAccount("user-1", "plus")),
      env: { PICTORY_SERVER_SECRET: "server-secret" },
    });

    const response = await handler({
      method: "DELETE",
      headers: { "x-pictory-subject-id": "user-1" },
    });

    expect(response.status).toBe(401);
    expect(JSON.parse(response.body).error.code).toBe("unauthorized");
  });

  it("supports injected auth resolver and CORS preflight", async () => {
    const store = createMemoryStore(createNewUsageAccount("auth-user", "plus"));
    const handler = createPictoryAccountHttpHandler({
      store,
      corsOrigin: "https://pictory.example.com",
      resolveSubjectId: vi.fn(async (context) =>
        context.headers.authorization === "Bearer session-token"
          ? "auth-user"
          : null,
      ),
    });

    const preflight = await handler({ method: "OPTIONS" });
    const response = await handler({
      method: "DELETE",
      headers: { Authorization: "Bearer session-token" },
    });

    expect(preflight.status).toBe(204);
    expect(preflight.headers["Access-Control-Allow-Methods"]).toContain(
      "DELETE",
    );
    expect(response.status).toBe(200);
    expect(await store.readAccount("auth-user")).toBeNull();
  });

  it("returns 501 when the store cannot delete accounts", async () => {
    const handler = createPictoryAccountHttpHandler({
      store: {
        readAccount: async () => createNewUsageAccount("user-1", "plus"),
        writeAccount: async () => undefined,
      },
      resolveSubjectId: vi.fn(async () => "user-1"),
    });

    const response = await handler({ method: "DELETE" });

    expect(response.status).toBe(501);
    expect(JSON.parse(response.body).error.code).toBe("delete_not_supported");
  });

  it("rejects non-DELETE methods", async () => {
    const handler = createPictoryAccountHttpHandler({
      store: createMemoryStore(),
      resolveSubjectId: vi.fn(async () => "user-1"),
    });

    const response = await handler({ method: "POST" });

    expect(response.status).toBe(405);
    expect(JSON.parse(response.body).error.code).toBe("method_not_allowed");
  });
});

function createMemoryStore(
  initialAccount?: PictoryUsageAccount,
): PictoryUsageLedgerStore {
  const accounts = new Map<string, PictoryUsageAccount>();
  if (initialAccount) {
    accounts.set(initialAccount.subjectId, initialAccount);
  }

  return {
    readAccount: async (subjectId) => accounts.get(subjectId) ?? null,
    writeAccount: async (account) => {
      accounts.set(account.subjectId, account);
    },
    deleteAccount: async (subjectId) => accounts.delete(subjectId),
  };
}
