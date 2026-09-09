import { expect, test, type Page } from "@playwright/test";
import {
  createChild,
  createFamily,
  devLoginAs,
  devParentLogin,
  kidLogin,
  logout,
  unique,
} from "./helpers";

const SHOTS = process.env.E2E_SHOTS_DIR;
async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

/** The IOU card that mentions `reason` (cards are the `py-4` rows inside the list). */
function iouCard(page: Page, reason: string) {
  return page.locator("div.py-4").filter({ hasText: reason }).first();
}

test.describe("IOUs", () => {
  test("kid records and part-pays an IOU, sibling proposes one, parent settles and forgives", async ({
    page,
  }) => {
    const rileyUser = unique("riley");
    const samUser = unique("sam");
    const pin = "1357";

    // --- Parent: family, two kids, fund Riley through the API contract ---
    const parentSub = await devParentLogin(page.request, "Jordan");
    await createFamily(page.request, "IOU Family");
    const riley = await createChild(page.request, {
      displayName: "Riley",
      username: rileyUser,
      pin,
    });
    const sam = await createChild(page.request, { displayName: "Sam", username: samUser, pin });
    const rileyChecking = riley.accounts.find((a) => a.type === "checking")!;
    const deposit = await page.request.post("/api/transactions/deposit", {
      data: { accountId: rileyChecking.id, amountMinor: 2000, category: "gift", memo: "Seed" },
    });
    expect(deposit.ok()).toBe(true);

    // --- Riley: "I owe Sam $5" opens immediately ---
    await logout(page);
    await kidLogin(page, rileyUser, pin);
    await page.goto("/requests");
    await page.getByRole("tab", { name: "IOUs" }).click();
    await expect(page.getByText("No IOUs yet")).toBeVisible();
    await page.getByRole("button", { name: /record an iou/i }).click();
    let dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "I owe", pressed: true })).toBeVisible();
    await dialog.getByLabel(/sibling/i).selectOption(sam.user.id);
    await dialog.getByLabel(/amount/i).fill("5");
    await dialog.getByLabel(/what.?s it for/i).fill("Arcade tokens");
    await dialog.getByRole("button", { name: /record iou/i }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    const arcade = iouCard(page, "Arcade tokens");
    await expect(arcade.getByText("You owe Sam")).toBeVisible();
    await expect(arcade.getByText("Open")).toBeVisible();
    await expect(arcade.getByText("$5.00")).toBeVisible();
    await shot(page, "1-kid-iou-open");

    // --- Riley: pays $2 of it ---
    await arcade.getByRole("button", { name: /^pay$/i }).click();
    dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel(/amount/i)).toHaveValue("5.00");
    await dialog.getByLabel(/amount/i).fill("2");
    await dialog.getByRole("button", { name: /^pay$/i }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(arcade.getByText("$3.00")).toBeVisible();
    await expect(arcade.getByText("1 payment")).toBeVisible();
    await arcade.getByText("1 payment").click();
    await expect(arcade.getByRole("link", { name: /view receipt/i })).toBeVisible();
    await shot(page, "2-kid-iou-partly-paid");

    // --- Sam: claims Riley owes $4; it needs Riley's OK ---
    await logout(page);
    await kidLogin(page, samUser, pin);
    await page.goto("/requests");
    await page.getByRole("tab", { name: "IOUs" }).click();
    await expect(iouCard(page, "Arcade tokens").getByText("Riley owes you")).toBeVisible();
    await page.getByRole("button", { name: /record an iou/i }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Owes me" }).click();
    await dialog.getByLabel(/sibling/i).selectOption(riley.user.id);
    await dialog.getByLabel(/amount/i).fill("4");
    await dialog.getByLabel(/what.?s it for/i).fill("Movie ticket");
    await dialog.getByRole("button", { name: /record iou/i }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(iouCard(page, "Movie ticket").getByText("Needs OK")).toBeVisible();
    await shot(page, "3-sibling-proposed");

    // --- Riley: accepts the claim ---
    await logout(page);
    await kidLogin(page, rileyUser, pin);
    await page.goto("/requests");
    await page.getByRole("tab", { name: "IOUs" }).click();
    await expect(page.getByRole("heading", { name: /needs your ok/i })).toBeVisible();
    await iouCard(page, "Movie ticket")
      .getByRole("button", { name: /accept/i })
      .click();
    await expect(iouCard(page, "Movie ticket").getByText("Open")).toBeVisible();
    await page.goto("/notifications");
    await expect(page.getByText(/says you owe/i).first()).toBeVisible();

    // --- Parent: settles the arcade IOU from Riley's account, forgives the other ---
    await logout(page);
    await devLoginAs(page.request, parentSub, "Jordan");
    await page.goto("/requests");
    await page.getByRole("tab", { name: "IOUs" }).click();
    await expect(iouCard(page, "Arcade tokens").getByText("Riley owes Sam")).toBeVisible();
    await shot(page, "4-parent-ious-active");
    await iouCard(page, "Arcade tokens")
      .getByRole("button", { name: /pay from account/i })
      .click();
    dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel(/amount/i)).toHaveValue("3.00");
    await dialog.getByRole("button", { name: /^pay$/i }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(iouCard(page, "Arcade tokens").getByText("Settled")).toBeVisible();
    await expect(iouCard(page, "Arcade tokens").getByText("2 payments")).toBeVisible();

    await iouCard(page, "Movie ticket")
      .getByRole("button", { name: /forgive/i })
      .click();
    await expect(iouCard(page, "Movie ticket").getByText("Forgiven")).toBeVisible();
    // Nothing was paid on the forgiven one, so it can still be deleted; the settled one cannot.
    await expect(
      iouCard(page, "Movie ticket").getByRole("button", { name: /delete/i }),
    ).toBeVisible();
    await expect(
      iouCard(page, "Arcade tokens").getByRole("button", { name: /delete/i }),
    ).toHaveCount(0);
    await shot(page, "5-parent-ious-history");

    // The Family tab (sibling requests) is now visible to parents too.
    await page.getByRole("tab", { name: "Family" }).click();
    await expect(page.getByText("No sibling requests")).toBeVisible();

    // --- Money actually moved: Riley 20 - 5 = 15, Sam 0 + 5 = 5 ---
    const children = (await (await page.request.get("/api/children")).json()) as Array<{
      user: { id: string };
      totalMinor: number;
    }>;
    expect(children.find((c) => c.user.id === riley.user.id)?.totalMinor).toBe(1500);
    expect(children.find((c) => c.user.id === sam.user.id)?.totalMinor).toBe(500);

    // The child detail page shows the same IOUs.
    await page.goto(`/children/${riley.user.id}`);
    await expect(page.getByRole("heading", { name: "IOUs" })).toBeVisible();
    await expect(iouCard(page, "Arcade tokens").getByText("Settled")).toBeVisible();
    await shot(page, "6-parent-child-detail");
  });
});
