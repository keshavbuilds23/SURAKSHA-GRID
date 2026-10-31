import {
  transitionAssignmentStatus,
  allocateResource,
  isValidTransition,
} from '../src/services/resourceLifecycleService.ts';

console.log('================================================================');
console.log('   PRODUCTION CODE AUDIT: RESOURCE LIFECYCLE SERVICE TESTS     ');
console.log('================================================================\n');

// Mock data baseline
let testResource = {
  id: 1,
  name: 'Mechanized Inflatable Rescue Boat (IRB)',
  category: 'RESCUE_BOAT',
  total_quantity: 12,
  available_quantity: 8,
  unit: 'boats',
  location_name: 'Nimati Ghat',
  latitude: 26.8509,
  longitude: 94.2237,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

let testIncident = {
  id: 101,
  client_report_id: 'a0000000-0000-4000-8000-000000000101',
  title: 'Kamalabari School Roof Marooned',
  description: '18 people stranded',
  category: 'MAROONED_RESCUE',
  severity: 'CRITICAL',
  verification_status: 'VERIFIED',
  latitude: 26.9532,
  longitude: 94.1741,
  landmark: 'Kamalabari High School',
  affected_count: 18,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// TEST 1: Production allocateResource()
console.log('[Test 1] Testing production allocateResource()...');
const alloc = allocateResource(testIncident, testResource, 2, 'Allocating 2 boats to Kamalabari');
if (!alloc.success || alloc.updatedResource.available_quantity !== 6) {
  throw new Error('Production allocateResource failed');
}
testResource = alloc.updatedResource;
let assignment1 = alloc.newAssignment;
console.log(`  ✓ Allocated 2 units. Updated available: ${testResource.available_quantity}/${testResource.total_quantity}`);

// TEST 2: Production transitionAssignmentStatus() - ASSIGNED -> CANCELLED (Undispatched)
console.log('\n[Test 2] Testing production transitionAssignmentStatus() - Undispatched Cancellation...');
const cancelUndispatched = transitionAssignmentStatus(assignment1, 'CANCELLED', testResource);
if (
  !cancelUndispatched.inventoryRestored ||
  cancelUndispatched.updatedResource.available_quantity !== 8 ||
  cancelUndispatched.updatedAssignment.inventory_restored !== 1
) {
  throw new Error('Undispatched cancellation failed to restore inventory');
}
testResource = cancelUndispatched.updatedResource;
console.log(`  ✓ Undispatched cancel correctly restored stock: ${testResource.available_quantity} (inventory_restored: 1)`);

// TEST 3: Dispatched Lifecycle - ASSIGNED -> IN_TRANSIT -> DELIVERED -> RETURNED
console.log('\n[Test 3] Testing production Full Dispatched Lifecycle...');
const alloc2 = allocateResource(testIncident, testResource, 3, 'Second mission');
testResource = alloc2.updatedResource;
let assignment2 = alloc2.newAssignment;
console.log(`  Allocated 3 units. Remaining available: ${testResource.available_quantity}`);

const dispatch = transitionAssignmentStatus(assignment2, 'IN_TRANSIT', testResource);
if (dispatch.inventoryRestored || dispatch.updatedResource.available_quantity !== 5) {
  throw new Error('Dispatch should not restore or alter stock');
}
assignment2 = dispatch.updatedAssignment;
console.log(`  ✓ Dispatched (IN_TRANSIT): Stock remains deducted at ${dispatch.updatedResource.available_quantity}`);

const deliver = transitionAssignmentStatus(assignment2, 'DELIVERED', testResource);
if (deliver.inventoryRestored || deliver.updatedResource.available_quantity !== 5) {
  throw new Error('Delivery should not restore stock');
}
assignment2 = deliver.updatedAssignment;
console.log(`  ✓ Delivered (DELIVERED): Stock remains deployed at ${deliver.updatedResource.available_quantity}`);

const returnAsset = transitionAssignmentStatus(assignment2, 'RETURNED', testResource);
if (
  !returnAsset.inventoryRestored ||
  returnAsset.updatedResource.available_quantity !== 8 ||
  returnAsset.updatedAssignment.inventory_restored !== 1
) {
  throw new Error('Return failed to restore stock');
}
testResource = returnAsset.updatedResource;
console.log(`  ✓ Returned (RETURNED): Stock restored to ${testResource.available_quantity} exactly once.`);

// TEST 4: Dispatched Cancellation - IN_TRANSIT -> CANCELLED (Must NOT restore)
console.log('\n[Test 4] Testing production Dispatched Cancellation (In-Transit Abort)...');
const alloc3 = allocateResource(testIncident, testResource, 2, 'Third mission');
testResource = alloc3.updatedResource;
let assignment3 = alloc3.newAssignment;

const dispatch3 = transitionAssignmentStatus(assignment3, 'IN_TRANSIT', testResource);
assignment3 = dispatch3.updatedAssignment;

const abortInTransit = transitionAssignmentStatus(assignment3, 'CANCELLED', testResource);
if (abortInTransit.inventoryRestored || abortInTransit.updatedResource.available_quantity !== 6) {
  throw new Error('In-transit cancellation must NOT restore inventory while asset is in field!');
}
if (abortInTransit.updatedAssignment.inventory_restored !== 0) {
  throw new Error('inventory_restored must be 0 for dispatched cancellation');
}
assignment3 = abortInTransit.updatedAssignment;
console.log(`  ✓ In-transit cancel correctly kept inventory unrestored at ${abortInTransit.updatedResource.available_quantity} (inventory_restored: 0)`);

// TEST 5: Physical Return of Dispatched Recalled Asset - CANCELLED -> RETURNED
console.log('\n[Test 5] Testing physical return of recalled dispatched asset...');
const returnRecalled = transitionAssignmentStatus(assignment3, 'RETURNED', testResource);
if (
  !returnRecalled.inventoryRestored ||
  returnRecalled.updatedResource.available_quantity !== 8 ||
  returnRecalled.updatedAssignment.inventory_restored !== 1
) {
  throw new Error('Physical return of recalled asset failed to restore inventory');
}
testResource = returnRecalled.updatedResource;
console.log(`  ✓ Physical return of recalled asset restored inventory to ${testResource.available_quantity}.`);

// TEST 6: Double Restoration Guard
console.log('\n[Test 6] Testing double restoration rejection...');
if (isValidTransition('RETURNED', 'RETURNED') || isValidTransition('CANCELLED', 'RETURNED', true)) {
  throw new Error('isValidTransition must reject repeated return after inventory already restored');
}
console.log('  ✓ Double restoration attempt safely blocked by transition guard.');

console.log('\n================================================================');
console.log(' ★ ALL PRODUCTION RESOURCE LIFECYCLE SERVICE TESTS PASSED! ★   ');
console.log('================================================================\n');

