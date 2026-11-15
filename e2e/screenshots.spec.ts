import { expect, test, type Browser, type BrowserContext, type Page, type Route } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { queryNotes } from "../src/lib/vaultCore";
import * as sample from "./fixtures/sampleData";

test.skip(!process.env.SCREENSHOTS, "Set SCREENSHOTS=1 (and E2E_BASE_URL if the dev server is not on 127.0.0.1:8080) to recapture the README images.");

const SIZE = { width: 1400, height: 880 };
const OUT = path.resolve("docs/images");

const PAGES = [
  ["The Pulse", "home"],
  ["The Engine", "engine"],
  ["The Horizon", "horizon"],
  ["The Orbit", "orbit"],
  ["The Vault", "vault"],
  ["The Ledger", "ledger"],
  ["The Atmosphere", "atmosphere"],
  ["The Archive", "archive"],
  ["Settings", "settings"],
] as const;

const SUPABASE_HOST = new URL(process.env.VITE_SUPABASE_URL ?? "https://unset.supabase.co").host;
const PROJECT_REF = SUPABASE_HOST.split(".")[0];
const VERSION = JSON.parse(readFileSync("package.json", "utf8")).version as string;

// Public, non-personal data: Toronto's weather and fonts.
const PASS_HOSTS = [/(^|\.)weather\.gc\.ca$/, /(^|\.)fonts\.(googleapis|gstatic)\.com$/];

const SKELETONS = "main .skeleton-shimmer, main .animate-pulse, main [class*='skeleton']";

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
const expiresAt = Math.floor(Date.now() / 1000) + 10 * 365 * 86_400;
const user = {
  id: sample.SAMPLE_USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: sample.SAMPLE_EMAIL,
  email_confirmed_at: sample.at(-120, "09:00"),
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  identities: [],
  created_at: sample.at(-120, "09:00"),
  updated_at: sample.at(-1, "09:00"),
};
const session = {
  access_token: `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: user.id, email: user.email, role: "authenticated", aud: "authenticated", exp: expiresAt })}.sample`,
  token_type: "bearer",
  expires_in: expiresAt - Math.floor(Date.now() / 1000),
  expires_at: expiresAt,
  refresh_token: "sample-refresh-token",
  user,
};

const storage: Record<string, string> = {
  [`sb-${PROJECT_REF}-auth-token`]: JSON.stringify(session),
  "crystal-os-privacy-mode": "false",
  "crystal-os-theme": "orbit",
  "crystal-os-weather-city": "on-143",
  "crystal-os-atmosphere-auto-locate": "0",
  "crystal-os-onboarding-dismissed": "1",
  "crystal-os-show-changelog": "false",
  "crystal-os-last-version": VERSION,
  "crystal-os:mail-connected": "1",
  "crystal-os:calendar-connected": "1",
};

const notes = sample.vaultNotes.map(({ raw: _raw, ...note }) => note);

function json(route: Route, body: unknown, status = 200, headers: Record<string, string> = {}) {
  return route.fulfill({ status, contentType: "application/json", headers, body: JSON.stringify(body) });
}

function compare(a: string, b: string): number {
  const [da, db] = [Date.parse(a), Date.parse(b)];
  if (a.includes("T") && !Number.isNaN(da) && !Number.isNaN(db)) return da - db;
  return a < b ? -1 : a > b ? 1 : 0;
}

const OPS: Record<string, (c: number) => boolean> = { eq: (c) => c === 0, gt: (c) => c > 0, gte: (c) => c >= 0, lt: (c) => c < 0, lte: (c) => c <= 0 };

function selectRows(rows: Record<string, unknown>[], params: URLSearchParams) {
  let out = [...rows];
  for (const [key, value] of params) {
    const m = /^(eq|gt|gte|lt|lte)\.(.*)$/.exec(value);
    if (m) out = out.filter((r) => OPS[m[1]](compare(String(r[key] ?? ""), m[2])));
  }
  const [col, dir] = (params.get("order") ?? "").split(",")[0].split(".");
  if (col) out.sort((a, b) => compare(String(a[col] ?? ""), String(b[col] ?? "")) * (dir === "desc" ? -1 : 1));
  const limit = Number(params.get("limit"));
  return limit > 0 ? out.slice(0, limit) : out;
}

