import { AMOUNT } from "./classify";
import type { MailDetail } from "./types";

const ID = String.raw`((?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{4,33})`;
const ORDER_NUMBER = new RegExp(String.raw`\border\s*(?:number|no\.?|id|confirmation)?\s*(?:is\s*)?[:#]?\s*#?\s*${ID}`, "i");
const TRACKING = new RegExp(String.raw`\btracking\s*(?:number|no\.?|id|code)?\s*(?:is\s*)?[:#]?\s*#?\s*${ID}`, "i");
const TOTAL = new RegExp(String.raw`\b(?:order |grand )?total\b[^\n\d$€£¥]{0,30}(${AMOUNT.source})`, "i");
const CARRIER = /\b(UPS|FedEx|USPS|DHL|Canada Post|Purolator|Amazon Logistics|OnTrac|Royal Mail|Australia Post)\b/i;
const MONTH = String.raw`(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?`;
const ARRIVING = new RegExp(
  String.raw`\b(?:arriving|arrives|estimated (?:delivery|arrival)|delivery (?:date|estimate)|expected (?:delivery|by|on)|deliver(?:y|ed)? by)\b[^\n]{0,20}?` +
    String.raw`((?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+)?${MONTH}\s+\d{1,2}(?:,?\s+\d{4})?|today|tomorrow)`,
  "i",
);
const STATUS: [string, RegExp][] = [
  ["Refunded", /\b(refunded|your refund|refund (issued|processed|initiated|confirmation))\b/i],
  ["Out for delivery", /\bout for delivery\b/i],
  ["Delivered", /\b(was|were|been|has|have) delivered\b|(^|\n)\s*delivered\b|\bdelivered[:!]/i],
  ["Shipped", /\b(shipped|on (its|the) way|in transit)\b/i],
  ["Confirmed", /\b(order (confirm(ed|ation)|received|placed)|thanks? (you )?for your (order|purchase)|receipt)\b/i],
];
const ITEM_LINES = [/^\s*(\d{1,3})\s*[x×]\s+(\S.{2,80})$/gim, /^\s*(\S.{2,80}?)\s+(?:qty|quantity)\s*:?\s*(\d{1,3})\s*$/gim];
const MAX_ITEMS = 5;

export function extractOrderDetails(subject: string, body: string): MailDetail[] {
  const text = `${subject}\n${body}`;
  const out: MailDetail[] = [];
  const add = (label: string, value: string | undefined) => {
    if (value?.trim()) out.push({ label, value: value.trim().slice(0, 120) });
  };

  add("Status", (STATUS.find(([, re]) => re.test(subject)) ?? STATUS.find(([, re]) => re.test(text)))?.[0]);
  add("Order number", ORDER_NUMBER.exec(text)?.[1]);
  add("Total", TOTAL.exec(text)?.[1]);
  add("Arriving", ARRIVING.exec(text)?.[1]);
  add("Carrier", CARRIER.exec(text)?.[1]);
  add("Tracking", TRACKING.exec(text)?.[1]);

  const items: string[] = [];
  for (const m of body.matchAll(ITEM_LINES[0])) items.push(`${m[1]} × ${m[2].trim()}`);
  for (const m of body.matchAll(ITEM_LINES[1])) items.push(`${m[2]} × ${m[1].trim()}`);
  add("Items", items.slice(0, MAX_ITEMS).join("; "));
  return out;
}
