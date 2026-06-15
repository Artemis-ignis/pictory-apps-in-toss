import { createHmac, timingSafeEqual } from "node:crypto";
import type { PictoryClassifyRequestContext } from "./pictoryClassify";

interface PictorySessionPayload {
  sub?: unknown;
  exp?: unknown;
  aud?: unknown;
}

const DEFAULT_COOKIE_NAME = "pictory_session";

export function resolveSubjectIdFromSignedSession(
  context: PictoryClassifyRequestContext,
  env: Record<string, string | undefined> = process.env,
) {
  const secret = env.PICTORY_SESSION_SECRET?.trim();
  if (!secret) {
    return null;
  }

  const token = readBearerToken(context.headers.authorization) ??
    readCookie(context.headers.cookie, env.PICTORY_SESSION_COOKIE_NAME);
  if (!token) {
    return null;
  }

  const payload = verifySignedSessionToken(token, secret);
  if (!payload) {
    return null;
  }

  const subjectId = typeof payload.sub === "string" ? payload.sub.trim() : "";
  if (!subjectId) {
    return null;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && payload.exp <= nowSeconds) {
    return null;
  }

  const audience = env.PICTORY_SESSION_AUDIENCE?.trim();
  if (audience && payload.aud !== audience) {
    return null;
  }

  return subjectId;
}

export function createSignedPictorySessionToken(
  payload: { sub: string; exp?: number; aud?: string },
  secret: string,
) {
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(body, secret);
  return `${body}.${signature}`;
}

function verifySignedSessionToken(token: string, secret: string) {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra != null) {
    return null;
  }

  if (!constantTimeEqual(signature, sign(body, secret))) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(body)) as PictorySessionPayload;
    return typeof parsed === "object" && parsed != null ? parsed : null;
  } catch {
    return null;
  }
}

function readBearerToken(value: string | undefined) {
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function readCookie(
  value: string | undefined,
  cookieName = DEFAULT_COOKIE_NAME,
) {
  const name = cookieName.trim() || DEFAULT_COOKIE_NAME;
  return (
    value
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`))
      ?.slice(name.length + 1) || null
  );
}

function sign(body: string, secret: string) {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}
