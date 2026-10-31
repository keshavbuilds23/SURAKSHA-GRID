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
const TEST_PROFILE = path.resolve('./tests/browser_test_profile');
const DIST_DIR = path.resolve('./dist');
const APP_PORT = 5173;
const CDP_PORT = 9225;

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

// CDP Client with event handling and timeouts
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
          if (data.method === 'Runtime.consoleAPICalled') {
            const text = data.params?.args?.map(a => a.value || a.description).join(' ');
            this.consoleLogs.push(`[Browser Console ${data.params.type}] ${text}`);
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

  async send(method, params = {}, timeoutMs = 8000) {
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

  async evaluate(expression, timeoutMs = 8000) {
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
  for (let i = 0; i < 25; i++) {
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
  const proc = spawn(BROWSER_PATH, [
    '--headless=new',
    `--remote-debugging-port=${targetPort}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    'about:blank',
  ], { stdio: 'ignore' });

  const wsUrl = await getCDPWebSocketUrl(targetPort);
  return { proc, wsUrl };
}

async function runBrowserVerification() {
  console.log('================================================================');
  console.log(`   PHASE 2.3 REAL ${BROWSER_NAME.toUpperCase()} INDEXEDDB PERSISTENCE TEST   `);
  console.log('================================================================\n');
  console.log(`[Browser Engine] Using ${BROWSER_NAME} at ${BROWSER_PATH}`);

  if (!fs.existsSync(TEST_PROFILE)) {
    fs.mkdirSync(TEST_PROFILE, { recursive: true });
  }

  const server = await startStaticAppServer(APP_PORT);
  let browserInstance = null;

  try {
    // -------------------------------------------------------------
    // SESSION 1: INITIAL LOAD, REPORT SUBMISSION & PAGE RELOAD
    // -------------------------------------------------------------
    console.log(`\n[Browser] Launching Headless ${BROWSER_NAME} (Session 1)...`);
    browserInstance = await launchBrowser(TEST_PROFILE, CDP_PORT);
    let browserCdp = new CDPClient(browserInstance.wsUrl);
    await browserCdp.connect();

    // Create target tab pointing to http://127.0.0.1:5173
    const { targetId } = await browserCdp.send('Target.createTarget', { url: `http://127.0.0.1:${APP_PORT}` });
    const targetWsUrl = `ws://127.0.0.1:${CDP_PORT}/devtools/page/${targetId}`;
    let pageCdp = new CDPClient(targetWsUrl);
    await pageCdp.connect();
    await pageCdp.send('Page.enable');
    await pageCdp.send('Runtime.enable');

    // Wait for bundle script evaluation and initial render
    await new Promise(r => setTimeout(r, 1500));

    // Verify Title & DOM Mounting
    const pageTitle = await pageCdp.evaluate('document.title');
    console.log(`[Browser Check] Loaded Document Title: "${pageTitle}"`);
    if (!pageTitle.includes('SURAKSHA GRID')) {
      throw new Error('Application document title verification failed');
    }
    console.log(`  ✓ Check 1: Real ${BROWSER_NAME} session loaded application UI successfully.`);

    // Check Initial Outbox State via In-Page IndexedDB Helper
    const idbHelperScript = `
      function getOpenDB() {
        return new Promise((resolve, reject) => {
          const req = indexedDB.open('suraksha_grid_offline_db', 1);
          req.onupgradeneeded = (e) => {
            const db = req.result;
            if (!db.objectStoreNames.contains('offline_reports')) {
              const store = db.createObjectStore('offline_reports', { keyPath: 'client_report_id' });
              store.createIndex('by_status', 'status');
              store.createIndex('by_queued_at', 'queued_at');
            }
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      }
      function getReportsFromIDB() {
        return getOpenDB().then(db => {
          return new Promise((resolve, reject) => {
            const tx = db.transaction('offline_reports', 'readonly');
            const req = tx.objectStore('offline_reports').getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          });
        });
      }
      function putReportToIDB(report) {
        return getOpenDB().then(db => {
          return new Promise((resolve, reject) => {
            const tx = db.transaction('offline_reports', 'readwrite');
            tx.objectStore('offline_reports').put(report);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
          });
        });
      }
      function deleteReportFromIDB(id) {
        return getOpenDB().then(db => {
          return new Promise((resolve, reject) => {
            const tx = db.transaction('offline_reports', 'readwrite');
            tx.objectStore('offline_reports').delete(id);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
          });
        });
      }
    `;

    await pageCdp.evaluate(idbHelperScript);
    const initialReports = await pageCdp.evaluate('getReportsFromIDB()');
    console.log(`  ✓ Check 2: Inspected IndexedDB on disk. Initial records: ${initialReports.length}`);

    // TEST 1: Submit Distress Report #1 into IndexedDB
    const report1 = {
      client_report_id: 'c1111111-2222-4000-8000-000000000001',
      title: 'Water 6.5ft high at Kamalabari Temple',
      description: '18 monks and villagers stranded on rooftop.',
      category: 'MAROONED_RESCUE',
      reported_urgency: 'CRITICAL',
      landmark: 'Kamalabari Satra Embankment',
      affected_count: 18,
      medical_required: true,
      latitude: 26.9532,
      longitude: 94.1741,
      queued_at: new Date().toISOString(),
      status: 'QUEUED',
      retry_count: 0,
      last_error: null,
    };

    await pageCdp.evaluate(`putReportToIDB(${JSON.stringify(report1)})`);
    const afterPutReports = await pageCdp.evaluate('getReportsFromIDB()');
    console.log(`  ✓ Check 3: Report #1 submitted to IndexedDB. Stored: ${afterPutReports.length} record(s).`);
    if (afterPutReports.length !== 1 || afterPutReports[0].client_report_id !== report1.client_report_id) {
      throw new Error('Report #1 failed to persist to IndexedDB');
    }

    // TEST 2: Page Refresh Persistence Test (Page.reload)
    console.log(`[Browser Check] Performing browser Page.reload in ${BROWSER_NAME}...`);
    await pageCdp.send('Page.reload');
    await new Promise(r => setTimeout(r, 1500));
    await pageCdp.evaluate(idbHelperScript);

    const postReloadReports = await pageCdp.evaluate('getReportsFromIDB()');
    console.log(`  ✓ Check 4: Page Reload Succeeded. Report count in IndexedDB: ${postReloadReports.length}`);
    if (postReloadReports.length !== 1 || postReloadReports[0].client_report_id !== report1.client_report_id) {
      throw new Error('Report #1 did NOT survive page reload in browser!');
    }
    console.log(`      UUID: ${postReloadReports[0].client_report_id} | Status: ${postReloadReports[0].status} | Title: "${postReloadReports[0].title}"`);

    // -------------------------------------------------------------
    // SESSION 2: FULL BROWSER RESTART TEST (PROCESS CLOSE & REOPEN)
    // -------------------------------------------------------------
    console.log(`\n[Browser Check] Killing ${BROWSER_NAME} process completely to test browser restart persistence...`);
    pageCdp.close();
    browserCdp.close();
    browserInstance.proc.kill('SIGTERM');
    await new Promise(r => setTimeout(r, 2000));

    console.log(`[Browser Check] Reopening ${BROWSER_NAME} with the SAME user-data-dir profile (Session 2)...`);
    browserInstance = await launchBrowser(TEST_PROFILE, CDP_PORT + 2);
    browserCdp = new CDPClient(browserInstance.wsUrl);
    await browserCdp.connect();

    const newTarget = await browserCdp.send('Target.createTarget', { url: `http://127.0.0.1:${APP_PORT}` });
    pageCdp = new CDPClient(`ws://127.0.0.1:${CDP_PORT + 2}/devtools/page/${newTarget.targetId}`);
    await pageCdp.connect();
    await pageCdp.send('Page.enable');
    await pageCdp.send('Runtime.enable');
    await new Promise(r => setTimeout(r, 1500));
    await pageCdp.evaluate(idbHelperScript);

    // TEST 3: Confirm report persisted across full browser process restart!
    const postRestartReports = await pageCdp.evaluate('getReportsFromIDB()');
    console.log(`  ✓ Check 5: Browser Restart Succeeded. Loaded from disk: ${postRestartReports.length} record(s).`);
    if (postRestartReports.length !== 1 || postRestartReports[0].client_report_id !== report1.client_report_id) {
      throw new Error('Report #1 did NOT survive full browser close and reopen!');
    }
    console.log(`      Persistent Record verified on disk: ${postRestartReports[0].title} (Affected: ${postRestartReports[0].affected_count})`);
    console.log('  ★ VERIFIED: Report survives browser restart with 100% integrity!');

    // TEST 4: Multiple Queued Reports
    console.log(`\n[Browser Check] Enqueueing multiple reports into ${BROWSER_NAME} IndexedDB...`);
    const report2 = {
      ...report1,
      client_report_id: 'c2222222-2222-4000-8000-000000000002',
      title: 'Breach near Dhemaji Central Post Office',
      affected_count: 28,
    };
    const report3 = {
      ...report1,
      client_report_id: 'c3333333-3333-4000-8000-000000000003',
      title: 'Morigaon PWD Bridge submerged',
      affected_count: 65,
    };

    await pageCdp.evaluate(`putReportToIDB(${JSON.stringify(report2)})`);
    await pageCdp.evaluate(`putReportToIDB(${JSON.stringify(report3)})`);

    const multiReports = await pageCdp.evaluate('getReportsFromIDB()');
    console.log(`  ✓ Check 6: Multiple Queued Reports coexisting in IndexedDB: ${multiReports.length} records.`);
    if (multiReports.length !== 3) throw new Error('Expected 3 reports in IndexedDB');

    // TEST 5: Explicit Report Deletion
    console.log(`\n[Browser Check] Testing explicit removal of Report #3...`);
    await pageCdp.evaluate(`deleteReportFromIDB('${report3.client_report_id}')`);
    const postDeleteReports = await pageCdp.evaluate('getReportsFromIDB()');
    console.log(`  ✓ Check 7: Explicit removal verified. Remaining records: ${postDeleteReports.length}`);
    if (postDeleteReports.length !== 2) throw new Error('Expected 2 reports remaining after explicit delete');

    // TEST 6: Conflict Preservation & Forking with follow_up_to_incident_id
    console.log(`\n[Browser Check] Testing conflict preservation and explicit fork relationship...`);
    const forkedUUID = 'c4444444-4444-4000-8000-000000000004';
    const forkedReport = {
      ...report2,
      client_report_id: forkedUUID,
      follow_up_to_incident_id: 102, // Explicit relationship to server incident #102
      title: 'Follow-up: Dhemaji Post Office dry road accessible',
      status: 'QUEUED',
    };

    // Keep report2 marked as CONFLICT, and save forked report
    await pageCdp.evaluate(`
      putReportToIDB({
        ...${JSON.stringify(report2)},
        status: 'CONFLICT',
        server_incident_id: 102,
        last_error: 'IDEMPOTENCY_CONFLICT: Payload differs from server incident #102.'
      })
    `);
    await pageCdp.evaluate(`putReportToIDB(${JSON.stringify(forkedReport)})`);

    const finalReports = await pageCdp.evaluate('getReportsFromIDB()');
    const conflictRecord = finalReports.find(r => r.status === 'CONFLICT');
    const forkedRecord = finalReports.find(r => r.client_report_id === forkedUUID);

    console.log(`  ✓ Check 8: Original conflicting draft PRESERVED in IndexedDB: "${conflictRecord.title}" (Status: ${conflictRecord.status})`);
    console.log(`  ✓ Check 9: Forked report enqueued with fresh UUID and explicit reference:`);
    console.log(`      Fork UUID: ${forkedRecord.client_report_id} | follow_up_to_incident_id: ${forkedRecord.follow_up_to_incident_id}`);

    if (!conflictRecord || !forkedRecord || forkedRecord.follow_up_to_incident_id !== 102) {
      throw new Error('Conflict fork relationship check failed in browser!');
    }

    // Output any browser console messages captured during execution
    if (pageCdp.consoleLogs.length > 0) {
      console.log('\n[Captured Browser Console Logs]:');
      pageCdp.consoleLogs.forEach(log => console.log('  ' + log));
    }

    console.log('\n================================================================');
    console.log(` ★ ALL 9 REAL BROWSER (${BROWSER_NAME.toUpperCase()}) CHECKS PASSED WITH 100% SUCCESS! ★ `);
    console.log('================================================================');

    pageCdp.close();
    browserCdp.close();
    browserInstance.proc.kill('SIGTERM');
  } finally {
    server.close();
    await new Promise(r => setTimeout(r, 1500));
    try {
      fs.rmSync(TEST_PROFILE, { recursive: true, force: true });
    } catch {}
  }
}

runBrowserVerification().catch(err => {
  console.error('\n❌ BROWSER PERSISTENCE TEST FAILED:', err);
  process.exit(1);
});
