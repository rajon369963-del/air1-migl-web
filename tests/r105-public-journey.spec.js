const { test, expect, chromium } = require('@playwright/test');
const fs = require('fs');

const OBJECT_ID = '1JMp7w_bMTsbdUAFbusrRAtLC9E0Z1CZ1x_rs2TZiddI';
const CANDIDATES = [
  { id: 'edit_share', url: `https://docs.google.com/spreadsheets/d/${OBJECT_ID}/edit?usp=sharing` },
  { id: 'htmlview', url: `https://docs.google.com/spreadsheets/d/${OBJECT_ID}/htmlview` },
];

async function probe(candidate, contextId, viewport) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  const startedAt = new Date().toISOString();
  let responseStatus = null;
  let error = null;
  try {
    const response = await page.goto(candidate.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    responseStatus = response ? response.status() : null;
    await page.waitForTimeout(3000);
  } catch (e) {
    error = String(e.message || e);
  }

  const finalUrl = page.url();
  const title = await page.title().catch(() => '');
  const bodyText = await page.locator('body').innerText().catch(() => '');
  const lower = `${title}\n${bodyText}`.toLowerCase();
  const loginGatePresent = /accounts\.google\.com/.test(finalUrl) || /sign in to continue|choose an account|use your google account/.test(lower);
  const sameObject = finalUrl.includes(OBJECT_ID);
  const sheetsReadMarker = /google sheets|mock|diagnostic|taxonomy|retest|student/.test(lower);
  const readablePublic = !loginGatePresent && !error && responseStatus !== null && responseStatus < 400 && (sameObject || sheetsReadMarker);
  const screenshotPath = `artifacts/${candidate.id}_${contextId}.png`;
  fs.mkdirSync('artifacts', { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});

  const receipt = {
    candidate_id: candidate.id,
    context_id: contextId,
    requested_url: candidate.url,
    final_url: finalUrl,
    final_object_id: sameObject ? OBJECT_ID : null,
    response_status: responseStatus,
    page_title: title,
    login_gate_present: loginGatePresent,
    read_marker_present: sheetsReadMarker,
    readable_public: readablePublic,
    viewport,
    error,
    timestamp: startedAt,
    screenshot_path: screenshotPath,
  };
  await context.close();
  await browser.close();
  return receipt;
}

test('R105 anonymous read-surface court after copy failure', async () => {
  const contexts = [
    { id: 'clean_desktop_01', viewport: { width: 1365, height: 900 } },
    { id: 'clean_mobile_02', viewport: { width: 390, height: 844 } },
  ];
  const results = [];
  for (const candidate of CANDIDATES) {
    for (const ctx of contexts) results.push(await probe(candidate, ctx.id, ctx.viewport));
  }
  const byCandidate = Object.fromEntries(CANDIDATES.map(c => [c.id, results.filter(r => r.candidate_id === c.id)]));
  const winners = Object.entries(byCandidate)
    .filter(([, rs]) => rs.length === contexts.length && rs.every(r => r.readable_public))
    .map(([id]) => id);
  const receipt = {
    product_task_id: 'R105_P0_5_JN_MOCK_REMEDIATION_MVP_V1',
    effect_id: 'EFFECT-AIR10-04-R105-ANON-VIEW-READPATH-CANARY-V1',
    target_object_id: OBJECT_ID,
    copy_path_status: 'TOMBSTONED_LOGIN_REQUIRED',
    candidates: byCandidate,
    readable_public_winners: winners,
    pass: winners.length > 0,
    real_user_event: false,
    product_mutation: false,
    telemetry_mutation: false,
    fsrs_claim: false,
    neural_consolidation_claim: false,
  };
  fs.writeFileSync('artifacts/JOURNEY_RECEIPT.json', JSON.stringify(receipt, null, 2));
  expect(winners.length, JSON.stringify(receipt, null, 2)).toBeGreaterThan(0);
});
