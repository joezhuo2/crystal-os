export type MailProvider = "google" | "microsoft";
export type MailCategory = "bill" | "job" | "order" | "security";
export type JobStatus = "applied" | "interview" | "offer" | "rejected" | "update";

export interface MailAccount {
  id: string;
  provider: MailProvider;
  email: string;
}

export interface StoredAccount extends MailAccount {
  refreshToken: string;
}

export interface MailStatus {
  providers: Record<MailProvider, { configured: boolean }>;
  ai: MailAiStatus;
  cache: MailCacheSettings;
  accounts: MailAccount[];
}

export interface MailAiStatus {
  provider: "claude" | "nim" | "omniroute" | "none";
  model: string;
  keyOverride: boolean;
  configured: boolean;
}

export interface MailCacheSettings {
  fetchDays: number;
  retainDays: number;
}

export interface MailDetail {
  label: string;
  value: string;
}

export interface MailExtras {
  amount?: string;
  dueDate?: string;
  company?: string;
  jobStatus?: JobStatus;
}

export interface MailItem extends MailExtras {
  id: string;
  accountId: string;
  provider: MailProvider;
  account: string;
  category: MailCategory;
  confident: boolean;
  classifiedBy: "rules" | "ai";
  from: string;
  fromAddress: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  url: string;
  details?: MailDetail[];
}

export interface MailDigest {
  generatedAt: string;
  items: MailItem[];
  errors: { accountId: string; account: string; message: string }[];
}

export interface FetchedMessage {
  messageId: string;
  from: string;
  fromAddress: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  url: string;
  text?: string;
}

export interface MailConfig {
  googleClientId?: string;
  googleClientSecret?: string;
  microsoftClientId?: string;
  microsoftClientSecret?: string;
  redirectUri?: string;
  aiProvider?: string;
  aiModel?: string;
  aiApiKey?: string;
  rootDir?: string;
}
