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
  ai: { configured: boolean; model: string };
  accounts: MailAccount[];
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
}

export interface MailConfig {
  googleClientId?: string;
  googleClientSecret?: string;
  microsoftClientId?: string;
  microsoftClientSecret?: string;
  redirectUri?: string;
  anthropicApiKey?: string;
  aiModel?: string;
  rootDir?: string;
}
