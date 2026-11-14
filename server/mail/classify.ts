import type { JobStatus, MailCategory, MailExtras } from "./types";

export interface ClassifyInput {
  from: string;
  fromAddress: string;
  subject: string;
  snippet: string;
}

export interface Classification extends MailExtras {
  category: MailCategory | null;
  confident: boolean;
}

const CATEGORIES: MailCategory[] = ["bill", "job", "order", "security"];
const STRONG = 3;

const ATS_LABELS = new Set([
  "greenhouse",
  "greenhouse-mail",
  "lever",
  "workday",
  "myworkday",
  "myworkdayjobs",
  "ashbyhq",
  "smartrecruiters",
  "icims",
]);
const JOB_BOARD_LABELS = new Set(["linkedin", "indeed", "glassdoor", "ziprecruiter", "joinhandshake", "wellfound", "dice", "monster"]);
const PERSONAL_DOMAINS = new Set(["gmail", "googlemail", "outlook", "hotmail", "live", "yahoo", "icloud", "proton", "protonmail"]);

const MARKETING = [
  /\bjob alerts?\b/,
  /\bjobs? (you may|you might|for you|matching)\b/,
  /\brecommended jobs\b/,
  /\bnew jobs\b/,
  /\d+\s?% off\b/,
  /\bsale\b/,
  /\bnewsletter\b/,
  /\bpromo code\b/,
  /\bcoupon\b/,
  /\bwebinar\b/,
];

const RULES: Record<MailCategory, { sender: RegExp; terms: RegExp[] }> = {
  bill: {
    sender: /\b(billing|invoices?|ebill|statements?|payments?)\b/,
    terms: [
      /\b(bill|invoice|statement)\b/,
      /\b(amount|balance|payment) due\b/,
      /\bdue (date|on|by)\b/,
      /\bpast due\b/,
      /\bminimum payment\b/,
      /\bautopay\b/,
      /\bpay(ment)? reminder\b/,
    ],
  },
  job: {
    sender: /\b(careers?|recruit(ing|er|ment)?|talent|hiring)\b/,
    terms: [
      /\byour application\b/,
      /\bthank you for applying\b/,
      /\bapplication (received|submitted|status|update)\b/,
      /\binterview\b/,
      /\b(offer letter|job offer)\b/,
      /\b(position|role) (of|at|for|with)\b/,
      /\bcandida(te|cy)\b/,
      /\bhiring (team|manager)\b/,
      /\brecruit(er|ing)\b/,
    ],
  },
  order: {
    sender: /\b(orders?|shipping|shipment|ship-confirm|auto-confirm|delivery|receipts?)\b/,
    terms: [
      /\border\b/,
      /\bshipped\b/,
      /\bout for delivery\b/,
      /\bdelivered\b/,
      /\btracking\b/,
      /\byour package\b/,
      /\breceipt\b/,
      /\bpurchase\b/,
    ],
  },
  security: {
    sender: /\b(security|account-?security|verify|verification)\b/,
    terms: [
      /\bsecurity (alert|code|notice)\b/,
      /\b(new|unusual|suspicious) (sign[- ]?in|login|activity|device)\b/,
      /\bsign[- ]?in (attempt|alert|from)\b/,
      /\bverification code\b/,
      /\b(one[- ]time (code|password|passcode)|otp|2fa|two[- ]factor|passcode)\b/,
      /\bpassword (reset|changed|change)\b/,
      /\breset your password\b/,
      /\bverify your (email|account|identity)\b/,
    ],
  },
};

const JOB_STATUS: [JobStatus, RegExp][] = [
  ["rejected", /\b(unfortunately|not (to )?(be )?mov(e|ing) forward|other candidates|not been selected|decided to pursue|regret to inform)\b/],
  ["offer", /\b(offer letter|job offer|pleased to offer|extend an offer)\b/],
  ["interview", /\b(interview|phone screen|schedule a (call|time|chat))\b/],
  ["applied", /\b(thank you for (applying|your application|your interest)|application (received|submitted)|received your application|you applied)\b/],
];

export const AMOUNT =
  /(?:(?:US|CA|C|A)?\$|[€£¥]|\b(?:USD|CAD|EUR|GBP)\s?)\s?\d[\d,]*(?:\.\d{1,2})?|\b\d[\d,]*(?:\.\d{2})?\s?(?:USD|CAD|EUR|GBP)\b/;

