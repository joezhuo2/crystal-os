import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listOutlook, microsoftAuthUrl } from "./microsoft";
import { createMailStore } from "./store";

const config = { microsoftClientId: "cid", redirectUri: "http://localhost:8080/api/mail/auth/callback" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => vi.unstubAllGlobals());

describe("microsoft", () => {
  it("always sends a PKCE challenge", () => {
    const url = new URL(microsoftAuthUrl(config, "st", "chal"));
    expect(url.searchParams.get("code_challenge")).toBe("chal");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe("offline_access Mail.Read User.Read");
  });

  it("persists a rotated refresh token and follows nextLink", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mail-ms-"));
    try {
      const store = createMailStore(dir);
      const account = await store.upsert("microsoft", "me@outlook.com", "old-rt");
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(json({ access_token: "at", refresh_token: "new-rt" }))
        .mockResolvedValueOnce(
          json({
            value: [{ id: "m1", subject: "Hi", from: { emailAddress: { name: "A", address: "a@x.com" } }, receivedDateTime: "2026-11-10T10:00:00Z", bodyPreview: "p", webLink: "https://outlook/1" }],
            "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/messages?$skip=100",
          }),
        )
        .mockResolvedValueOnce(json({ value: [{ id: "m2", receivedDateTime: "2026-11-09T10:00:00Z" }] }));
      vi.stubGlobal("fetch", fetchMock);

      const messages = await listOutlook(config, account, 30, (t) => store.setToken(account.id, t));

      expect(messages.map((m) => m.messageId)).toEqual(["m1", "m2"]);
      expect(messages[0]).toMatchObject({ from: "A", fromAddress: "a@x.com", url: "https://outlook/1" });
      expect((await store.list())[0].refreshToken).toBe("new-rt");
      const tokenBody = String(fetchMock.mock.calls[0][1].body);
      expect(tokenBody).toContain("grant_type=refresh_token");
      expect(tokenBody).not.toContain("client_secret");
      expect(fetchMock.mock.calls[1][1].headers.authorization).toBe("Bearer at");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("surfaces a sign-in failure without the token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: "invalid_grant", error_description: "AADSTS70000: expired\r\nTrace" }, 400)));
    const account = { id: "1", provider: "microsoft" as const, email: "me@outlook.com", refreshToken: "secret-rt" };
    await expect(listOutlook({ ...config, microsoftClientSecret: "s" }, account, 30, async () => {})).rejects.toThrow(
      "Microsoft sign-in failed: AADSTS70000: expired",
    );
  });
});
