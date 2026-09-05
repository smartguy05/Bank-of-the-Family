/** Display-only account numbers like "4821-0093-1207". Uniqueness is enforced by the DB. */
export function generateAccountNumber(random: () => number = Math.random): string {
  const group = () => String(Math.floor(random() * 10000)).padStart(4, "0");
  return `${group()}-${group()}-${group()}`;
}

export function maskAccountNumber(n: string): string {
  const last4 = n.replace(/\D/g, "").slice(-4);
  return `•••• ${last4}`;
}
