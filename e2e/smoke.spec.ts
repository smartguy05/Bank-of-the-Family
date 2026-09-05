import { expect, test } from "@playwright/test";
import { createChild, devLoginAs, devParentLogin, kidLogin, logout, unique } from "./helpers";

test.describe("Bank of the Family smoke", () => {
  test("parent onboards, funds a child; kid sees balance, asks for money, parent approves", async ({
    page,
  }) => {
    const username = unique("kid");
    const pin = "2468";

    // --- Parent: sign in (dev login) and land on onboarding ---
    const parentSub = await devParentLogin(page.request, "Jordan");
    await page.goto("/");
    await expect(page).toHaveURL(/\/onboarding/);
    await page.getByLabel(/family name/i).fill("Smoke Family");
    await page
      .getByRole("button", { name: /create|continue|get started/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText(/total/i).first()).toBeVisible();

    // --- Parent: add a child through the API contract, then deposit through the UI ---
    const child = await createChild(page.request, { displayName: "Riley", username, pin });
    const checking = child.accounts.find((a) => a.type === "checking")!;
    await page.goto(`/children/${child.user.id}`);
    await expect(page.getByText("Riley").first()).toBeVisible();
    await page
      .getByRole("button", { name: /^deposit$/i })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/amount/i).fill("12.50");
    const memo = dialog.getByLabel(/memo/i);
    if (await memo.count()) await memo.fill("Weekly allowance");
    await dialog
      .getByRole("button", { name: /deposit/i })
      .last()
      .click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("$12.50").first()).toBeVisible();

    // --- Kid: sign in with PIN, see balance and the transaction ---
    await logout(page);
    await kidLogin(page, username, pin);
    await expect(page.getByText("$12.50").first()).toBeVisible();
    await page.goto(`/accounts/${checking.id}`);
    await expect(page.getByText(/weekly allowance|deposit/i).first()).toBeVisible();

    // --- Kid: ask for money ---
    await page.goto("/requests");
    await page
      .getByRole("button", { name: /ask for money|new request/i })
      .first()
      .click();
    const reqDialog = page.getByRole("dialog");
    await reqDialog.getByLabel(/amount/i).fill("5");
    await reqDialog.getByLabel(/reason|what for/i).fill("Ice cream");
    await reqDialog
      .getByRole("button", { name: /send|submit|ask/i })
      .last()
      .click();
    await expect(reqDialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("Ice cream")).toBeVisible();

    // --- Parent: approve the request ---
    await logout(page);
    await devLoginAs(page.request, parentSub, "Jordan");
    await page.goto("/requests");
    await expect(page.getByText("Ice cream")).toBeVisible();
    await page
      .getByRole("button", { name: /approve/i })
      .first()
      .click();
    const decide = page.getByRole("dialog");
    if (await decide.isVisible()) {
      await decide
        .getByRole("button", { name: /approve/i })
        .last()
        .click();
      await expect(decide).toBeHidden({ timeout: 10_000 });
    }
    await page.goto("/");
    await expect(page.getByText("$7.50").first()).toBeVisible();

    // --- Kid: sees the payout and a notification ---
    await logout(page);
    await kidLogin(page, username, pin);
    await expect(page.getByText("$7.50").first()).toBeVisible();
    await page.goto("/notifications");
    await expect(page.getByText(/approved/i).first()).toBeVisible();
  });

  test("kid PIN lockout after repeated failures", async ({ page }) => {
    const username = unique("lock");
    await devParentLogin(page.request, "Casey");
    await page.request.post("/api/families", {
      data: { name: "Lock Family", currencyCode: "USD", locale: "en-US", timezone: "UTC" },
    });
    await createChild(page.request, { displayName: "Lockie", username, pin: "1111" });
    await logout(page);
    for (let i = 0; i < 5; i += 1) {
      const res = await page.request.post("/api/auth/child/login", {
        data: { username, pin: "9999" },
      });
      expect([401, 423]).toContain(res.status());
    }
    const locked = await page.request.post("/api/auth/child/login", {
      data: { username, pin: "1111" },
    });
    expect(locked.status()).toBe(423);
  });
});
