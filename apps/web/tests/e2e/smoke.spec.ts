import { expect, test } from "@playwright/test";

test("starts a new career and reaches the weekly planner", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Racketlon Life");
  await expect(page.getByRole("heading", { name: "Create your player" })).toBeVisible();

  await page.getByRole("button", { name: "Start career ▸" }).click();

  await expect(page.getByRole("grid", { name: "Week planner" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Home" })).toHaveClass(/active/);
  await expect(page.getByRole("button", { name: "Simulate week ▸" })).toBeVisible();
});
