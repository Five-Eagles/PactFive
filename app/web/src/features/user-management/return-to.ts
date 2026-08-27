const RETURN_TO_ALLOWLIST = new Set(["/", "/projects", "/projects/new", "/bookmarks", "/profile"]);
const PROJECT_DETAIL_PATTERN = /^\/projects\/prj_[A-Za-z0-9_-]+$/;

export function validateReturnTo(value: string): string | null {
  if (!value || value.length > 160 || !value.startsWith("/") || value.startsWith("//")) return null;
  if (value.includes("\\") || value.includes("#") || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || decoded.includes("\\") || decoded.includes("#")) return null;
  } catch {
    return null;
  }
  return RETURN_TO_ALLOWLIST.has(value) || PROJECT_DETAIL_PATTERN.test(value) ? value : null;
}

export function safeReturnToOrRoot(value: string | undefined): string {
  return value && validateReturnTo(value) ? value : "/";
}
