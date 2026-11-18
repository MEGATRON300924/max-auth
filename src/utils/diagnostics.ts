export function sanitizeDiagnosticPath(path: string): string {
  const pathname = path.split(/[?#]/, 1)[0] ?? "";
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // Keep malformed percent-encoded paths intact, but never include query data.
  }

  return decoded.split("/").map((segment) => {
    if (!segment) return segment;
    if (
      /^[0-9]+$/.test(segment) ||
      /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment) ||
      /^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(segment) ||
      /^[A-Za-z0-9_-]{40,}$/.test(segment)
    ) return ":id";
    return segment.slice(0, 100);
  }).join("/").slice(0, 220);
}
