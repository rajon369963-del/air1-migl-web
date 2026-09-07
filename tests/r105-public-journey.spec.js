const { test, expect, chromium } = require('@playwright/test');
const fs = require('fs');

const OBJECT_ID = '1JMp7w_bMTsbdUAFbusrRAtLC9E0Z1CZ1x_rs2TZiddI';
const TARGET_URL = `https://docs.google.com/spreadsheets/d/${OBJECT_ID}/copy`;

async function probe(contextId, viewport) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport,
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  const startedAt = new Date().toISOString();
  let responseStatus = null;
  let error = null;
  try {
    const response = await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    responseStatus = response ? response.status() : null;
    await page.waitForTimeout(2500);
  } catch (e) {
    error = String(e.message || e);
  }

  const finalUrl = page.url();
  const bodyText = await page.locator('body').innerText().catch(() => '');
  const lower = bodyText.toLowerCase();
  const loginGatePresent = /accounts\.google\.com/.test(finalUrl) || /sign in|choose an account|use your google account/.test(lower);
  const sameObject = finalUrl.includes(OBJECT_ID);
  const publicMarkerPresent = /make a copy|copy document|copy/.test(lower);
  const screenshotPath = `artifacts/${contextId}.png`;
  fs.mkdirSync('artifacts', { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});

  const receipt = {
    context_id: contextId,
    requested_url: TARGET_URL,
    final_url: finalUrl,
    final_object_id: sameObject ? OBJECT_ID : null,
    response_status: responseStatus,
    login_gate_present: loginGatePresent,
    public_marker_present: publicMarkerPresent,
    journey_completion: sameObject && !loginGatePresent && publicMarkerPresent && !error,
    viewport,
    error,
    timestamp: startedAt,
    screenshot_path: screenshotPath,
  };
  await context.close();
  await browser.close();
  return receipt;
}

test('R105 clean anonymous public journey canary', async () => {
  const desktop = await probe('clean_desktop_01', { width: 1365, height: 900 });
  const mobile = await probe('clean_mobile_02', { width: 390, height: 844 });
  const receipt = {
    product_task_id: 'R105_P0_5_JN_MOCK_REMEDIATION_MVP_V1',
    effect_id: 'EFFECT-AIR10-04-R105-PORTABLE-ANON-BROWSER-CI-CANARY-V1',
    target_object_id: OBJECT_ID,
    contexts: [desktop, mobile],
    pass: desktop.journey_completion && mobile.journey_completion,
    real_user_event: false,
    fsrs_claim: false,
    neural_consolidation_claim: false,
  };
  fs.writeFileSync('artifacts/JOURNEY_RECEIPT.json', JSON.stringify(receipt, null, 2));
  expect(desktop.journey_completion, JSON.stringify(desktop, null, 2)).toBe(true);
  expect(mobile.journey_completion, JSON.stringify(mobile, null, 2)).toBe(true);
});
