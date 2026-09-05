/**
 * IANA timezone options for selects. `Intl.supportedValuesOf` omits plain "UTC" in some engines
 * and may not list the browser's own resolved zone, so both are always included.
 */
export const browserTimezone: string = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
})();

export const timezones: readonly string[] = (() => {
  let list: string[] = [];
  try {
    list = Intl.supportedValuesOf("timeZone");
  } catch {
    list = [];
  }
  const set = new Set<string>(["UTC", browserTimezone, ...list]);
  return [...set].sort((a, b) => (a === "UTC" ? -1 : b === "UTC" ? 1 : a.localeCompare(b)));
})();

/** Ensures a stored value (e.g. a family's timezone) is selectable even if unknown to this engine. */
export function timezonesWith(value: string | undefined | null): readonly string[] {
  if (!value || timezones.includes(value)) return timezones;
  return [value, ...timezones];
}
