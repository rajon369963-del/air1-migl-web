const { test, expect, chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const PRODUCT_TASK_ID = 'R105_P0_5_JN_MOCK_REMEDIATION_MVP_V1';
const OBJECT_ID = '1JMp7w_bMTsbdUAFbusrRAtLC9E0Z1CZ1x_rs2TZiddI';
const EXISTING_PWA_URL = 'https://rajon369963-del.github.io/air1-migl-web/';
const ADAPTER_FILE_URL = `file://${path.resolve('r105_mock_repair.html')}`;
const CONTEXTS = [
  { id: 'clean_desktop_01', viewport: { width: 1365, height: 900 } },
  { id: 'clean_mobile_02', viewport: { width: 390, height: 844 } },
];
const CANDIDATES = [
  { id: 'edit_share', url: `https://docs.google.com/spreadsheets/d/${OBJECT_ID}/edit?usp=sharing` },
  { id: 'htmlview', url: `https://docs.google.com/spreadsheets/d/${OBJECT_ID}/htmlview` },
];

function ensureArtifacts() {
  fs.mkdirSync('artifacts', { recursive: true });
}

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
  ensureArtifacts();
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

async function probeExistingPwa(contextId, viewport) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  const networkHosts = new Set();
  page.on('request', request => {
    try { networkHosts.add(new URL(request.url()).hostname); } catch (_) {}
  });

  const startedAt = new Date().toISOString();
  let responseStatus = null;
  let error = null;
  try {
    const response = await page.goto(EXISTING_PWA_URL, { waitUntil: 'networkidle', timeout: 45000 });
    responseStatus = response ? response.status() : null;
  } catch (e) {
    error = String(e.message || e);
  }

  const finalUrl = page.url();
  const title = await page.title().catch(() => '');
  const bodyText = await page.locator('body').innerText().catch(() => '');
  const lower = `${title}\n${bodyText}`.toLowerCase();
  const controls = {
    buttons: await page.locator('button').count().catch(() => 0),
    inputs: await page.locator('input').count().catch(() => 0),
    selects: await page.locator('select').count().catch(() => 0),
    textareas: await page.locator('textarea').count().catch(() => 0),
    forms: await page.locator('form').count().catch(() => 0),
  };
  const reachable = !error && responseStatus !== null && responseStatus < 400;
  const loginGatePresent = /accounts\.google\.com|sign in to continue|choose an account/.test(`${finalUrl}\n${lower}`);
  const r105PainMarker = /mock|wrong answer|unattempted|mistake|diagnostic|remediation|retest/.test(lower);
  const r105ActionMarker = /cause|concept|retrieval|execution|time|selection|diagnos|repair|submit|check/.test(lower) && Object.values(controls).some(n => n > 0);
  const resultMarker = /result|repair|diagnos|retest|recommend/.test(lower);
  const fsrsBrandingPresent = /\bfsrs\b/.test(lower);
  const neuralClaimPresent = /neural consolidation|consolidation of memory|brain consolidation/.test(lower);
  const screenshotPath = `artifacts/existing_pwa_${contextId}.png`;
  ensureArtifacts();
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});

  const receipt = {
    context_id: contextId,
    requested_url: EXISTING_PWA_URL,
    final_url: finalUrl,
    response_status: responseStatus,
    page_title: title,
    reachable,
    login_gate_present: loginGatePresent,
    controls,
    r105_pain_marker_present: r105PainMarker,
    r105_action_marker_present: r105ActionMarker,
    result_marker_present: resultMarker,
    exact_r105_contract_candidate: reachable && !loginGatePresent && r105PainMarker && r105ActionMarker && resultMarker,
    fsrs_branding_present: fsrsBrandingPresent,
    neural_claim_present: neuralClaimPresent,
    network_hosts: [...networkHosts].sort(),
    viewport,
    error,
    timestamp: startedAt,
    screenshot_path: screenshotPath,
  };
  await context.close();
  await browser.close();
  return receipt;
}

async function exerciseAdapter(contextId, viewport) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  const networkRequests = [];
  page.on('request', request => {
    if (/^https?:/i.test(request.url())) networkRequests.push(request.url());
  });

  let error = null;
  try {
    await page.goto(ADAPTER_FILE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.selectOption('#outcome', 'wrong');
    await page.selectOption('#cause', 'time');
    await page.selectOption('#confidence', 'high');
    await page.click('button[type="submit"]');
  } catch (e) {
    error = String(e.message || e);
  }

  const diagnosis = await page.locator('#diagnosis').innerText().catch(() => '');
  const action = await page.locator('#action').innerText().catch(() => '');
  const mastery = await page.locator('#mastery').innerText().catch(() => '');
  const bodyText = await page.locator('body').innerText().catch(() => '');
  const resultVisible = await page.locator('#result').isVisible().catch(() => false);
  const controls = {
    buttons: await page.locator('button').count().catch(() => 0),
    selects: await page.locator('select').count().catch(() => 0),
    forms: await page.locator('form').count().catch(() => 0),
  };
  const screenshotPath = `artifacts/r105_adapter_${contextId}.png`;
  ensureArtifacts();
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});

  const receipt = {
    context_id: contextId,
    viewport,
    error,
    controls,
    result_visible: resultVisible,
    diagnosis,
    action,
    mastery_update: mastery,
    fixed_diagnostic_guard_present: /FIXED_DIAGNOSTIC_RETEST_CANARY/.test(bodyText),
    not_fsrs_guard_present: /not FSRS/i.test(bodyText),
    no_efficacy_guard_present: /not an efficacy claim/i.test(bodyText),
    network_request_count: networkRequests.length,
    network_requests: networkRequests,
    screenshot_path: screenshotPath,
  };
  await context.close();
  await browser.close();
  return receipt;
}

