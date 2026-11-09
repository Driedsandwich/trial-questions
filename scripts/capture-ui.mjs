import { chromium } from "@playwright/test";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { resolve, relative, isAbsolute, join } from "node:path";

const outputArg = process.argv[2];
if (!outputArg)
  throw new Error("Pass an artifact output directory outside the repository.");
await mkdir(resolve(outputArg), { recursive: true });
const output = await realpath(resolve(outputArg));
const repository = await realpath(new URL("..", import.meta.url));
const difference = relative(repository, output);
if (!difference || (!difference.startsWith("..") && !isAbsolute(difference))) {
  throw new Error("Live screenshots must be stored outside the repository.");
}
const url = process.argv[3] ?? "http://127.0.0.1:4174/trial-questions/";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const capture = async (name, fullPage = false) =>
    page.screenshot({ path: join(output, `${name}.png`), fullPage });
  await page.goto(url);
  await capture("desktop-search", true);
  await page.getByRole("button", { name: "Asthma", exact: false }).click();
  await page.getByRole("button", { name: "Find trials" }).click();
  await page.locator(".trial-card").first().waitFor({ timeout: 45_000 });
  await capture("desktop-trials", true);
  await page.locator(".trial-card").first().click();
  await page.locator(".paired-row").first().waitFor({ timeout: 45_000 });
  await page.evaluate(() => scrollTo(0, 0));
  await capture("desktop-questions");
  const metadata = {
    capturedAt: new Date().toISOString(),
    browser: browser.version(),
    liveData: true,
    nctId: (await page.locator(".selected-trial .trial-top").innerText()).match(
      /NCT\d{8}/,
    )?.[0],
    criteriaCount: await page
      .locator(".paired-row:not(.structured-row)")
      .count(),
    desktop: { width: 1440, height: 1000 },
    mobile: { width: 390, height: 844 },
    patientInputs: "none",
  };
  await page
    .locator(".questions-heading")
    .evaluate((el) =>
      window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 20),
    );
  await capture("desktop-paired-detail");
  await page.setViewportSize(metadata.mobile);
  await page.evaluate(() => scrollTo(0, 0));
  await capture("mobile-questions");
  await page
    .locator(".criteria-section")
    .first()
    .evaluate((el) =>
      window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 16),
    );
  await capture("mobile-paired-detail");
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw new Error("Mobile content overflows the viewport.");
  await page.setViewportSize(metadata.desktop);
  await page
    .getByRole("button", { name: /Prepare visit sheet/ })
    .first()
    .click();
  await page
    .frameLocator("iframe")
    .getByRole("heading", { name: "Questions for my doctor" })
    .waitFor();
  await capture("desktop-visit-sheet");
  await page.setViewportSize(metadata.mobile);
  await page.evaluate(() => scrollTo(0, 0));
  await capture("mobile-visit-sheet", true);
  const html = await page.locator("iframe").getAttribute("srcdoc");
  const printPage = await browser.newPage();
  await printPage.setContent(html);
  await printPage.pdf({
    path: join(output, "live-visit-sheet.pdf"),
    printBackground: true,
    preferCSSPageSize: true,
  });
  await page.goto(url);
  await capture("mobile-search", true);
  if (errors.length) throw new Error(`Browser errors: ${errors.join("; ")}`);
  await writeFile(
    join(output, "capture-metadata.json"),
    JSON.stringify(metadata, null, 2) + "\n",
  );
  console.log(JSON.stringify({ ...metadata, output }, null, 2));
} finally {
  await browser.close();
}
