/**
 * Document service boundary.
 *
 * Prototype: files are held in browser memory only (object URLs) so they can be
 * previewed during the session. They are never written to localStorage and
 * disappear on reload. Only metadata (name, size, type) is persisted.
 *
 * Production: implement `DocumentService` against private Supabase Storage
 * (signed URLs, per-application paths, malware scanning, retention policy,
 * server-side authorisation). Nothing here is production-grade security.
 */
export const ALLOWED_DOCUMENT_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "image/png": "PNG",
  "image/jpeg": "JPG",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
};
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const ACCEPT_ATTR = ".pdf,.png,.jpg,.jpeg,.docx,.xlsx";

export interface DocumentFileInfo {
  name: string;
  size: number;
  type: string;
}

export function validateDocumentFile(file: DocumentFileInfo): string | null {
  if (!ALLOWED_DOCUMENT_TYPES[file.type]) {
    return `“${file.name}” is not an accepted file type. Use PDF, PNG, JPG, DOCX or XLSX.`;
  }
  if (file.size > MAX_DOCUMENT_BYTES) return `“${file.name}” is larger than 10 MB.`;
  if (file.size === 0) return `“${file.name}” is empty.`;
  return null;
}

export interface StoredFileRef {
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface DocumentService {
  upload(documentId: string, file: File): Promise<StoredFileRef>;
  getPreviewUrl(documentId: string): string | undefined;
  remove(documentId: string): void;
}

const memory = new Map<string, string>();

export const documentService: DocumentService = {
  async upload(documentId, file) {
    const previous = memory.get(documentId);
    if (previous) URL.revokeObjectURL(previous);
    memory.set(documentId, URL.createObjectURL(file));
    return { fileName: file.name, fileSize: file.size, mimeType: file.type };
  },
  getPreviewUrl(documentId) {
    return memory.get(documentId);
  },
  remove(documentId) {
    const url = memory.get(documentId);
    if (url) URL.revokeObjectURL(url);
    memory.delete(documentId);
  },
};

export function releaseAllDocumentFiles() {
  memory.forEach((url) => URL.revokeObjectURL(url));
  memory.clear();
}

/** Metadata for a fictional file, used by the "attach sample document" shortcut. */
export function sampleFile(label: string): StoredFileRef {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return { fileName: `sample-${slug}.pdf`, fileSize: 184_320, mimeType: "application/pdf" };
}

export function formatFileSize(bytes?: number): string {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