function supabase(route: Route, url: URL, blocked: string[]) {
  const req = route.request();
  if (url.pathname.startsWith("/auth/v1/")) {
    if (url.pathname.endsWith("/user")) return json(route, user);
    if (url.pathname.endsWith("/token")) return json(route, session);
    if (url.pathname.endsWith("/logout")) return route.fulfill({ status: 204 });
  }
  const table = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname)?.[1];
  if (table && table in sample.supabaseTables) {
    if (req.method() !== "GET" && req.method() !== "HEAD") return route.fulfill({ status: 204 });
    const rows = selectRows(sample.supabaseTables[table], url.searchParams);
    const range = { "Content-Range": rows.length ? `0-${rows.length - 1}/${rows.length}` : "*/0" };
    if ((req.headers().accept ?? "").includes("vnd.pgrst.object")) return rows[0] ? json(route, rows[0], 200, range) : json(route, { code: "PGRST116", message: "no rows" }, 406);
    return json(route, rows, 200, range);
  }
  blocked.push(`${req.method()} ${url.href}`);
  return route.abort();
}

function api(route: Route, url: URL, blocked: string[]) {
  const p = url.pathname;
  const q = url.searchParams;
  const get = route.request().method() === "GET";
  if (get && p === "/api/calendar/status") return json(route, sample.calendarStatus);
  if (get && p === "/api/calendar/calendars") return json(route, sample.calendarList);
  if (get && p === "/api/calendar/events") {
    const min = q.get("timeMin") ?? "";
    const max = q.get("timeMax") ?? "9999";
    return json(route, { events: sample.calendarEvents.filter((e) => compare(String(e.endISO), min) > 0 && compare(String(e.startISO), max) < 0) });
  }
  if (get && p === "/api/mail/status") return json(route, sample.mailStatus);
  if (get && p === "/api/mail/digest") return json(route, sample.mailDigest());
  if (get && p === "/api/obsidian/notes") {
    const one = q.get("path");
    if (one) {
      const note = notes.find((n) => n.path === one);
      return note ? json(route, note) : json(route, { error: "Note not found" }, 404);
    }
    const limit = Number.parseInt(q.get("limit") ?? "", 10);
    return json(route, queryNotes(notes, { q: q.get("q") ?? undefined, tag: q.get("tag") ?? undefined, limit: Number.isFinite(limit) ? limit : undefined }));
  }
  if (get && p === "/api/obsidian/raw") {
    const note = sample.vaultNotes.find((n) => n.path === q.get("path"));
    return note ? json(route, { path: note.path, content: note.raw, mtime: note.mtime }) : json(route, { error: "Note not found" }, 404);
  }
  if ((get && p === "/api/trades") || p === "/api/trades/sync") return json(route, sample.tradesData());
  blocked.push(`${route.request().method()} ${url.href}`);
  return route.abort();
}

async function sampleContext(browser: Browser, baseURL: string, video?: string): Promise<{ context: BrowserContext; blocked: string[] }> {
  const context = await browser.newContext({
    baseURL,
    viewport: SIZE,
    serviceWorkers: "block",
    locale: "en-US",
    ...(video ? { recordVideo: { dir: video, size: SIZE } } : {}),
  });
  const blocked: string[] = [];
  const origin = new URL(baseURL).origin;
  // Allow-list routing: anything not mocked or known-public is aborted, so no real data can load.
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.host === SUPABASE_HOST) return supabase(route, url, blocked);
    if (url.origin === origin) return url.pathname.startsWith("/api/") ? api(route, url, blocked) : route.continue();
    if (url.protocol.startsWith("http") && PASS_HOSTS.some((h) => h.test(url.hostname))) return route.continue();
    blocked.push(`${route.request().method()} ${url.href}`);
    return route.abort();
  });
  await context.routeWebSocket(/supabase/, (ws) => ws.close());
  // A mid-morning clock, so the greeting, Today views and work-day capacity read like a working day.
  await context.clock.install({ time: sample.NOW });
  // Still backdrops for the tour: moving backgrounds change every pixel of every frame and balloon the GIF.
  const entries = video ? { ...storage, "crystal-os-perf-still-backdrops": "1" } : storage;
  await context.addInitScript((seed) => {
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
  }, entries);
  return { context, blocked };
}

