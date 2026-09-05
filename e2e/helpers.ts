import type { APIRequestContext, Page } from "@playwright/test";

let counter = 0;
export function unique(prefix: string): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter}`;
}

/** Signs in as a fresh parent via the dev login route (enabled by e2e/start-server.sh). */
export async function devParentLogin(request: APIRequestContext, name = "E2E Parent") {
  const sub = unique("dev:e2e-");
  await devLoginAs(request, sub, name);
  return sub;
}

/** Signs in as an existing (or new) dev parent identified by its Authentik subject. */
export async function devLoginAs(request: APIRequestContext, sub: string, name = "E2E Parent") {
  const res = await request.post("/api/auth/dev/login", {
    data: { authentikSub: sub, displayName: name },
  });
  if (!res.ok()) throw new Error(`dev login failed: ${res.status()} ${await res.text()}`);
}

export async function createFamily(request: APIRequestContext, name = "E2E Family") {
  const res = await request.post("/api/families", {
    data: { name, currencyCode: "USD", locale: "en-US", timezone: "America/Chicago" },
  });
  if (!res.ok()) throw new Error(`create family failed: ${res.status()} ${await res.text()}`);
  return (await res.json()) as { id: string; name: string };
}

export async function createChild(
  request: APIRequestContext,
  opts: { displayName: string; username: string; pin: string },
) {
  const res = await request.post("/api/children", {
    data: { ...opts, withSavings: true, savingsInterestRateBps: 500 },
  });
  if (!res.ok()) throw new Error(`create child failed: ${res.status()} ${await res.text()}`);
  return (await res.json()) as {
    user: { id: string; displayName: string };
    accounts: Array<{ id: string; type: string; name: string; balanceMinor: number }>;
    totalMinor: number;
  };
}

export async function logout(page: Page) {
  await page.request.post("/api/auth/logout");
  await page.context().clearCookies();
}

export async function kidLogin(page: Page, username: string, pin: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: /^kid$/i }).click();
  await page.getByLabel(/username/i).fill(username);
  const pinBoxes = page.locator('input[inputmode="numeric"]');
  if ((await pinBoxes.count()) > 1) {
    await pinBoxes.first().click();
    await page.keyboard.type(pin);
  } else {
    await page.getByLabel(/pin/i).fill(pin);
  }
  const signIn = page.getByRole("button", { name: /sign in/i });
  if (await signIn.isEnabled()) await signIn.click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15_000 });
}
