import type { Page } from "playwright";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

const BASE = "https://www.paodeacucar.com";
const FORTALEZA_CEP = "60160000";

let storeReady = false;

async function dismissCookies(page: Page): Promise<void> {
  const btn = page.getByRole("button", {
    name: /estou ciente|aceitar|concordo|entendi/i,
  });
  if (await btn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
    await btn.first().click();
  }
}

/** Set Fortaleza CEP once per browser session (CEP 60160-000). */
export async function ensureFortalezaStore(page: Page): Promise<void> {
  if (storeReady) return;

  logger.debug(`goto ${BASE} (CEP ${FORTALEZA_CEP})`);

  await page.goto(BASE, {
    waitUntil: "domcontentloaded",
    timeout: config.timeout,
  });
  await dismissCookies(page);

  const cepTriggers = [
    page.getByRole("button", { name: /cep/i }),
    page.getByRole("link", { name: /cep/i }),
    page.getByText(/informe seu cep|digite seu cep|qual é o seu cep/i),
    page.locator('[data-testid*="cep" i]'),
  ];

  for (const trigger of cepTriggers) {
    const el = trigger.first();
    if (await el.isVisible({ timeout: 800 }).catch(() => false)) {
      await el.click();
      break;
    }
  }

  const cepInput = page
    .locator(
      'input[placeholder*="CEP" i], input[name*="cep" i], input[id*="cep" i], input[aria-label*="CEP" i]',
    )
    .first();

  if (await cepInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    const waitStore = page
      .waitForResponse(
        (res) =>
          res.ok() &&
          res.url().includes("gpa.digital/pa/") &&
          /store|delivery|cep|zip|address/i.test(res.url()),
        { timeout: config.timeout },
      )
      .catch(() => null);

    await cepInput.fill(FORTALEZA_CEP);

    const confirm = page
      .getByRole("button", { name: /buscar|confirmar|ok|salvar|continuar/i })
      .first();
    if (await confirm.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirm.click();
    } else {
      await page.keyboard.press("Enter");
    }

    await waitStore;
    logger.debug("Fortaleza CEP submitted");
  } else {
    logger.debug("CEP input not found — using default store from session");
  }

  storeReady = true;
}
