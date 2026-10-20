// written-answer uploads: <user>/<attempt UUID>-<Date.now()>-<page index>.<type>.
// Before multipage uploads (migration 0014), the page index was omitted.
const filename =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[0-9]+(?:-[0-9]+)?\.(jpg|png|webp|heic|heif)$/;

/** Validate the raw key before the Storage SDK can normalise its URL. */
export function isAnswerImageKey(key: unknown, uid: string): key is string {
  if (typeof key !== "string" || !uid || /[^a-zA-Z0-9/._-]/.test(key))
    return false;
  const parts = key.split("/");
  return parts.length === 2 && parts[0] === uid && filename.test(parts[1]);
}
