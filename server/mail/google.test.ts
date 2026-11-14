import type { OAuth2Client } from "google-auth-library";
import { describe, expect, it, vi } from "vitest";
import { listGmail } from "./google";

describe("listGmail", () => {
  it("follows every page of results and skips messages already cached", async () => {
    const request = vi.fn(async ({ url }: { url: string }) => {
      const { pathname, searchParams } = new URL(url);
      if (pathname.endsWith("/messages")) {
        return searchParams.get("pageToken") === "p2"
          ? { data: { messages: [{ id: "c" }] } }
          : { data: { messages: [{ id: "a" }, { id: "b" }], nextPageToken: "p2" } };
      }
      const id = pathname.split("/").pop()!;
      return { data: { id, internalDate: "1762992000000", payload: { headers: [{ name: "Subject", value: id }] } } };
    });

    const messages = await listGmail({ request } as unknown as OAuth2Client, "me@gmail.com", 0, new Set(["b"]));

    expect(messages.map((m) => m.messageId)).toEqual(["a", "c"]);
  });
});
