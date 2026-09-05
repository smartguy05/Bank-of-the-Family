/** Opaque keyset-pagination cursor: base64url of `${postedAt ISO}|${id}`. */
export function encodeCursor(postedAt: Date, id: string): string {
  return Buffer.from(`${postedAt.toISOString()}|${id}`, "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): { postedAt: Date; id: string } | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const sepIndex = raw.indexOf("|");
    if (sepIndex < 0) return null;
    const iso = raw.slice(0, sepIndex);
    const id = raw.slice(sepIndex + 1);
    if (!iso || !id) return null;
    const postedAt = new Date(iso);
    if (Number.isNaN(postedAt.getTime())) return null;
    return { postedAt, id };
  } catch {
    return null;
  }
}
