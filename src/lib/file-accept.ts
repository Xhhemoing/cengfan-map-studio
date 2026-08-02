/** Returns true when the file matches a CSS-style accept list (e.g. image/*, .json, application/json). */
export function fileMatchesAccept(file: File, accept?: string): boolean {
  if (!accept || !accept.trim()) return true;
  const tokens = accept.split(",").map((token) => token.trim().toLowerCase()).filter(Boolean);
  if (tokens.length === 0) return true;

  const fileType = (file.type || "").toLowerCase();
  const match = file.name.toLowerCase().match(/(\.[^.]+)$/);
  const fileExt = match?.[1] ?? "";

  return tokens.some((token) => {
    if (token === "*/*") return true;
    if (token.endsWith("/*")) {
      const prefix = token.slice(0, -1); // e.g. "image/"
      return fileType.startsWith(prefix);
    }
    if (token.startsWith(".")) {
      return fileExt === token;
    }
    return fileType === token;
  });
}
