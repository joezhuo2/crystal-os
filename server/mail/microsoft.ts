import { createHash, randomBytes } from "node:crypto";
import { CalendarError as MailError } from "../calendar/errors";
import type { FetchedMessage, MailConfig, StoredAccount } from "./types";

const AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0";
const GRAPH = "https://graph.microsoft.com/v1.0";
const SCOPES = "offline_access Mail.Read User.Read";
const MAX_MESSAGES = 200;

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
}

interface GraphMessage {
  id: string;
  subject?: string | null;
  from?: { emailAddress?: { name?: string; address?: string } } | null;
  receivedDateTime: string;
  bodyPreview?: string | null;
  webLink?: string | null;
}

export function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export function microsoftAuthUrl(config: MailConfig, state: string, challenge: string): string {
  const params = new URLSearchParams({
    client_id: config.microsoftClientId ?? "",
    response_type: "code",
    redirect_uri: config.redirectUri ?? "",
    response_mode: "query",
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${AUTHORITY}/authorize?${params}`;
}

async function requestToken(config: MailConfig, grant: Record<string, string>): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: config.microsoftClientId ?? "",
    scope: SCOPES,
    redirect_uri: config.redirectUri ?? "",
    ...grant,
  });
  if (config.microsoftClientSecret) body.set("client_secret", config.microsoftClientSecret);
  const res = await fetch(`${AUTHORITY}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json().catch(() => ({}))) as Partial<TokenResponse> & {
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    const reason = data.error_description?.split(/\r?\n/)[0] || data.error || `HTTP ${res.status}`;
    throw new MailError(`Microsoft sign-in failed: ${reason}`, 502);
  }
  return data as TokenResponse;
}

async function graphGet<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) {
    throw new MailError(`Microsoft Graph: ${data.error?.message || `HTTP ${res.status}`}`, 502);
  }
  return data;
}

export async function microsoftExchange(
  config: MailConfig,
  code: string,
  verifier: string,
): Promise<{ email: string; refreshToken: string }> {
  const tokens = await requestToken(config, {
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
  });
  if (!tokens.refresh_token) throw new MailError("Microsoft did not return a refresh token", 502);
  const me = await graphGet<{ mail?: string | null; userPrincipalName: string }>(`${GRAPH}/me`, tokens.access_token);
  return { email: me.mail ?? me.userPrincipalName, refreshToken: tokens.refresh_token };
}

export async function listOutlook(
  config: MailConfig,
  account: StoredAccount,
  since: number,
  saveToken: (refreshToken: string) => Promise<void>,
): Promise<FetchedMessage[]> {
  const tokens = await requestToken(config, {
    grant_type: "refresh_token",
    refresh_token: account.refreshToken,
  });
  if (tokens.refresh_token && tokens.refresh_token !== account.refreshToken) {
    await saveToken(tokens.refresh_token);
  }

  let url: string | undefined =
    `${GRAPH}/me/messages?$select=id,subject,from,receivedDateTime,bodyPreview,webLink` +
    `&$filter=${encodeURIComponent(`receivedDateTime ge ${new Date(since).toISOString()}`)}` +
    `&$orderby=${encodeURIComponent("receivedDateTime desc")}&$top=100`;
  const messages: GraphMessage[] = [];
  while (url && messages.length < MAX_MESSAGES) {
    const page: { value?: GraphMessage[]; "@odata.nextLink"?: string } = await graphGet(url, tokens.access_token);
    messages.push(...(page.value ?? []));
    const nextLink = page["@odata.nextLink"];
    url = nextLink?.startsWith(`${GRAPH}/`) ? nextLink : undefined;
  }

  return messages.slice(0, MAX_MESSAGES).map((m) => ({
    messageId: m.id,
    from: m.from?.emailAddress?.name || m.from?.emailAddress?.address || "",
    fromAddress: m.from?.emailAddress?.address ?? "",
    subject: m.subject ?? "",
    snippet: m.bodyPreview ?? "",
    receivedAt: new Date(m.receivedDateTime).toISOString(),
    url: m.webLink ?? "",
  }));
}
