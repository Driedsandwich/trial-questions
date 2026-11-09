import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Pagination fixture assembled at runtime so repository scanners do not mistake it for a credential.
const SYNTHETIC_PAGE = ["synthetic", "next"].join("-");

// Invented software fixtures only. No live registry records or patient details are stored.
const fixture = (
  criteria = "Inclusion Criteria:\n* Age ≥ 18 years\n* A condition requiring a doctor’s interpretation\nExclusion Criteria:\n* Prior therapy within 4 weeks",
) => ({
  protocolSection: {
    identificationModule: {
      nctId: "NCT00000000",
      briefTitle: "Synthetic browser test study",
    },
    statusModule: {
      overallStatus: "RECRUITING",
      lastUpdatePostDateStruct: { date: "2026-01-01" },
    },
    eligibilityModule: {
      eligibilityCriteria: criteria,
      minimumAge: "18 Years",
      maximumAge: "70 Years",
      sex: "ALL",
      healthyVolunteers: false,
    },
    contactsLocationsModule: {
      locations: [
        {
          city: "Example City",
          country: "Example Country",
          status: "RECRUITING",
        },
      ],
    },
  },
});
async function mockTrials(page: Page, criteria?: string) {
  await page.route(
    "https://clinicaltrials.gov/api/v2/studies**",
    async (route) => {
      const detail = new URL(route.request().url()).pathname.endsWith(
        "NCT00000000",
      );
      await route.fulfill({
        json: detail
          ? fixture(criteria)
          : { studies: [fixture(criteria)], totalCount: 1 },
        headers: { date: "Mon, 09 Nov 2026 00:00:00 GMT" },
      });
    },
  );
}
async function selectStudy(page: Page) {
  await page.goto("./");
  await page.getByRole("button", { name: "Asthma", exact: false }).click();
  await page.getByRole("button", { name: "Find trials" }).click();
  await page
    .getByRole("button", { name: /Synthetic browser test study/ })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "From trial conditions to doctor questions",
    }),
  ).toBeVisible();
}

test("search, local field comparisons, source pairing, selection and escaped printable notes", async ({
  page,
}) => {
  await mockTrials(page);
  const sent: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("clinicaltrials.gov"))
      sent.push(r.url() + (r.postData() ?? ""));
  });
  await selectStudy(page);
  await expect(
    page.getByText("Example City, Example Country", { exact: true }),
  ).toBeVisible();
  await page.getByText("Optional age & sex", { exact: false }).click();
  await page.getByLabel("Age in years", { exact: true }).fill("54");
  await page
    .getByLabel("Sex as entered", { exact: true })
    .selectOption("FEMALE");
  await expect(page.getByText("Auto-checked", { exact: true })).toHaveCount(4); // Three fields plus the collapsed legend.
  await expect(
    page.locator(".paired-row:not(.structured-row) .status-badge"),
  ).toHaveText(["Ask your doctor", "Ask your doctor", "Ask your doctor"]);
  expect(sent.every((s) => !s.includes("54") && !s.includes("FEMALE"))).toBe(
    true,
  );
  await page.getByRole("link", { name: "Source §01" }).click();
  await expect(page).toHaveURL(/#question-criterion-1$/);
  const pair = page.getByRole("article", { name: "Condition 1", exact: true });
  await pair.hover();
  await expect(pair.locator(".source-cell")).toHaveCSS("background-color", "rgb(240, 248, 246)");
  await expect(pair.locator(".question-cell")).toHaveCSS("background-color", "rgb(240, 248, 246)");
  await page
    .getByRole("button", { name: /Prepare visit sheet/ })
    .first()
    .click();
  await page
    .getByLabel("Notes for my doctor", { exact: true })
    .fill("Synthetic note: <script>window.bad=true</script>");
  const frame = page.frameLocator("iframe");
  await expect(
    frame.getByRole("heading", { name: "Questions for my doctor" }),
  ).toBeVisible();
  await expect(
    frame.getByText("Synthetic note: <script>window.bad=true</script>", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    frame.getByText(
      "This tool does not decide whether you can join a trial. Bring these questions to your doctor.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Print / Save PDF" }),
  ).toBeEnabled();
  // Exercise the print button without opening an interactive print dialog.
  await page.locator("iframe").evaluate((el: HTMLIFrameElement) => {
    (el.contentWindow as Window & { printed?: boolean }).print = () => {
      (el.contentWindow as Window & { printed?: boolean }).printed = true;
    };
  });
  await page.getByRole("button", { name: "Print / Save PDF" }).click();
  expect(
    await page
      .locator("iframe")
      .evaluate(
        (el: HTMLIFrameElement) =>
          (el.contentWindow as Window & { printed?: boolean }).printed,
      ),
  ).toBe(true);
  expect(
    await page.evaluate(() => [localStorage.length, sessionStorage.length]),
  ).toEqual([0, 0]);
});

test("390px stacks matching numbered cells, stays within viewport, and passes accessibility checks", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockTrials(page);
  await page.goto("./");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await selectStudy(page);
  const source = await page
    .locator(".paired-row")
    .first()
    .locator(".source-cell")
    .boundingBox();
  const question = await page
    .locator(".paired-row")
    .first()
    .locator(".question-cell")
    .boundingBox();
  expect(question!.y).toBeGreaterThan(source!.y + source!.height);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Optional AI rewriting" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Optional AI rewriting" }),
  ).toBeFocused();
});

