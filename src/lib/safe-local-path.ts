/** Keep user-supplied return destinations on this application. */
export function safeLocalPath(next: string | null | undefined): string {
  if (
    !next?.startsWith("/") ||
    next.startsWith("//") ||
    /[\\\u0000-\u001f\u007f-\u009f]/.test(next)
  )
    return "/";
  const origin = "http://local.invalid";
  try {
    const url = new URL(next, origin);
    if (url.origin !== origin || url.pathname.startsWith("//")) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
