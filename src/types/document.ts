export type DocumentType="pdf"|"word"|"sheet"|"slides"|"text"|"epub"|"other";
export type SortMode="modified-desc"|"name-asc"|"size-desc";
export interface DocumentRecord{uri:string;name:string;extension:string;mimeType:string;size:number;modifiedAt:number;folder:string|null;type:DocumentType;indexedAt:number}
export type ScannedDocument=Omit<DocumentRecord,"type"|"indexedAt">;
