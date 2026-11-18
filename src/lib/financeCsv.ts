import type { Transaction } from "@/contexts/AppContext";

export interface CsvTransaction {
  date: string;
  name: string;
  amount: number;
  type: "income" | "expense";
}

export function parseCsv(text: string): string[][] {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const firstLine = body.slice(0, body.search(/\r?\n|$/));
  const delimiter = [",", ";", "\t"].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quoted) {
      if (c !== '"') cell += c;
      else if (body[i + 1] === '"') cell += body[++i];
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && body[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows.map((r) => r.map((v) => v.trim())).filter((r) => r.some(Boolean));
}

const pad = (n: number) => String(n).padStart(2, "0");

// shortcut: n/n/yyyy is read as month/day unless the first number is over 12, add a format picker if a day-first bank shows up
export function parseCsvDate(raw: string): string | null {
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(raw);
  if (iso) return `${iso[1]}-${pad(Number(iso[2]))}-${pad(Number(iso[3]))}`;
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const slash = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(raw);
  if (slash) {
    const [a, b] = [Number(slash[1]), Number(slash[2])];
    const [month, day] = a > 12 ? [b, a] : [a, b];
    const year = Number(slash[3]) < 100 ? 2000 + Number(slash[3]) : Number(slash[3]);
    return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? `${year}-${pad(month)}-${pad(day)}` : null;
  }
  const named = /[a-z]{3}/i.test(raw) ? new Date(`${raw} 12:00`) : null;
  return named && !Number.isNaN(named.getTime()) ? `${named.getFullYear()}-${pad(named.getMonth() + 1)}-${pad(named.getDate())}` : null;
}

export function parseCsvAmount(raw: string | undefined): number | null {
  if (!raw) return null;
  const negative = /^\(.*\)$/.test(raw) || /^-|-$|\bDR\b/i.test(raw);
  const value = Number(raw.replace(/[^\d.]/g, ""));
  if (!/\d/.test(raw) || Number.isNaN(value)) return null;
  return negative ? -value : value;
}

const COLUMNS = {
  date: /date|posted/i,
  name: /desc|name|payee|merchant|memo|details|narrative/i,
  amount: /amount|^value$|^cad\$?$/i,
  debit: /debit|withdraw|paid out|money out/i,
  credit: /credit|deposit|paid in|money in/i,
};

export function csvTransactions(text: string, flipSigns = false): { rows: CsvTransaction[]; skipped: number } {
  const lines = parseCsv(text);
  if (!lines.length) return { rows: [], skipped: 0 };
  const header = parseCsvDate(lines[0][0] ?? "") === null ? lines[0] : null;
  const find = (re: RegExp) => header?.findIndex((h) => re.test(h)) ?? -1;
  const col = header
    ? { date: find(COLUMNS.date), name: find(COLUMNS.name), amount: find(COLUMNS.amount), debit: find(COLUMNS.debit), credit: find(COLUMNS.credit) }
    : { date: 0, name: 1, amount: lines[0].length === 3 ? 2 : -1, debit: lines[0].length === 3 ? -1 : 2, credit: lines[0].length === 3 ? -1 : 3 };

  const rows: CsvTransaction[] = [];
  let skipped = 0;
  for (const line of header ? lines.slice(1) : lines) {
    const date = parseCsvDate(line[col.date] ?? "");
    const debit = parseCsvAmount(line[col.debit]);
    const credit = parseCsvAmount(line[col.credit]);
    const signed = debit || credit ? Math.abs(credit ?? 0) - Math.abs(debit ?? 0) : parseCsvAmount(line[col.amount]);
    const name = (line[col.name] ?? "").replace(/\s+/g, " ").slice(0, 200);
    if (!date || !signed || !name) {
      skipped++;
      continue;
    }
    const value = flipSigns ? -signed : signed;
    rows.push({ date, name, amount: Math.round(Math.abs(value) * 100) / 100, type: value > 0 ? "income" : "expense" });
  }
  return { rows, skipped };
}

export const dedupeKey = (t: Pick<Transaction, "date" | "amount" | "type" | "name">) =>
  `${t.date}|${t.amount.toFixed(2)}|${t.type}|${t.name.trim().toLowerCase()}`;

export function newCsvRows(rows: CsvTransaction[], existing: Transaction[]): CsvTransaction[] {
  const have = new Map<string, number>();
  for (const t of existing) have.set(dedupeKey(t), (have.get(dedupeKey(t)) ?? 0) + 1);
  return rows.filter((row) => {
    const key = dedupeKey(row);
    const left = have.get(key) ?? 0;
    if (left > 0) have.set(key, left - 1);
    return left === 0;
  });
}