const MONTH = String.raw`(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?`;
const DUE_DATE = new RegExp(
  String.raw`\b(?:due(?:\s+date)?|pay(?:ment)?\s+by|payable\s+by)\b[^\n!?]{0,30}?` +
    String.raw`(?:(\d{4})-(\d{2})-(\d{2})` +
    String.raw`|${MONTH}\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s+(\d{4}))?` +
    String.raw`|(\d{1,2})(?:st|nd|rd|th)?\s+${MONTH}(?:,?\s+(\d{4}))?` +
    String.raw`|(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?)`,
  "i",
);
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function domainLabels(fromAddress: string): string[] {
  return (fromAddress.split("@")[1] ?? "").toLowerCase().split(".").filter(Boolean);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function extractDueDate(text: string, reference: Date): string | undefined {
  const m = DUE_DATE.exec(text);
  if (!m) return undefined;
  let year: number | null;
  let month: number;
  let day: number;
  if (m[1]) [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else if (m[4]) [year, month, day] = [m[6] ? Number(m[6]) : null, MONTHS.indexOf(m[4].toLowerCase()) + 1, Number(m[5])];
  else if (m[8]) [year, month, day] = [m[9] ? Number(m[9]) : null, MONTHS.indexOf(m[8].toLowerCase()) + 1, Number(m[7])];
  // shortcut: n/n dates are read as US month/day, add a locale setting if non-US senders show up
  else [year, month, day] = [m[12] ? Number(m[12]) : null, Number(m[10]), Number(m[11])];
  if (year !== null && year < 100) year += 2000;

  const refYear = reference.getUTCFullYear();
  let y = year ?? refYear;
  const valid = (yy: number) => {
    const d = new Date(Date.UTC(yy, month - 1, day));
    return d.getUTCMonth() === month - 1 && d.getUTCDate() === day ? d : null;
  };
  let date = valid(y);
  if (!date) return undefined;
  if (year === null && date.getTime() < reference.getTime() - 60 * 86_400_000) {
    y += 1;
    date = valid(y);
    if (!date) return undefined;
  }
  return `${y}-${pad(month)}-${pad(day)}`;
}

export function extractCompany(from: string, fromAddress: string): string | undefined {
  if (domainLabels(fromAddress).some((l) => JOB_BOARD_LABELS.has(l))) return undefined;
  let name = from.includes("@") ? "" : from.trim();
  const at = /\bat\s+(.+)$/i.exec(name);
  if (at) name = at[1];
  let previous;
  do {
    previous = name;
    name = name
      .replace(/\s*[-|,:]?\s*\b(recruiting|recruitment|careers?|talent( acquisition)?|hiring|jobs|people|hr|team|via .*)$/i, "")
      .trim();
  } while (name && name !== previous);
  if (name && !/^(no-?reply|notifications?|do not reply|donotreply)$/i.test(name)) return name;

  const labels = domainLabels(fromAddress);
  if (labels.length < 2 || labels.some((l) => ATS_LABELS.has(l))) return undefined;
  const label = labels[labels.length - 2];
  if (PERSONAL_DOMAINS.has(label)) return undefined;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function classify(input: ClassifyInput, reference: Date): Classification {
  const subject = input.subject.toLowerCase();
  const snippet = input.snippet.toLowerCase();
  const sender = `${input.from} ${input.fromAddress}`.toLowerCase();

  if (MARKETING.some((re) => re.test(subject) || re.test(input.from.toLowerCase()))) {
    return { category: null, confident: false };
  }

  const isAts = domainLabels(input.fromAddress).some((l) => ATS_LABELS.has(l));
  const scores = CATEGORIES.map((category) => {
    const rule = RULES[category];
    let score = rule.sender.test(sender) ? 2 : 0;
    if (category === "job" && isAts) score += 3;
    for (const term of rule.terms) {
      if (term.test(subject)) score += 2;
      if (term.test(snippet)) score += 1;
    }
    return { category, score };
  }).sort((a, b) => b.score - a.score);

  const [top, second] = scores;
  if (top.score === 0) return { category: null, confident: false };

  const result: Classification = {
    category: top.category,
    confident: top.score >= STRONG && top.score > second.score,
  };
  const text = `${input.subject}\n${input.snippet}`;

  if (top.category === "bill") {
    const amount = AMOUNT.exec(text)?.[0].trim();
    const dueDate = extractDueDate(text, reference);
    if (amount) result.amount = amount;
    if (dueDate) result.dueDate = dueDate;
  }
  if (top.category === "job") {
    const company = extractCompany(input.from, input.fromAddress);
    if (company) result.company = company;
    const lower = text.toLowerCase();
    result.jobStatus = JOB_STATUS.find(([, re]) => re.test(lower))?.[0] ?? "update";
  }
  return result;
}
