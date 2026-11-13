import { OAuth2Client } from "google-auth-library";
import { CalendarError as MailError } from "../calendar/errors";
import type { FetchedMessage, MailConfig } from "./types";

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const CONCURRENCY = 10;

interface GmailMessage {
  id: string;
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart & { headers?: { name: string; value: string }[] };
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

const MAX_TEXT = 4000;
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', nbsp: " ", "#39": "'" };

export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<(br|\/p|\/div|\/tr|\/li|\/h\d|\/table)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(amp|lt|gt|quot|nbsp|#39);/g, (_, e: string) => ENTITIES[e]);
}

export function bodyText(payload: GmailPart | undefined): string {
  const find = (part: GmailPart | undefined, type: string): string | undefined => {
    if (!part) return undefined;
    if (part.mimeType === type && part.body?.data) return Buffer.from(part.body.data, "base64url").toString("utf-8");
    for (const child of part.parts ?? []) {
      const hit = find(child, type);
      if (hit) return hit;
    }
    return undefined;
  };
  const text = find(payload, "text/plain") ?? htmlToText(find(payload, "text/html") ?? "");
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t\u00a0\u200b-\u200d]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_TEXT);
}

export function googleClient(config: MailConfig, refreshToken?: string): OAuth2Client {
  const client = new OAuth2Client({
    clientId: config.googleClientId,
    clientSecret: config.googleClientSecret,
    redirectUri: config.redirectUri,
  });
  if (refreshToken) client.setCredentials({ refresh_token: refreshToken });
  return client;
}

export function googleAuthUrl(config: MailConfig, state: string): string {
  return googleClient(config).generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [GMAIL_SCOPE],
    state,
  });
}

async function get<T>(client: OAuth2Client, path: string): Promise<T> {
  const { data } = await client.request<T>({ url: `${GMAIL}${path}`, method: "GET", retry: true });
  return data;
}

export async function googleExchange(
  config: MailConfig,
  code: string,
): Promise<{ email: string; refreshToken: string }> {
  const client = googleClient(config);
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new MailError(
      "Google did not return a refresh token. Revoke the app's access at " +
        "https://myaccount.google.com/permissions and connect again.",
    );
  }
  client.setCredentials(tokens);
  const profile = await get<{ emailAddress: string }>(client, "/profile");
  return { email: profile.emailAddress, refreshToken: tokens.refresh_token };
}

export async function revokeGoogle(config: MailConfig, refreshToken: string): Promise<void> {
  try {
    await googleClient(config).revokeToken(refreshToken);
  } catch {
    return;
  }
}

export function parseFrom(header: string): { from: string; fromAddress: string } {
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(header);
  if (match) return { from: match[1].trim() || match[2].trim(), fromAddress: match[2].trim() };
  return { from: header.trim(), fromAddress: header.trim() };
}

function toMessage(m: GmailMessage, email: string): FetchedMessage {
  const header = (name: string) =>
    m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
  const date = m.internalDate ? new Date(Number(m.internalDate)) : new Date(header("Date"));
  return {
    messageId: m.id,
    ...parseFrom(header("From")),
    subject: header("Subject"),
    snippet: m.snippet ?? "",
    text: bodyText(m.payload) || undefined,
    receivedAt: Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString(),
    url: `https://mail.google.com/mail/?authuser=${encodeURIComponent(email)}#all/${m.id}`,
  };
}

export async function listGmail(client: OAuth2Client, email: string, since: number): Promise<FetchedMessage[]> {
  const q = encodeURIComponent(`after:${Math.floor(since / 1000)} -category:promotions -category:social`);
  const list = await get<{ messages?: { id: string }[] }>(client, `/messages?q=${q}&maxResults=150`);
  const ids = (list.messages ?? []).map((m) => m.id);
  const out: FetchedMessage[] = new Array(ids.length);
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const i = next++;
      const m = await get<GmailMessage>(
        client,
        `/messages/${encodeURIComponent(ids[i])}?format=full`,
      );
      out[i] = toMessage(m, email);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));
  return out;
}
