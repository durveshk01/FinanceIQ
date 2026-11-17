export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_REQUEST = 5;
export const MAX_TRANSACTIONS = 10000;
const extensions = new Set(["pdf", "csv", "xlsx", "txt"]);
const mimeTypes = new Set([
  "application/pdf",
  "text/csv",
  "text/plain",
  "application/csv",
  "text/comma-separated-values",
  "application/vnd.ms-excel",
  "application/octet-stream",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export function getExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

export function validateUploadFiles(
  files: File[],
): { ok: true } | { ok: false; message: string } {
  if (!files.length)
    return {
      ok: false,
      message: "Select at least one PDF, CSV, XLSX, or TXT statement.",
    };
  if (files.length > MAX_FILES_PER_REQUEST)
    return {
      ok: false,
      message: `Select up to ${MAX_FILES_PER_REQUEST} statements at a time.`,
    };
  for (const file of files) {
    if (!extensions.has(getExtension(file.name)))
      return {
        ok: false,
        message: `${file.name} is not supported. Use PDF, CSV, XLSX, or TXT; convert legacy XLS files to XLSX first.`,
      };
    if (file.size === 0)
      return { ok: false, message: `${file.name} is empty.` };
    if (file.size > MAX_FILE_SIZE_BYTES)
      return {
        ok: false,
        message: `${file.name} exceeds the 10 MB statement limit.`,
      };
    if (file.type && !mimeTypes.has(file.type))
      return {
        ok: false,
        message: `${file.name} has an unsupported file type.`,
      };
  }
  return { ok: true };
}
