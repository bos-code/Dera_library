import type { DocumentType } from "../types/document";

export function typeForExtension(ext: string): DocumentType {
  switch (ext.toLowerCase()) {
    case "pdf":
      return "pdf";
    case "doc":
    case "docx":
    case "odt":
    case "rtf":
      return "word";
    case "xls":
    case "xlsx":
    case "ods":
    case "csv":
      return "sheet";
    case "ppt":
    case "pptx":
    case "odp":
      return "slides";
    case "txt":
    case "md":
    case "markdown":
      return "text";
    case "epub":
      return "epub";
    default:
      return "other";
  }
}

export const TYPE_FILTERS: Array<{ label: string; value: DocumentType | "all" }> = [
  { label: "All", value: "all" },
  { label: "PDF", value: "pdf" },
  { label: "Docs", value: "word" },
  { label: "Sheets", value: "sheet" },
  { label: "Slides", value: "slides" },
  { label: "EPUB", value: "epub" },
  { label: "Text", value: "text" },
];

export const TYPE_LABEL: Record<DocumentType, string> = {
  pdf: "PDF document",
  word: "Text document",
  sheet: "Spreadsheet",
  slides: "Presentation",
  text: "Plain text",
  epub: "E-book",
  other: "Document",
};
