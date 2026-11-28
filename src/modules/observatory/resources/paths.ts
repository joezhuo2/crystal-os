import type { ResourceType } from "./types";

export const RESOURCE_DIRS: Record<ResourceType, string> = {
  textbook: "textbooks",
  "question-sheet": "question-sheets",
  slides: "lectures",
  assignment: "assignments",
  "past-exam": "past-exams",
  outline: "outline",
  other: "other",
};

export const INBOX = "_inbox";

export const resourceDir = (folder: string, code: string, type: ResourceType) => `${folder}/${code}/resources/${RESOURCE_DIRS[type]}`;
export const inboxDir = (folder: string) => `${folder}/${INBOX}`;

export const CONVERTIBLE = /\.(pptx?|docx|html?)$/i;
export const ACCEPTED = /\.(pdf|pptx?|docx|html?)$/i;

export const pdfStem = (fileName: string) =>
  fileName
    .replace(ACCEPTED, "")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "") || "document";

export const sidecarPath = (pdfPath: string) => pdfPath.replace(/\.pdf$/i, ".md");
export const textbookDir = (folder: string, code: string, stem: string) => `${resourceDir(folder, code, "textbook")}/${stem}`;
export const questionImagePath = (folder: string, code: string, id: string) =>
  `${folder}/${code}/resources/images/${id.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "") || "question"}.png`;
