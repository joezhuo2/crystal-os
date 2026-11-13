import { describe, expect, it } from "vitest";
import { classify, extractCompany, extractDueDate } from "./classify";

const ref = new Date("2026-11-10T12:00:00Z");
const mail = (from: string, fromAddress: string, subject: string, snippet = "") => ({
  from,
  fromAddress,
  subject,
  snippet,
});

describe("classify", () => {
  it.each([
    [
      "bill",
      mail("Hydro One", "billing@hydroone.com", "Your bill is ready", "Amount due: $42.10. Payment due on Nov 20."),
      { category: "bill", confident: true, amount: "$42.10", dueDate: "2026-11-20" },
    ],
    [
      "job",
      mail("Stripe Hiring Team", "no-reply@greenhouse.io", "Thank you for applying to Stripe", "We received your application"),
      { category: "job", confident: true, company: "Stripe", jobStatus: "applied" },
    ],
    [
      "order",
      mail("Amazon.ca", "shipment-tracking@amazon.ca", "Your order has shipped", "Track your package"),
      { category: "order", confident: true },
    ],
    [
      "security",
      mail("Google", "no-reply@accounts.google.com", "Security alert", "New sign-in from Windows. If this was you, ignore"),
      { category: "security", confident: true },
    ],
  ])("classifies a %s email", (_, input, expected) => {
    expect(classify(input, ref)).toEqual(expected);
  });

  it.each([
    ["interview", "Interview invitation", "We'd like to schedule a call"],
    ["offer", "Your offer letter", "We are pleased to offer you the role"],
    ["rejected", "Your application", "Unfortunately we have decided to move forward with other candidates"],
    ["update", "Your application status", "Your application status has changed"],
  ])("reads job status %s", (status, subject, snippet) => {
    expect(classify(mail("Acme Recruiting", "jobs@acme.com", subject, snippet), ref).jobStatus).toBe(status);
  });

  it.each([
    mail("LinkedIn Job Alerts", "jobalerts-noreply@linkedin.com", "Software engineer: 30 new jobs", "Your application"),
    mail("Indeed", "alert@indeed.com", "Jobs you may like at Shopify", "Interview tips"),
    mail("Old Navy", "orders@oldnavy.com", "40% off your next order", "Your order"),
    mail("Best Buy", "news@bestbuy.ca", "Black Friday sale: order now", "Track your order"),
  ])("ignores marketing look-alikes ($subject)", (input) => {
    expect(classify(input, ref).category).toBeNull();
  });

  it("returns null without any signal", () => {
    expect(classify(mail("Mom", "mom@gmail.com", "Dinner Sunday?", "Bring dessert"), ref)).toEqual({
      category: null,
      confident: false,
    });
  });

  it("is not confident on a weak match", () => {
    expect(classify(mail("Someone", "a@b.com", "Re: the invoice", "see attached"), ref)).toMatchObject({
      category: "bill",
      confident: false,
    });
  });

  it("is not confident on a tie", () => {
    const result = classify(mail("Someone", "a@b.com", "Order and invoice", ""), ref);
    expect(result.category).not.toBeNull();
    expect(result.confident).toBe(false);
  });
});

describe("extractDueDate", () => {
  it.each([
    ["Payment due by 2026-12-01", "2026-12-01"],
    ["due on November 20, 2026", "2026-11-20"],
    ["Pay by Friday, Dec 5", "2026-12-05"],
    ["due 3 January", "2027-01-03"],
    ["Amount due: $42.10 by 11/25/2026", "2026-11-25"],
    ["Statement date November 1", undefined],
    ["due on Feb 30", undefined],
  ])("%s -> %s", (text, expected) => {
    expect(extractDueDate(text, ref)).toBe(expected);
  });
});

describe("extractCompany", () => {
  it.each([
    ["Stripe Recruiting", "no-reply@greenhouse.io", "Stripe"],
    ["Jane Doe at Shopify", "jane@hire.lever.co", "Shopify"],
    ["no-reply", "careers@acme.com", "Acme"],
    ["", "no-reply@myworkdayjobs.com", undefined],
    ["", "someone@gmail.com", undefined],
  ])("%s <%s> -> %s", (from, address, expected) => {
    expect(extractCompany(from, address)).toBe(expected);
  });
});
