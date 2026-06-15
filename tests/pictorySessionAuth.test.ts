import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSignedPictorySessionToken,
  resolveSubjectIdFromSignedSession,
} from "../server/pictorySessionAuth";

describe("pictorySessionAuth", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves signed bearer and cookie session tokens", () => {
    const token = createSignedPictorySessionToken(
      { sub: "user-1", exp: 4_000_000_000, aud: "pictory" },
      "session-secret",
    );
    const env = {
      PICTORY_SESSION_SECRET: "session-secret",
      PICTORY_SESSION_AUDIENCE: "pictory",
    };

    expect(
      resolveSubjectIdFromSignedSession(
        {
          schemaVersion: 1,
          itemCount: 0,
          headers: { authorization: `Bearer ${token}` },
        },
        env,
      ),
    ).toBe("user-1");
    expect(
      resolveSubjectIdFromSignedSession(
        {
          schemaVersion: 1,
          itemCount: 0,
          headers: { cookie: `pictory_session=${token}` },
        },
        env,
      ),
    ).toBe("user-1");
  });

  it("rejects missing, expired, tampered, or wrong-audience sessions", () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000_000_000);
    const valid = createSignedPictorySessionToken(
      { sub: "user-1", exp: 3_000_000_000, aud: "pictory" },
      "session-secret",
    );
    const expired = createSignedPictorySessionToken(
      { sub: "user-1", exp: 1_000_000_000, aud: "pictory" },
      "session-secret",
    );
    const wrongAudience = createSignedPictorySessionToken(
      { sub: "user-1", exp: 3_000_000_000, aud: "other" },
      "session-secret",
    );
    const tampered = `${valid.slice(0, -1)}x`;
    const context = (token: string) => ({
      schemaVersion: 1 as const,
      itemCount: 0,
      headers: { authorization: `Bearer ${token}` },
    });
    const env = {
      PICTORY_SESSION_SECRET: "session-secret",
      PICTORY_SESSION_AUDIENCE: "pictory",
    };

    expect(resolveSubjectIdFromSignedSession(context(expired), env)).toBeNull();
    expect(
      resolveSubjectIdFromSignedSession(context(wrongAudience), env),
    ).toBeNull();
    expect(resolveSubjectIdFromSignedSession(context(tampered), env)).toBeNull();
    expect(
      resolveSubjectIdFromSignedSession(context(valid), {}),
    ).toBeNull();
  });
});
