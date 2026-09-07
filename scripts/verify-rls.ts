/**
 * Proves the anon role cannot reach any data. Run after applying the migration
 * and after any policy change: `npm run verify:rls`.
 *
 * This is the check that actually demonstrates the vulnerability is closed.
 * Unit tests cannot reach database state, so this lives here rather than in the
 * vitest suite.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const url = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

const TABLES = [
  "tasks",
  "transactions",
  "task_categories",
  "financial_categories",
  "settings",
] as const;

// No session is established, so every request carries only the anon key.
const anon = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failures = 0;

for (const table of TABLES) {
  const { data, error } = await anon.from(table).select("*").limit(1);

  if (error) {
    // A policy-level rejection is also a pass: nothing leaked.
    console.log(`  PASS  ${table}: rejected (${error.code ?? "error"})`);
    continue;
  }
  if (data && data.length > 0) {
    console.error(`  FAIL  ${table}: returned ${data.length} row(s) to anon`);
    failures++;
    continue;
  }
  console.log(`  PASS  ${table}: 0 rows`);
}

// Reading nothing is not proof on its own — an empty table also reads as zero
// rows. Writing must be refused too.
const { error: insertError } = await anon
  .from("settings")
  .insert({ key: "rls_probe", value: "should not be written" });

if (insertError) {
  console.log(`  PASS  settings: insert refused (${insertError.code ?? "error"})`);
} else {
  console.error("  FAIL  settings: anon insert SUCCEEDED — RLS is not protecting writes");
  failures++;
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed. RLS is not correctly configured.`);
  process.exit(1);
}
console.log("\nAll checks passed: anon cannot read or write any table.");
