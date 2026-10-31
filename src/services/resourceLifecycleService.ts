import type { Resource, Assignment, AssignmentStatus } from '../types/resource.ts';
import type { Incident } from '../types/incident.ts';

export interface TransitionOutcome {
  success: boolean;
  updatedAssignment: Assignment;
  updatedResource: Resource;
  inventoryRestored: boolean;
  restoredQuantity: number;
  message: string;
}

export interface AllocationOutcome {
  success: boolean;
  newAssignment: Assignment;
  updatedResource: Resource;
  message: string;
}

/**
 * Valid state transitions for emergency resource assignments conforming to Phase 1.3 & 2.2.
 */
const VALID_TRANSITIONS: Record<AssignmentStatus, AssignmentStatus[]> = {
  ASSIGNED: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['DELIVERED', 'CANCELLED'],
  DELIVERED: ['RETURNED'],
  CANCELLED: ['RETURNED'], // Only allowed if cancelled while in transit (assets still in field)
  RETURNED: [], // Terminal status
};

/**
 * Check whether a requested status transition is legally permitted.
 */
export function isValidTransition(
  currentStatus: AssignmentStatus,
  newStatus: AssignmentStatus,
  inventoryAlreadyRestored: boolean = false
): boolean {
  if (currentStatus === 'CANCELLED' && newStatus === 'RETURNED' && inventoryAlreadyRestored) {
    return false; // Already checked in and restored
  }
  return VALID_TRANSITIONS[currentStatus]?.includes(newStatus) ?? false;
}

/**
 * Pure production state machine for resource assignment transitions.
 * Enforces atomic inventory restoration rules:
 * 1. ASSIGNED -> CANCELLED: Undispatched cancellation. Restores inventory immediately (inventory_restored = 1).
 * 2. IN_TRANSIT -> CANCELLED: Dispatched cancellation. Assets are in field; does NOT restore inventory (inventory_restored = 0).
 * 3. CANCELLED (where inventory_restored === 0) -> RETURNED: Physical check-in at depot. Restores inventory (inventory_restored = 1).
 * 4. DELIVERED -> RETURNED: Durable asset return from on-site deployment. Restores inventory (inventory_restored = 1).
 * 5. Guard: Repeated attempts never restore inventory twice.
 * 6. Guard: available_quantity never exceeds total_quantity.
 */
export function transitionAssignmentStatus(
  assignment: Assignment,
  newStatus: AssignmentStatus,
  resource: Resource
): TransitionOutcome {
  const currentStatus = assignment.status;
  const isAlreadyRestored = assignment.inventory_restored === 1;

  if (!isValidTransition(currentStatus, newStatus, isAlreadyRestored)) {
    throw new Error(
      `Illegal assignment state transition: Cannot transition assignment #${assignment.id} from "${currentStatus}" to "${newStatus}".`
    );
  }

  let shouldRestore = false;
  let restoredQuantity = 0;
  let message = '';

  // Rule 1: Undispatched cancellation
  if (currentStatus === 'ASSIGNED' && newStatus === 'CANCELLED') {
    if (!isAlreadyRestored) {
      shouldRestore = true;
      restoredQuantity = assignment.assigned_quantity;
      message = 'Assignment cancelled before dispatch. Available inventory restored to depot.';
    }
  }
  // Rule 2: Delivered asset return
  else if (currentStatus === 'DELIVERED' && newStatus === 'RETURNED') {
    if (!isAlreadyRestored) {
      shouldRestore = true;
      restoredQuantity = assignment.assigned_quantity;
      message = 'Delivered resource physically checked into depot. Available inventory restored.';
    }
  }
  // Rule 3: Return of recalled dispatched asset
  else if (currentStatus === 'CANCELLED' && newStatus === 'RETURNED') {
    if (!isAlreadyRestored) {
      shouldRestore = true;
      restoredQuantity = assignment.assigned_quantity;
      message = 'Recalled in-transit resource physically checked into depot. Available inventory restored.';
    }
  }
  // Rule 4: Dispatched cancellation
  else if (currentStatus === 'IN_TRANSIT' && newStatus === 'CANCELLED') {
    shouldRestore = false;
    restoredQuantity = 0;
    message =
      'Assignment cancelled while in transit. Assets remain in the field; stock will not be restored until physically checked into depot via Return.';
  } else if (newStatus === 'IN_TRANSIT') {
    message = 'Assignment marked in-transit. Asset departed depot towards incident site.';
  } else if (newStatus === 'DELIVERED') {
    message = 'Resource delivered and actively deployed on site.';
  }

  const newAvailable = shouldRestore
    ? Math.min(resource.total_quantity, resource.available_quantity + restoredQuantity)
    : resource.available_quantity;

  const updatedResource: Resource = {
    ...resource,
    available_quantity: newAvailable,
    updated_at: new Date().toISOString(),
  };

  const updatedAssignment: Assignment = {
    ...assignment,
    status: newStatus,
    updated_at: new Date().toISOString(),
    inventory_restored: shouldRestore ? 1 : assignment.inventory_restored,
  };

  return {
    success: true,
    updatedAssignment,
    updatedResource,
    inventoryRestored: shouldRestore,
    restoredQuantity,
    message,
  };
}

/**
 * Pure production service to allocate an emergency asset to an incident.
 * Validates stock boundaries: requested quantity must be <= available_quantity.
 */
export function allocateResource(
  incident: Incident,
  resource: Resource,
  quantity: number,
  notes: string = '',
  assignedBy: { id: number; name: string } = { id: 4, name: 'Dr. N. Sarma (District EOC)' }
): AllocationOutcome {
  if (quantity <= 0) {
    throw new Error('Allocation quantity must be greater than zero.');
  }

  if (quantity > resource.available_quantity) {
    throw new Error(
      `Insufficient inventory: Depot "${resource.location_name}" has only ${resource.available_quantity} ${resource.unit} available (requested: ${quantity}).`
    );
  }

  const updatedResource: Resource = {
    ...resource,
    available_quantity: resource.available_quantity - quantity,
    updated_at: new Date().toISOString(),
  };

  const newAssignment: Assignment = {
    id: Math.floor(Math.random() * 900) + 100,
    incident_id: incident.id,
    incident_title: incident.title,
    resource_id: resource.id,
    resource_name: resource.name,
    assigned_quantity: quantity,
    status: 'ASSIGNED',
    inventory_restored: 0,
    assigned_by: assignedBy.id,
    assigned_by_name: assignedBy.name,
    notes: notes || 'Allocated via Suraksha Tactical EOC',
    assigned_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return {
    success: true,
    newAssignment,
    updatedResource,
    message: `Allocated ${quantity} × ${resource.name} to incident #${incident.id}.`,
  };
}
