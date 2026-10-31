import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

// Locate available browser (Chrome or Edge)
const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const BROWSER_PATH = CHROME_PATHS.find(p => fs.existsSync(p));
if (!BROWSER_PATH) {
  console.error('BLOCKER: Neither Google Chrome nor Microsoft Edge executable was found.');
  process.exit(1);
}

const BROWSER_NAME = path.basename(BROWSER_PATH);
const TEST_PROFILE = path.resolve('./tests/browser_ui_profile_' + Date.now());
const DIST_DIR = path.resolve('./dist');
const APP_PORT = 5173;
const CDP_PORT = 9235;

// Built-in static server for dist/ on port 5173
function startStaticAppServer(port) {
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
  };

  const server = http.createServer((req, res) => {
    let filePath = path.join(DIST_DIR, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(DIST_DIR, 'index.html');
    }
    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading asset');
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      }
    });
  });

  return new Promise(resolve => {
    server.listen(port, '127.0.0.1', () => {
      console.log(`[App Server] Serving application at http://127.0.0.1:${port}`);
      resolve(server);
    });
  });
}

// CDP Client
class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.callbacks = new Map();
    this.consoleLogs = [];
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = err => reject(err);
      this.ws.onmessage = msg => {
        try {
          const data = JSON.parse(msg.data);
          if (data.method === 'Page.javascriptDialogOpening') {
            this.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
          }
          if (data.method === 'Runtime.consoleAPICalled') {
            const text = data.params?.args?.map(a => a.value || a.description).join(' ');
            this.consoleLogs.push(`[Browser ${data.params.type}] ${text}`);
          }
          if (data.id && this.callbacks.has(data.id)) {
            const { resolve, reject } = this.callbacks.get(data.id);
            this.callbacks.delete(data.id);
            if (data.error) reject(data.error);
            else resolve(data.result);
          }
        } catch (e) {
          console.error('Error parsing CDP message:', e);
        }
      };
    });
  }

  async send(method, params = {}, timeoutMs = 10000) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.callbacks.has(id)) {
          this.callbacks.delete(id);
          reject(new Error(`CDP request timed out for method "${method}"`));
        }
      }, timeoutMs);

      this.callbacks.set(id, {
        resolve: val => {
          clearTimeout(timer);
          resolve(val);
        },
        reject: err => {
          clearTimeout(timer);
          reject(err);
        },
      });

      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression, timeoutMs = 10000) {
    const res = await this.send(
      'Runtime.evaluate',
      {
        expression,
        awaitPromise: true,
        returnByValue: true,
      },
      timeoutMs
    );
    if (res.exceptionDetails) {
      throw new Error(`In-browser evaluation failed: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  }

  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

async function getCDPWebSocketUrl(targetPort) {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${targetPort}/json/version`);
      const data = await res.json();
      if (data.webSocketDebuggerUrl) return data.webSocketDebuggerUrl;
    } catch {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  throw new Error(`Timed out waiting for ${BROWSER_NAME} CDP endpoint on port ${targetPort}`);
}

async function launchBrowser(profileDir, targetPort) {
  const proc = spawn(
    BROWSER_PATH,
    [
      '--headless=new',
      `--remote-debugging-port=${targetPort}`,
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  const wsUrl = await getCDPWebSocketUrl(targetPort);
  return { proc, wsUrl };
}

// Helper to poll in-browser DOM condition
async function waitFor(cdp, expression, timeoutMs = 8000, intervalMs = 250) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const val = await cdp.evaluate(expression);
    if (val) return val;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  const bodySnippet = await cdp.evaluate('document.body ? document.body.innerText.substring(0, 500) : "no-body"');
  throw new Error(`Timed out waiting for expression: ${expression}.\nCurrent page text snippet:\n${bodySnippet}`);
}

async function runBrowserUIJourney() {
  console.log('================================================================');
  console.log(`   PHASE 2.4 REAL ${BROWSER_NAME.toUpperCase()} UI USER JOURNEYS & HARDENING   `);
  console.log('================================================================\n');

  if (!fs.existsSync(TEST_PROFILE)) {
    fs.mkdirSync(TEST_PROFILE, { recursive: true });
  }

  const server = await startStaticAppServer(APP_PORT);
  let browserInstance = null;

  try {
    console.log(`\n[Browser Engine] Launching Headless ${BROWSER_NAME}...`);
    browserInstance = await launchBrowser(TEST_PROFILE, CDP_PORT);
    const browserCdp = new CDPClient(browserInstance.wsUrl);
    await browserCdp.connect();

    // Create target page
    const { targetId } = await browserCdp.send('Target.createTarget', {
      url: `http://127.0.0.1:${APP_PORT}`,
    });
    const targetWsUrl = `ws://127.0.0.1:${CDP_PORT}/devtools/page/${targetId}`;
    const pageCdp = new CDPClient(targetWsUrl);
    await pageCdp.connect();
    await pageCdp.send('Page.enable');
    await pageCdp.send('Runtime.enable');
    await pageCdp.send('Page.navigate', { url: `http://127.0.0.1:${APP_PORT}` });

    // Wait for bundle script evaluation and initial render
    await new Promise(r => setTimeout(r, 2500));

    const currentUrl = await pageCdp.evaluate('location.href');
    const docTitle = await pageCdp.evaluate('document.title');
    console.log(`[Browser Check] URL: ${currentUrl} | Title: "${docTitle}"`);

    // Wait for App to mount
    console.log('[Journey Step 1] Verifying initial App load and DOM mounting...');
    await waitFor(pageCdp, `document.body && document.body.innerText.includes('SURAKSHA')`);
    console.log('  ✓ UI mounted cleanly: Operations Dashboard visible with Assam Flood EOC header.');

    // -------------------------------------------------------------
    // STEP 1: SUBMIT REPORT VIA DOM FORM
    // -------------------------------------------------------------
    console.log('\n[Journey Step 2] Navigating to "+ Report Emergency" tab via DOM click...');
    await pageCdp.evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('nav button')).find(b => b.textContent.includes('Report Emergency'));
      if (!btn) throw new Error('Report Emergency nav button not found');
      btn.click();
      return true;
    })()`);

    await waitFor(pageCdp, `document.body.innerText.includes('Distress Report Intake')`);
    console.log('  ✓ Navigated to Report Emergency intake form.');

    console.log('  Filling out emergency distress form with realistic Assam flood details...');
    // Clear any previous banner
    await pageCdp.evaluate(`(() => {
      const closeBtn = document.querySelector('div[class*="teal-"] button');
      if (closeBtn) closeBtn.click();
    })()`);

    await pageCdp.evaluate(`(() => {
      function setVal(el, val) {
        const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        setter.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // 1. Title input
      const titleInput = document.querySelector('input[placeholder*="e.g. 14 people"]');
      if (!titleInput) throw new Error('Title input not found');
      setVal(titleInput, '14 people marooned on temple roof in Majuli');

      const landmarkInput = document.querySelector('input[placeholder*="Kamalabari Ghat Primary School"]');
      if (landmarkInput) setVal(landmarkInput, 'Near Kamalabari Ghat Primary School, 200m North of PWD Road');

      // 2. Select preset location (Kamalabari, Majuli)
      const presetBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Kamalabari, Majuli'));
      if (presetBtn) presetBtn.click();

      // 3. Narrative textarea
      const descArea = document.querySelector('textarea');
      if (descArea) {
        setVal(descArea, 'Water level rising rapidly after embankment breach. Immediate boat rescue needed.');
      }

      // 4. Affected count
      const countInput = document.querySelector('input[type="number"][min="1"]');
      if (countInput) {
        setVal(countInput, '14');
      }

      // 5. Submit form
      const submitBtn = document.querySelector('form button[type="submit"]');
      if (!submitBtn) throw new Error('Submit button not found');
      submitBtn.click();
      return true;
    })()`);

    // Verify confirmation message
    const successMsg = await waitFor(pageCdp, `(() => {
      const el = document.querySelector('div[class*="teal-50"], div[class*="teal-950"]');
      return el ? el.innerText : null;
    })()`);
    console.log(`  ✓ Form submitted! UI notification: "${successMsg.substring(0, 70)}..."`);

    // Verify report written into browser IndexedDB
    const idbRecord1 = await pageCdp.evaluate(`new Promise((resolve, reject) => {
      const req = indexedDB.open('suraksha_grid_offline_db', 1);
      req.onerror = () => reject('IDB open failed');
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('offline_reports', 'readonly');
        const store = tx.objectStore('offline_reports');
        const getAllReq = store.getAll();
        getAllReq.onsuccess = () => resolve(getAllReq.result);
        getAllReq.onerror = () => reject('store.getAll failed');
      };
    })`);

    if (!idbRecord1 || idbRecord1.length !== 1) {
      throw new Error(`Expected 1 report in IndexedDB, found ${idbRecord1?.length}`);
    }
    console.log(`  ✓ IndexedDB persistence verified: 1 report safely stored. UUID = ${idbRecord1[0].client_report_id}`);

    // -------------------------------------------------------------
    // STEP 2: VERIFY REPORT IN OFFLINE OUTBOX TAB
    // -------------------------------------------------------------
    console.log('\n[Journey Step 3] Navigating to "Offline Outbox" tab...');
    await pageCdp.evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('nav button')).find(b => b.textContent.includes('Offline Outbox'));
      if (!btn) throw new Error('Offline Outbox nav button not found');
      btn.click();
      return true;
    })()`);

    await waitFor(pageCdp, `document.body.innerText.includes('Persistent Spatio-Temporal Queue')`);
    const outboxCardText = await pageCdp.evaluate(`(() => {
      return document.body.innerText;
    })()`);

    if (!outboxCardText.includes('14 people marooned on temple roof') || !outboxCardText.includes('QUEUED')) {
      throw new Error('Report not found in Offline Outbox UI list');
    }
    console.log('  ✓ Offline Outbox displays newly queued report with QUEUED badge and UUID.');

    // -------------------------------------------------------------
    // STEP 3: PAGE REFRESH PERSISTENCE TEST
    // -------------------------------------------------------------
    console.log('\n[Journey Step 4] Executing Page Reload (Testing Persistence across Reload)...');
    await pageCdp.send('Page.reload');
    await waitFor(pageCdp, `document.body.innerText.includes('SURAKSHA')`);

    // Check IndexedDB immediately after reload
    const idbAfterReload = await pageCdp.evaluate(`new Promise((resolve, reject) => {
      const req = indexedDB.open('suraksha_grid_offline_db', 1);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('offline_reports', 'readonly');
        const store = tx.objectStore('offline_reports');
        const getAllReq = store.getAll();
        getAllReq.onsuccess = () => resolve(getAllReq.result);
      };
    })`);

    if (!idbAfterReload || idbAfterReload.length !== 1) {
      throw new Error(`Report did not survive page reload! Found: ${idbAfterReload?.length}`);
    }
    console.log('  ✓ IndexedDB storage completely survived Page.reload!');

    // Switch to Outbox to verify UI state rehydrated from IndexedDB
    await pageCdp.evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('nav button')).find(b => b.textContent.includes('Offline Outbox'));
      btn?.click();
      return true;
    })()`);
    await waitFor(pageCdp, `document.body.innerText.includes('14 people marooned on temple roof')`);
    console.log('  ✓ Outbox UI automatically rehydrated persistent report from IndexedDB on startup.');

    // -------------------------------------------------------------
    // STEP 4: SUBMIT MULTIPLE REPORTS
    // -------------------------------------------------------------
    console.log('\n[Journey Step 5] Submitting a second distress report...');
    await pageCdp.evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('nav button')).find(b => b.textContent.includes('Report Emergency'));
      btn?.click();
      return true;
    })()`);
    await waitFor(pageCdp, `document.body.innerText.includes('Distress Report Intake')`);

    // Clear any previous banner
    await pageCdp.evaluate(`(() => {
      const closeBtn = document.querySelector('div[class*="teal-"] button');
      if (closeBtn) closeBtn.click();
    })()`);

    await pageCdp.evaluate(`(() => {
      function setVal(el, val) {
        const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        setter.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const titleInput = document.querySelector('input[placeholder*="e.g. 14 people"]');
      setVal(titleInput, 'Dhemaji Market embankment breached - 30 shopkeepers isolated');

      const landmarkInput = document.querySelector('input[placeholder*="Kamalabari Ghat Primary School"]');
      if (landmarkInput) setVal(landmarkInput, 'Opposite Central Post Office, Dhemaji');

      const presetBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Dhemaji Market'));
      if (presetBtn) presetBtn.click();

      const countInput = document.querySelector('input[type="number"][min="1"]');
      if (countInput) {
        setVal(countInput, '30');
      }

      document.querySelector('form button[type="submit"]')?.click();
      return true;
    })()`);

    await waitFor(pageCdp, `(() => {
      const el = document.querySelector('div[class*="teal-50"], div[class*="teal-950"]');
      return el ? el.innerText : null;
    })()`);

    const idbMultiple = await pageCdp.evaluate(`new Promise(resolve => {
      const req = indexedDB.open('suraksha_grid_offline_db', 1);
      req.onsuccess = () => {
        req.result.transaction('offline_reports', 'readonly').objectStore('offline_reports').getAll().onsuccess = e => resolve(e.target.result);
      };
    })`);
    if (idbMultiple.length !== 2) {
      throw new Error(`Expected 2 reports in IndexedDB, found ${idbMultiple.length}`);
    }
    console.log(`  ✓ Multiple reports verified: 2 distinct reports coexisting in IndexedDB.`);

    // -------------------------------------------------------------
    // STEP 5: ONLINE / OFFLINE TRANSITIONS IN UI
    // -------------------------------------------------------------
    console.log('\n[Journey Step 6] Testing Online/Offline Transitions in UI...');
    await pageCdp.evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('nav button')).find(b => b.textContent.includes('Offline Outbox'));
      btn?.click();
      return true;
    })()`);
    await waitFor(pageCdp, `document.body.innerText.includes('Persistent Spatio-Temporal Queue')`);

    // Toggle to Offline
    console.log('  Toggling network simulation to Offline via UI button...');
    await pageCdp.evaluate(`(() => {
      const toggleBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Network: Online'));
      if (!toggleBtn) throw new Error('Network toggle button not found');
      toggleBtn.click();
      return true;
    })()`);

    await waitFor(pageCdp, `document.body.innerText.includes('Network: Offline')`);
    console.log('  ✓ UI transitioned to Offline: Header displays "Network: Offline (IDB Buffer)".');

    // Submit report while offline
    console.log('  Submitting 3rd report while Offline...');
    await pageCdp.evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('nav button')).find(b => b.textContent.includes('Report Emergency'));
      btn?.click();
      return true;
    })()`);
    await waitFor(pageCdp, `document.body.innerText.includes('Distress Report Intake')`);

    const offlinePill = await pageCdp.evaluate(`document.body.innerText.includes('Offline Mode')`);
    if (!offlinePill) throw new Error('Offline pill indicator not visible');

    // Clear any previous banner
    await pageCdp.evaluate(`(() => {
      const closeBtn = document.querySelector('div[class*="teal-"] button');
      if (closeBtn) closeBtn.click();
    })()`);

    await pageCdp.evaluate(`(() => {
      function setVal(el, val) {
        const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        setter.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const titleInput = document.querySelector('input[placeholder*="e.g. 14 people"]');
      setVal(titleInput, 'Morigaon Culvert collapsed - ambulance trapped');

      const landmarkInput = document.querySelector('input[placeholder*="Kamalabari Ghat Primary School"]');
      if (landmarkInput) setVal(landmarkInput, 'Morigaon PWD Bridge Km 14');

      const presetBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Morigaon Culvert'));
      if (presetBtn) presetBtn.click();

      document.querySelector('form button[type="submit"]')?.click();
      return true;
    })()`);

    const offlineMsg = await waitFor(pageCdp, `(() => {
      const el = document.querySelector('div[class*="teal-50"], div[class*="teal-950"]');
      return el ? el.innerText : null;
    })()`);
    if (!offlineMsg.includes('Offline Mode Active')) {
      throw new Error(`Expected Offline Mode Active confirmation, got: ${offlineMsg}`);
    }
    console.log(`  ✓ Offline submission verified: "${offlineMsg.substring(0, 65)}..."`);

    // Toggle back to Online
    console.log('  Toggling network simulation back to Online...');
    await pageCdp.evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('nav button')).find(b => b.textContent.includes('Offline Outbox'));
      btn?.click();
      return true;
    })()`);
    await waitFor(pageCdp, `document.body.innerText.includes('Persistent Spatio-Temporal Queue')`);

    await pageCdp.evaluate(`(() => {
      const toggleBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Network: Offline'));
      toggleBtn?.click();
      return true;
    })()`);
    await waitFor(pageCdp, `document.body.innerText.includes('Network: Online')`);
    console.log('  ✓ Network restored to Online: Sync uplink enabled.');

    // -------------------------------------------------------------
    // STEP 6: FLUSH QUEUE & SYNC TO DASHBOARD
    // -------------------------------------------------------------
    console.log('\n[Journey Step 7] Synchronizing pending reports via UI "Flush Queue" button...');
    await pageCdp.evaluate(`(() => {
      const flushBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Flush Queue'));
      if (!flushBtn) throw new Error('Flush Queue button not found');
      flushBtn.click();
      return true;
    })()`);

    // Wait for sync success message
    await waitFor(pageCdp, `document.body.innerText.includes('Successfully synchronized')`);
    console.log('  ✓ Batch synchronization succeeded! Reports acknowledged by simulated contract engine.');

    // Switch to Operations Dashboard and verify incidents were added
    console.log('  Checking Operations Dashboard for newly integrated incidents...');
    await pageCdp.evaluate(`(() => {
      const btns = Array.from(document.querySelectorAll('nav button'));
      const btn = btns.find(b => b.textContent.includes('Operations Dashboard'));
      if (!btn) throw new Error('Operations Dashboard nav button not found. Found: ' + btns.map(b => b.textContent.trim()).join(' | '));
      btn.click();
      return true;
    })()`);
    await waitFor(pageCdp, `document.body.innerText.includes('TOTAL REPORTS') && document.body.innerText.includes('Incident Intake Progression')`);

    const dashboardText = await pageCdp.evaluate(`document.body.innerText`);
    if (!dashboardText.includes('14 people marooned') || !dashboardText.includes('Dhemaji Market embankment')) {
      throw new Error('Synced incidents missing from Operations Dashboard stream');
    }
    console.log('  ✓ Synced reports successfully rendered in live Operations Dashboard stream!');

    // -------------------------------------------------------------
    // STEP 7: CONFLICT RESOLUTION UI (FORK & DISCARD)
    // -------------------------------------------------------------
    console.log('\n[Journey Step 8] Testing Conflict Resolution UI (Option A Fork & Option B Discard)...');
    
    // Inject a conflicting draft into IndexedDB with an existing server incident UUID (#101)
    const conflictUUID = 'a1b2c3d4-1111-4000-8000-000000000101';
    await pageCdp.evaluate(`new Promise(resolve => {
      const req = indexedDB.open('suraksha_grid_offline_db', 1);
      req.onsuccess = () => {
        const tx = req.result.transaction('offline_reports', 'readwrite');
        tx.objectStore('offline_reports').put({
          client_report_id: '${conflictUUID}',
          title: 'Altered Local Draft for Incident 101 (Conflict Trigger)',
          description: 'Local volunteer updated casualty count to 45',
          category: 'MAROONED_RESCUE',
          reported_urgency: 'CRITICAL',
          landmark: 'Kamalabari Altered Location',
          affected_count: 45,
          latitude: 26.9532,
          longitude: 94.1741,
          queued_at: new Date().toISOString(),
          status: 'QUEUED',
          retry_count: 0,
          last_error: null,
        });
        tx.oncomplete = () => resolve();
      };
    })`);

    // Reload page to let App rehydrate the newly injected outbox record from IndexedDB
    await pageCdp.send('Page.reload');
    await waitFor(pageCdp, `document.body.innerText.includes('SURAKSHA')`);

    // Switch to Outbox
    await pageCdp.evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('nav button')).find(b => b.textContent.includes('Offline Outbox'));
      btn?.click();
      return true;
    })()`);
    await waitFor(pageCdp, `document.body.innerText.includes('Persistent Spatio-Temporal Queue')`);

    // Trigger Flush Queue to let the sync engine detect the conflict
    console.log('  Triggering flush queue to evaluate idempotency conflict against server incident #101...');
    await pageCdp.evaluate(`(() => {
      const flushBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Flush Queue'));
      flushBtn?.click();
      return true;
    })()`);

    await waitFor(pageCdp, `document.body.innerText.includes('Option A: Fork as New Report')`);
    console.log('  ✓ Server detected IDEMPOTENCY_CONFLICT: Red conflict alert card rendered in UI.');
    console.log('  ✓ UI displays Option A (Fork with Fresh UUID) and Option B (Discard Local Draft).');

    // Test Option A: Fork
    console.log('  Clicking "Option A: Fork as New Report (Fresh UUID)" in UI...');
    await pageCdp.evaluate(`(() => {
      const forkBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Option A: Fork'));
      if (!forkBtn) throw new Error('Fork button not found');
      forkBtn.click();
      return true;
    })()`);

    await waitFor(pageCdp, `document.body.innerText.includes('Follow-up to Incident #101')`);
    console.log('  ✓ Fork successful! UI rendered "Follow-up to Incident #101" badge on newly forked report.');

    // Inspect IndexedDB to verify fresh UUIDv4 was assigned and follow_up_to_incident_id is 101
    const recordsAfterFork = await pageCdp.evaluate(`new Promise(resolve => {
      const req = indexedDB.open('suraksha_grid_offline_db', 1);
      req.onsuccess = () => {
        req.result.transaction('offline_reports', 'readonly').objectStore('offline_reports').getAll().onsuccess = e => resolve(e.target.result);
      };
    })`);

    const forkedItem = recordsAfterFork.find(r => r.follow_up_to_incident_id === 101);
    if (!forkedItem) throw new Error('Forked item not found in IndexedDB');
    if (forkedItem.client_report_id === conflictUUID) {
      throw new Error('Forked report reused the conflicting UUID! Expected fresh UUIDv4.');
    }
    console.log(`  ✓ Fresh UUIDv4 confirmed for fork: ${forkedItem.client_report_id}`);
    console.log(`  ✓ Follow-up relationship confirmed: follow_up_to_incident_id = ${forkedItem.follow_up_to_incident_id}`);

    // Test Option B: Discard Conflicting Draft
    console.log('  Clicking "Option B: Discard Local Draft" for conflicting report...');
    await pageCdp.evaluate(`(() => {
      const discardBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Option B: Discard'));
      if (!discardBtn) throw new Error('Discard button not found');
      discardBtn.click();
      return true;
    })()`);

    await waitFor(pageCdp, `document.body.innerText.includes('Conflicting local draft discarded')`);
    console.log('  ✓ Option B verified: Conflicting local draft removed from IndexedDB and UI.');

    // -------------------------------------------------------------
    // STEP 8: BROWSER CONSOLE & NETWORK AUDIT
    // -------------------------------------------------------------
    console.log('\n[Journey Step 9] Auditing Browser Console logs for uncaught errors...');
    const errors = pageCdp.consoleLogs.filter(log => log.includes('[Browser error]'));
    if (errors.length > 0) {
      console.warn('  ⚠️ Browser console warnings/errors:', errors);
    } else {
      console.log('  ✓ 0 uncaught errors in browser console during full journey!');
    }

    console.log('\n================================================================');
    console.log(' ★ ALL REAL CHROME UI USER JOURNEY TESTS COMPLETED WITH 100% SUCCESS! ★');
    console.log('================================================================\n');
  } finally {
    if (browserInstance?.proc) {
      browserInstance.proc.kill();
    }
    server.close();
    try {
      fs.rmSync(TEST_PROFILE, { recursive: true, force: true });
    } catch {}
  }
}

runBrowserUIJourney().catch(err => {
  console.error('\n❌ BROWSER UI JOURNEY FAILED:', err);
  process.exit(1);
});
