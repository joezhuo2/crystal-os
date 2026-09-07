import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import { createRequireUser, readBearerToken, type TokenVerifier } from "./requireUser";

const USER = { id: "user-1", email: "me@example.com" };

/** Minimal IncomingMessage stand-in — only headers are read. */
function req(authorization?: string): IncomingMessage {
  return { headers: authorization ? { authorization } : {} } as IncomingMessage;
}

function verifierReturning(result: {
  data: { user: typeof USER | null };
  error: { message: string } | null;
}): TokenVerifier & { getUser: ReturnType<typeof vi.fn> } {
  return { getUser: vi.fn().mockResolvedValue(result) };
}

describe("readBearerToken", () => {
  it("returns null when the header is absent", () => {
    expect(readBearerToken(req())).toBeNull();
  });

  it("returns null when the scheme is not Bearer", () => {
    expect(readBearerToken(req("Basic abc123"))).toBeNull();
  });

  it("returns null when the token is empty", () => {
    expect(readBearerToken(req("Bearer    "))).toBeNull();
  });

  it("extracts the token", () => {
    expect(readBearerToken(req("Bearer abc123"))).toBe("abc123");
  });
});

describe("createRequireUser", () => {
  it("returns null without contacting Supabase when there is no header", async () => {
    const verifier = verifierReturning({ data: { user: USER }, error: null });
    const requireUser = createRequireUser(verifier);

    expect(await requireUser(req())).toBeNull();
    expect(verifier.getUser).not.toHaveBeenCalled();
  });

  it("returns null when Supabase rejects the token", async () => {
    const verifier = verifierReturning({
      data: { user: null },
      error: { message: "invalid JWT" },
    });
    const requireUser = createRequireUser(verifier);

    expect(await requireUser(req("Bearer bad"))).toBeNull();
  });

  it("returns the user for a valid token", async () => {
    const verifier = verifierReturning({ data: { user: USER }, error: null });
    const requireUser = createRequireUser(verifier);

    expect(await requireUser(req("Bearer good"))).toEqual(USER);
  });

  it("does not re-contact Supabase within the TTL", async () => {
    const verifier = verifierReturning({ data: { user: USER }, error: null });
    let clock = 1_000;
    const requireUser = createRequireUser(verifier, { ttlMs: 60_000, now: () => clock });

    await requireUser(req("Bearer good"));
    clock += 59_000;
    await requireUser(req("Bearer good"));

    expect(verifier.getUser).toHaveBeenCalledTimes(1);
  });

  it("re-contacts Supabase once the TTL has passed", async () => {
    const verifier = verifierReturning({ data: { user: USER }, error: null });
    let clock = 1_000;
    const requireUser = createRequireUser(verifier, { ttlMs: 60_000, now: () => clock });

    await requireUser(req("Bearer good"));
    clock += 61_000;
    await requireUser(req("Bearer good"));

    expect(verifier.getUser).toHaveBeenCalledTimes(2);
  });

  it("does not cache rejections", async () => {
    const verifier = verifierReturning({
      data: { user: null },
      error: { message: "invalid JWT" },
    });
    const requireUser = createRequireUser(verifier);

    await requireUser(req("Bearer bad"));
    await requireUser(req("Bearer bad"));

    expect(verifier.getUser).toHaveBeenCalledTimes(2);
  });
});
