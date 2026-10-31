import './idb_polyfill.mjs';
import {
  processOutboxSync,
  enqueueReport,
  forkConflictReport,
  discardConflictReport,
  getAllQueuedReports,
  clearAllQueuedReports,
} from '../src/services/outboxSyncService.ts';

async function runSyncIdempotencySuite() {
  console.log('================================================================');
  console.log('   PRODUCTION CODE AUDIT: SYNC & IDEMPOTENCY ENGINE TESTS       ');
  console.log('================================================================\n');

  // Existing server incidents
  const serverIncidents = [
    {
      id: 101,
      client_report_id: 'a0000000-0000-4000-8000-000000000101',
      title: '18 people stranded on Kamalabari School roof',
      category: 'MAROONED_RESCUE',
      severity: 'CRITICAL',
      verification_status: 'VERIFIED',
      latitude: 26.9532,
      longitude: 94.1741,
      landmark: 'Kamalabari School',
      affected_count: 18,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  await clearAllQueuedReports();

  // 1. Enqueue fresh report through production enqueueReport()
  console.log('[Test 1] Testing production enqueueReport()...');
  const report1 = await enqueueReport({
    title: 'New Embankment Breach at Dhemaji',
    description: 'Rapid water influx into market',
    category: 'MAROONED_RESCUE',
    reported_urgency: 'HIGH',
    landmark: 'Dhemaji Market',
    affected_count: 24,
    latitude: 27.4812,
    longitude: 94.5714,
  });
  console.log(`  ✓ Enqueued report with valid UUIDv4: ${report1.client_report_id}`);

  // 2. Process Sync through production processOutboxSync()
  console.log('\n[Test 2] Testing production processOutboxSync() - Clean Sync...');
  const syncResult1 = await processOutboxSync(serverIncidents, true);
  if (syncResult1.batchResponse.synced_count !== 1 || syncResult1.syncedIncidents.length !== 1) {
    throw new Error('Clean sync failed');
  }
  const createdIncident = syncResult1.syncedIncidents[0];
  serverIncidents.push(createdIncident);
  console.log(`  ✓ Report synced cleanly and converted to Incident #${createdIncident.id} (Severity: ${createdIncident.severity})`);

  // Verify removed from IDB after successful sync
  const remainingAfterSync = await getAllQueuedReports();
  if (remainingAfterSync.length !== 0) {
    throw new Error('Report should be removed from IndexedDB after successful sync');
  }
  console.log('  ✓ Verified: Report removed from outbox after confirmed server sync acknowledgement.');

  // 3. Test Idempotent Retry: Enqueue identical report with same UUID
  console.log('\n[Test 3] Testing Idempotent Retry (Same UUID + Identical Payload)...');
  await clearAllQueuedReports();
  // Manually insert identical report into IDB to test resync
  const identicalReport = {
    client_report_id: report1.client_report_id,
    title: report1.title,
    description: report1.description,
    category: report1.category,
    reported_urgency: report1.reported_urgency,
    landmark: report1.landmark,
    affected_count: report1.affected_count,
    latitude: report1.latitude,
    longitude: report1.longitude,
    queued_at: new Date().toISOString(),
    status: 'QUEUED',
    retry_count: 1,
  };
  const { saveQueuedReport } = await import('../src/services/outboxDb.ts');
  await saveQueuedReport(identicalReport);

  const syncResult2 = await processOutboxSync(serverIncidents, true);
  if (
    syncResult2.batchResponse.already_synced_count !== 1 ||
    syncResult2.batchResponse.synced_count !== 0 ||
    syncResult2.syncedIncidents.length !== 0
  ) {
    throw new Error('Identical resend must return already_synced without duplicate creation');
  }
  console.log('  ✓ Idempotent Retry: Server acknowledged already_synced: true with zero duplicate incidents.');

  // 4. Test IDEMPOTENCY_CONFLICT: Same UUID + Conflicting Payload
  console.log('\n[Test 4] Testing IDEMPOTENCY_CONFLICT (Same UUID + Altered Content)...');
  const conflictingReport = {
    client_report_id: report1.client_report_id,
    title: 'ALTERED TITLE: Only 2 people here',
    description: 'Modified description',
    category: 'FOOD_WATER_CRISIS',
    reported_urgency: 'LOW',
    landmark: 'Dhemaji Market',
    affected_count: 2,
    latitude: report1.latitude,
    longitude: report1.longitude,
    queued_at: new Date().toISOString(),
    status: 'QUEUED',
    retry_count: 1,
  };
  await saveQueuedReport(conflictingReport);

  const syncResult3 = await processOutboxSync(serverIncidents, true);
  if (
    syncResult3.batchResponse.rejected_count !== 1 ||
    syncResult3.batchResponse.items[0].error?.code !== 'IDEMPOTENCY_CONFLICT'
  ) {
    throw new Error('Conflicting report must trigger IDEMPOTENCY_CONFLICT rejection');
  }
  console.log('  ✓ Conflict Safety: Server rejected conflict with IDEMPOTENCY_CONFLICT.');

  // Verify that conflicting report was PRESERVED in IndexedDB with status 'CONFLICT'
  const reportsAfterConflict = await getAllQueuedReports();
  const preservedConflict = reportsAfterConflict.find(r => r.client_report_id === report1.client_report_id);
  if (!preservedConflict || preservedConflict.status !== 'CONFLICT') {
    throw new Error('Conflicting report must be preserved in IndexedDB with status CONFLICT');
  }
  console.log(`  ✓ Draft Preservation: Local conflicting draft preserved in outbox (Status: ${preservedConflict.status})`);

  // 5. Test Conflict Forking via production forkConflictReport()
  console.log('\n[Test 5] Testing production forkConflictReport()...');
  const forked = await forkConflictReport(preservedConflict);
  if (
    forked.client_report_id === report1.client_report_id ||
    forked.status !== 'QUEUED' ||
    forked.follow_up_to_incident_id !== createdIncident.id
  ) {
    throw new Error('Forked report must have fresh UUID and follow_up_to_incident_id');
  }
  console.log(`  ✓ Forked successfully: New UUIDv4 = ${forked.client_report_id}`);
  console.log(`      follow_up_to_incident_id: ${forked.follow_up_to_incident_id} (Linked to server incident #${createdIncident.id})`);

  // Verify both exist in IDB (the conflict draft AND the new fork)
  const allReportsAfterFork = await getAllQueuedReports();
  if (allReportsAfterFork.length !== 2) {
    throw new Error('Both original conflicting draft and new fork must be preserved in IndexedDB');
  }
  console.log('  ✓ Zero Data Loss: Both conflicting draft and forked report coexist in IndexedDB.');

  // 6. Test Discarding Conflict Draft via production discardConflictReport()
  console.log('\n[Test 6] Testing production discardConflictReport()...');
  await discardConflictReport(preservedConflict.client_report_id);
  const reportsAfterDiscard = await getAllQueuedReports();
  if (reportsAfterDiscard.length !== 1 || reportsAfterDiscard[0].client_report_id !== forked.client_report_id) {
    throw new Error('Discard failed to cleanly remove only the conflict draft');
  }
  console.log('  ✓ Discard verified: Conflicting draft removed upon user resolution, forked report remains queued.');

  console.log('\n================================================================');
  console.log(' ★ ALL PRODUCTION SYNC & CONFLICT TESTS PASSED WITH 100% SUCCESS! ★');
  console.log('================================================================\n');
}

runSyncIdempotencySuite().catch(err => {
  console.error('\n❌ SYNC IDEMPOTENCY SUITE FAILED:', err);
  process.exit(1);
});
