export interface TextItem { str: string; x: number; y: number; w: number; h: number; font?: string }
export interface PdfPage { index: number; width: number; height: number; items: TextItem[]; text: string; ocr?: { text: string; confidence: number; ai?: boolean } }
export interface PdfBookmark { title: string; page: number; children: PdfBookmark[] }
export interface PdfDoc { pages: PdfPage[]; outline: PdfBookmark[]; title?: string }

export interface Region { page: number; x: number; y: number; w: number; h: number }

export type ResourceType = "textbook" | "question-sheet" | "slides" | "assignment" | "past-exam" | "outline" | "other";

export interface Extracted<T> { value: T; confidence: number }

export const UNCLEAR_BELOW = 0.6;