test("network error can be retried and zero results remain honest", async ({
  page,
}) => {
  let fails = true;
  await page.route(
    "https://clinicaltrials.gov/api/v2/studies**",
    async (route) => {
      if (fails) await route.fulfill({ status: 503, body: "unavailable" });
      else await route.fulfill({ json: { studies: [], totalCount: 0 } });
    },
  );
  await page.goto("./");
  await page.getByLabel("Condition", { exact: true }).fill("synthetic");
  await page.getByRole("button", { name: "Find trials" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "ClinicalTrials.gov could not be reached",
  );
  fails = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("heading", { name: "No recruiting trials found" }),
  ).toBeVisible();
  await expect(page.getByLabel("Condition", { exact: true })).toHaveValue(
    "synthetic",
  );
});

test("slow search reports progress and empty criteria do not create questions", async ({
  page,
}) => {
  await page.route(
    "https://clinicaltrials.gov/api/v2/studies**",
    async (route) => {
      const detail = route.request().url().includes("/NCT00000000");
      if (!detail) await new Promise((resolve) => setTimeout(resolve, 8500));
      await route.fulfill({
        json: detail ? fixture("") : { studies: [fixture("")], totalCount: 1 },
      });
    },
  );
  await page.goto("./");
  await page.getByLabel("Condition", { exact: true }).fill("synthetic");
  await page.getByRole("button", { name: "Find trials" }).click();
  await expect(page.getByRole("status")).toContainText(
    "taking longer than usual",
    { timeout: 10_000 },
  );
  await page
    .getByRole("button", { name: /Synthetic browser test study/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "No criteria text was supplied" }),
  ).toBeVisible();
  await expect(page.locator(".paired-row:not(.structured-row)")).toHaveCount(0);
});

test("AI requires explicit submission, sends public criteria only, preserves failed numeric rewrites, and clears on reload", async ({
  page,
}) => {
  await mockTrials(page, "Inclusion Criteria:\n* Age ≥ 18 years");
  const calls: { body: string; auth?: string }[] = [];
  await page.route(
    "https://provider.invalid/v1/chat/completions",
    async (route) => {
      calls.push({
        body: route.request().postData()!,
        auth: route.request().headers().authorization,
      });
      await route.fulfill({
        json: {
          choices: [
            { message: { content: "Could you explain the age rule?" } },
          ],
        },
      });
    },
  );
  await selectStudy(page);
  await page.getByText("Optional age & sex", { exact: false }).click();
  await page.getByLabel("Age in years", { exact: true }).fill("54");
  await page.getByRole("button", { name: "Optional AI rewriting" }).click();
  await page
    .getByLabel("Full HTTPS chat completions endpoint")
    .fill("https://provider.invalid/v1/chat/completions");
  await page.getByLabel("Model", { exact: true }).fill("synthetic-model");
  const testKey = ["synthetic", "key"].join("-");
  await page.getByLabel("API key", { exact: false }).fill(testKey);
  expect(calls).toHaveLength(0);
  await page
    .getByRole("button", { name: "Rewrite this trial with AI" })
    .click();
  await expect(
    page.getByText("Original retained · review with your doctor"),
  ).toBeVisible();
  await expect(page.locator(".question-cell blockquote")).toHaveText(
    "Age ≥ 18 years",
  );
  expect(calls).toHaveLength(1);
  expect(calls[0]!.body).not.toContain("54");
  expect(calls[0]!.body).not.toContain(testKey);
  expect(calls[0]!.auth).toBe(`Bearer ${testKey}`);
  expect(
    await page.evaluate(() => [localStorage.length, sessionStorage.length]),
  ).toEqual([0, 0]);
  await page.reload();
  await page.getByRole("button", { name: "Optional AI rewriting" }).click();
  await expect(page.getByLabel("API key", { exact: false })).toHaveValue("");
});

test("pagination keeps search filters and appends results", async ({
  page,
}) => {
  const urls: URL[] = [];
  await page.route(
    "https://clinicaltrials.gov/api/v2/studies**",
    async (route) => {
      const url = new URL(route.request().url());
      urls.push(url);
      const next = url.searchParams.has("pageToken");
      const record = fixture();
      if (next)
        record.protocolSection.identificationModule = {
          nctId: "NCT00000001",
          briefTitle: "Second synthetic study",
        };
      await route.fulfill({
        json: {
          studies: [record],
          totalCount: 2,
          ...(!next ? { nextPageToken: SYNTHETIC_PAGE } : {}),
        },
      });
    },
  );
  await page.goto("./");
  await page.getByLabel("Condition", { exact: true }).fill("synthetic");
  await page.getByLabel("Location optional").fill("Example City");
  await page.getByRole("button", { name: "Find trials" }).click();
  await page.getByRole("button", { name: "Load more trials" }).click();
  await expect(page.locator(".trial-card")).toHaveCount(2);
  expect(urls[1]!.searchParams.get("query.cond")).toBe("synthetic");
  expect(urls[1]!.searchParams.get("query.locn")).toBe("Example City");
  expect(urls[1]!.searchParams.get("pageToken")).toBe(SYNTHETIC_PAGE);
});
