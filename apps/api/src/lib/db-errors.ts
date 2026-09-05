/** True when a caught error is a Postgres unique-violation (SQLSTATE 23505). */
export function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "23505";
}