async function settle(page: Page, pause = 1500) {
  await expect(page.locator("main")).not.toBeEmpty();
  await expect(page.locator(SKELETONS)).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByText(/sign in/i)).toHaveCount(0);
  await page.waitForTimeout(pause);
}

async function openPage(page: Page, label: string, pause?: number) {
  await page.locator("aside").getByRole("button", { name: label }).click();
  await page.mouse.move(SIZE.width - 4, SIZE.height - 4);
  await settle(page, label === "The Archive" || label === "Settings" ? 500 : pause);
  if (label === "The Archive") {
    await page.locator("button.obsidian-note", { hasText: "Website Redesign" }).click();
    await page.mouse.move(SIZE.width - 4, SIZE.height - 4);
    await settle(page, pause);
  }
  if (label === "Settings") {
    await page.locator('[data-settings-section="modules"]').evaluate((el) => el.scrollIntoView({ block: "start", behavior: "instant" }));
    await page.waitForTimeout(pause ?? 1500);
  }
}

async function boot(page: Page) {
  await page.goto("/");
  await expect(page.locator("aside")).toBeVisible({ timeout: 30_000 });
  // Toasts (e.g. "reviews ready") are transient and would cover the bottom-right of every shot.
  await page.addStyleTag({ content: "[data-sonner-toaster] { display: none !important; }" });
  await settle(page, 2500);
}

const ffmpeg = (...args: string[]) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });

function report(blocked: string[]) {
  if (blocked.length) console.log(`Aborted unmocked requests:\n  ${[...new Set(blocked)].join("\n  ")}`);
}

test("README screenshots", async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  const { context, blocked } = await sampleContext(browser, baseURL!);
  const page = await context.newPage();
  await boot(page);
  for (const [label, file] of PAGES) {
    await openPage(page, label);
    const png = test.info().outputPath(`${file}.png`);
    await page.screenshot({ path: png });
    ffmpeg("-i", png, "-c:v", "libwebp", "-quality", "82", path.join(OUT, "screenshots", `${file}.webp`));
  }
  await context.close();
  report(blocked);
});

test("README tour GIF", async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  const dir = test.info().outputPath("video");
  const { context, blocked } = await sampleContext(browser, baseURL!, dir);
  const page = await context.newPage();
  // The recording starts once the page exists, so time it from here.
  const videoStart = Date.now();
  await boot(page);
  // Warm every page first, so the recorded pass shows loaded pages, not lazy-load skeletons.
  for (const [label] of PAGES) await openPage(page, label, 300);
  await openPage(page, "The Pulse", 300);
  const trim = (Date.now() - videoStart) / 1000;
  await page.waitForTimeout(2000);
  for (const [label] of PAGES.slice(1)) await openPage(page, label, 2000);
  const length = (Date.now() - videoStart) / 1000 - trim + 0.5;
  const video = page.video()!;
  await context.close();
  const gif = path.join(OUT, "crystal-os-tour.gif");
  ffmpeg(
    "-ss", trim.toFixed(2),
    "-t", length.toFixed(2),
    "-i", await video.path(),
    "-vf", "fps=10,scale=840:-1:flags=lanczos,mpdecimate=hi=64*24:lo=64*8:frac=0.5,tpad=stop_mode=clone:stop_duration=1,split[a][b];[a]palettegen=max_colors=80:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle",
    "-fps_mode", "vfr",
    "-loop", "0",
    gif,
  );
  report(blocked);
  expect(statSync(gif).size, "tour GIF over 4 MB").toBeLessThan(4 * 1024 * 1024);
});