test('R105 anonymous read-surface court after copy failure', async () => {
  const results = [];
  for (const candidate of CANDIDATES) {
    for (const ctx of CONTEXTS) results.push(await probe(candidate, ctx.id, ctx.viewport));
  }
  const byCandidate = Object.fromEntries(CANDIDATES.map(c => [c.id, results.filter(r => r.candidate_id === c.id)]));
  const winners = Object.entries(byCandidate)
    .filter(([, rs]) => rs.length === CONTEXTS.length && rs.every(r => r.readable_public))
    .map(([id]) => id);
  const receipt = {
    product_task_id: PRODUCT_TASK_ID,
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
  ensureArtifacts();
  fs.writeFileSync('artifacts/JOURNEY_RECEIPT.json', JSON.stringify(receipt, null, 2));
  expect(winners.length, JSON.stringify(receipt, null, 2)).toBeGreaterThan(0);
});

test('R105 existing deployed PWA identical-fixture baseline court', async () => {
  const results = [];
  for (const ctx of CONTEXTS) results.push(await probeExistingPwa(ctx.id, ctx.viewport));
  const receipt = {
    product_task_id: PRODUCT_TASK_ID,
    handoff_task_id: 'R105-L4-EXISTING-SURFACE-IDENTICAL-FIXTURE-CANARY-01',
    effect_id: 'EFFECT-L4-R105-EXISTING-PWA-BASELINE-CANARY-V1',
    candidate: 'existing_air1_migl_web_zero_source_change',
    deployed_url: EXISTING_PWA_URL,
    contexts: results,
    reachable_all_contexts: results.length === CONTEXTS.length && results.every(r => r.reachable && !r.login_gate_present),
    exact_r105_contract_all_contexts: results.length === CONTEXTS.length && results.every(r => r.exact_r105_contract_candidate),
    fsrs_false_branding_detected: results.some(r => r.fsrs_branding_present),
    neural_claim_detected: results.some(r => r.neural_claim_present),
    real_user_event: false,
    product_mutation: false,
    telemetry_mutation: false,
    verdict: results.length === CONTEXTS.length && results.every(r => r.exact_r105_contract_candidate)
      ? 'EXISTING_SURFACE_FIT_PASS_BOUNDED'
      : 'EXISTING_SURFACE_LACKS_EXACT_R105_CONTRACT_OR_REACHABILITY',
  };
  ensureArtifacts();
  fs.writeFileSync('artifacts/PWA_BASELINE_RECEIPT.json', JSON.stringify(receipt, null, 2));
  expect(results).toHaveLength(CONTEXTS.length);
});

test('R105 sanitized single-file adapter deterministic privacy canary', async () => {
  const results = [];
  for (const ctx of CONTEXTS) results.push(await exerciseAdapter(ctx.id, ctx.viewport));
  const deterministic = results.length === CONTEXTS.length && results.every(r =>
    r.error === null &&
    r.result_visible &&
    r.diagnosis === 'Time-pressure error' &&
    r.action === 'Retry untimed first, then repeat once under a bounded timer.' &&
    r.mastery_update === 'NO_MASTERY_UPDATE'
  );
  const privacy = results.every(r => r.network_request_count === 0);
  const semanticTruth = results.every(r => r.fixed_diagnostic_guard_present && r.not_fsrs_guard_present && r.no_efficacy_guard_present);
  const receipt = {
    product_task_id: PRODUCT_TASK_ID,
    handoff_task_id: 'R105-L4-EXISTING-SURFACE-IDENTICAL-FIXTURE-CANARY-01',
    effect_id: 'EFFECT-L4-R105-SANITIZED-CLIENT-ADAPTER-CANARY-V1',
    candidate: 'single_file_client_only_adapter',
    source_file: 'r105_mock_repair.html',
    contexts: results,
    deterministic_same_input_result: deterministic,
    zero_network_telemetry: privacy,
    semantic_truth_guards_pass: semanticTruth,
    public_sheet_learner_writes: 0,
    production_backend_delta: 0,
    production_db_delta: 0,
    production_service_delta: 0,
    real_user_event: false,
    deployment_promoted: false,
    g3_promoted: false,
    verdict: deterministic && privacy && semanticTruth ? 'RUNNABLE_ADAPTER_CANARY_PASS_BOUNDED' : 'RUNNABLE_ADAPTER_CANARY_FAIL',
  };
  ensureArtifacts();
  fs.writeFileSync('artifacts/ADAPTER_CANARY_RECEIPT.json', JSON.stringify(receipt, null, 2));
  expect(deterministic, JSON.stringify(receipt, null, 2)).toBe(true);
  expect(privacy, JSON.stringify(receipt, null, 2)).toBe(true);
  expect(semanticTruth, JSON.stringify(receipt, null, 2)).toBe(true);
});
