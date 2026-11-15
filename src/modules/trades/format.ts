export const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export const dateTime = (iso: string) => new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

export const pnlClass = (v: number) => (v > 0 ? "text-accent" : v < 0 ? "text-red-400" : "text-foreground");

export const qtyLabel = (n: number) => String(Math.round(n * 1e6) / 1e6);
