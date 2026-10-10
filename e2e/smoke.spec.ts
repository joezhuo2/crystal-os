import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Release smoke test: sign in, add and remove a task, log and remove a
 * transaction, and open every page, failing on any uncaught error or a page
 * that renders nothing. Run with `npm run test:e2e`; see playwright.config.ts
 * for the account it uses.
 */

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

/** Sidebar labels on the web build. The Nebula and Terminal are desktop only. */
const PAGES = [
  "The Pulse",
  "The Engine",
  "The Horizon",
  "The Vault",
  "The Atmosphere",
  "The Archive",
  "The Portal",
  "Settings",
] as const;

test.skip(!email || !password, "Set E2E_EMAIL and E2E_PASSWORD in .env.local to run the smoke test.");

let pageErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(`${err.name}: ${err.message}`));

  await page.goto("/");
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("aside")).toBeVisible({ timeout: 20_000 });
});

test.afterEach(() => {
  expect(pageErrors, "uncaught errors in the page").toEqual([]);
});

function navButton(page: Page, label: string): Locator {
  // The Portal's button also carries an unread badge in its name.
  return page.locator("aside").getByRole("button", { name: new RegExp(`^${label}\\b`) });
}

async function openPage(page: Page, label: string) {
  await navButton(page, label).click();
  const main = page.locator("main");
  await expect(main, `${label} rendered nothing`).not.toBeEmpty();
  await expect.poll(async () => (await main.innerText()).trim().length, { message: `${label} has no text` }).toBeGreaterThan(0);
}

/** Hover a list row so its hidden edit/delete buttons show, then delete it. */
async function deleteRow(row: Locator) {
  await row.hover();
  await row.getByRole("button").last().click();
  await expect(row).toHaveCount(0);
}

/**
 * Delete rows a previous run left behind when it failed between adding and
 * deleting, so the test account does not fill up with them.
 */
async function sweepLeftovers(rows: Locator) {
  for (let left = await rows.count(); left > 0; left--) {
    const row = rows.first();
    await row.hover();
    await row.getByRole("button").last().click();
    await expect(rows).toHaveCount(left - 1);
  }
}

test("opens every page", async ({ page }) => {
  for (const label of PAGES) {
    await test.step(label, () => openPage(page, label));
  }
});

test("adds and deletes a task", async ({ page }) => {
  const name = `E2E smoke task ${Date.now()}`;
  await openPage(page, "The Engine");
  await sweepLeftovers(page.locator("main .glass-card-hover").filter({ hasText: /E2E smoke task \d+/ }));

  await page.locator("main").getByRole("button", { name: "Add Task" }).click();
  const input = page.getByPlaceholder("Task name...");
  await input.fill(name);
  await input.press("Enter");
  await expect(input).toBeHidden();

  const row = page.locator("main .glass-card-hover").filter({ hasText: name });
  await expect(row).toHaveCount(1);

  // Survives a reload, so it really reached Supabase.
  await page.reload();
  await openPage(page, "The Engine");
  await expect(row).toHaveCount(1);

  await deleteRow(row);
});

test("logs and deletes a transaction", async ({ page }) => {
  const name = `E2E smoke transaction ${Date.now()}`;
  await openPage(page, "The Vault");
  await sweepLeftovers(page.locator("main .glass-card").filter({ hasText: /E2E smoke transaction \d+/ }));

  await page.locator("main").getByRole("button", { name: "Quick Add" }).click();
  await page.getByPlaceholder("Description...").fill(name);
  await page.getByPlaceholder("Amount").fill("1.23");
  await page.getByRole("button", { name: "Add Transaction" }).click();
  await expect(page.getByPlaceholder("Description...")).toBeHidden();

  const row = page.locator("main .glass-card").filter({ hasText: name });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("$1.23");

  await page.reload();
  await openPage(page, "The Vault");
  await expect(row).toHaveCount(1);

  await deleteRow(row);
});
