import { useState, useEffect, Suspense, lazy } from 'react';
import { MOCK_INCIDENTS } from './mocks/assamIncidents';
import { MOCK_RESOURCES, MOCK_ASSIGNMENTS } from './mocks/resources';
import { MOCK_DUPLICATES } from './mocks/duplicates';
import { MOCK_EVENTS } from './mocks/events';
import { Incident, IncidentSeverity, IncidentCategory, ReportedUrgency } from './types/incident';
import { Resource, Assignment, AssignmentStatus } from './types/resource';
import { QueuedOfflineReport } from './types/sync';
import { OperationsDashboard } from './components/Dashboard/OperationsDashboard';
import { ReportEmergency } from './components/Report/ReportEmergency';
import { IncidentDetailTriage } from './components/Triage/IncidentDetailTriage';
import { ResourceLogistics } from './components/Resources/ResourceLogistics';
import { OfflineOutbox } from './components/Sync/OfflineOutbox';
import { NgoNetwork, parseJwtPayload } from './components/Ngo/NgoNetwork';
import { CoordinatorLoginModal } from './components/Auth/CoordinatorLoginModal';

// Lazy-load MapLibre geospatial canvas for high performance & minimal initial bundle
const LiveIncidentMap = lazy(() =>
  import('./components/Map/LiveIncidentMap').then(m => ({ default: m.LiveIncidentMap }))
);

function MapLoadingFallback() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[760px] max-w-7xl mx-auto">
      <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col h-full space-y-4 shadow-sm animate-pulse">
        <div className="h-5 bg-slate-100 rounded w-1/3"></div>
        <div className="h-9 bg-slate-50 rounded"></div>
        <div className="space-y-3 flex-1">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-20 bg-slate-50 rounded border border-slate-100"></div>
          ))}
        </div>
      </div>
      <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg p-6 flex flex-col h-full items-center justify-center space-y-3 shadow-sm">
        <div className="w-8 h-8 border-3 border-teal-700 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-xs font-semibold text-slate-700 tracking-wide">
          Loading Brahmaputra Basin Geospatial Engine...
        </span>
        <span className="text-xs text-slate-500">
          Initializing client-side vector boundaries and MapLibre canvas
        </span>
      </div>
    </div>
  );
}

import {
  getAllQueuedReports,
  enqueueReport,
  processOutboxSync,
  forkConflictReport,
  discardConflictReport,
} from './services/outboxSyncService';
import {
  apiGetIncidents,
  apiVerifyIncident,
  setCoordinatorAuthToken,
} from './services/apiClient';
import {
  transitionAssignmentStatus,
  allocateResource,
} from './services/resourceLifecycleService';
import {
  Activity,
  MapPin,
  PlusCircle,
  ShieldAlert,
  Box,
  Database,
  RefreshCw,
  Shield,
  Building2,
  KeyRound,
  LogOut,
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'map' | 'report' | 'details' | 'resources' | 'ngos' | 'sync'>('dashboard');
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);

  // Coordinator Authentication Session State
  const [coordinatorToken, setCoordinatorTokenState] = useState<string | null>(() => {
    try {
      const stored = localStorage.getItem('suraksha_coordinator_jwt');
      if (stored) {
        const parsed = parseJwtPayload(stored);
        if (parsed?.exp && parsed.exp * 1000 < Date.now()) {
          localStorage.removeItem('suraksha_coordinator_jwt');
          return null;
        }
        return stored;
      }
      return null;
    } catch {
      return null;
    }
  });

  const handleSetCoordinatorToken = (token: string | null) => {
    setCoordinatorTokenState(token);
    setCoordinatorAuthToken(token);
    try {
      if (token) {
        localStorage.setItem('suraksha_coordinator_jwt', token);
      } else {
        localStorage.removeItem('suraksha_coordinator_jwt');
      }
    } catch {}
  };

  useEffect(() => {
    if (coordinatorToken) {
      const parsed = parseJwtPayload(coordinatorToken);
      if (parsed?.exp && parsed.exp * 1000 < Date.now()) {
        handleSetCoordinatorToken(null);
      } else {
        setCoordinatorAuthToken(coordinatorToken);
      }
    }
  }, [coordinatorToken]);

  // Helper to tag mock incidents as SIMULATED DEMO
  const taggedMockIncidents = MOCK_INCIDENTS.map(m => ({
    ...m,
    landmark: m.landmark.includes('[SIMULATED DEMO]') ? m.landmark : `${m.landmark} [SIMULATED DEMO]`,
  }));

  // Unified Central State (Single Source of Truth)
  const [incidents, setIncidents] = useState<Incident[]>(taggedMockIncidents);
  const [resources, setResources] = useState<Resource[]>(MOCK_RESOURCES);
  const [assignments, setAssignments] = useState<Assignment[]>(MOCK_ASSIGNMENTS);
  const [selectedIncidentId, setSelectedIncidentId] = useState<number>(101);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [outbox, setOutbox] = useState<QueuedOfflineReport[]>([]);

  // Alert and confirmation messages
  const [reportSuccessMsg, setReportSuccessMsg] = useState<string | null>(null);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);
  const [syncErrorMsg, setSyncErrorMsg] = useState<string | null>(null);

  // Load real server incidents from SQLite database on startup
  useEffect(() => {
    async function loadServerIncidents() {
      try {
        const res = await apiGetIncidents();
        if (res.success && res.data && res.data.length > 0) {
          const serverIds = new Set(res.data.map(i => i.id));
          const nonConflictingMocks = taggedMockIncidents.filter(m => !serverIds.has(m.id));
          setIncidents([...res.data, ...nonConflictingMocks]);
          setSelectedIncidentId(res.data[0].id);
        }
      } catch (err) {
        console.warn('Backend unavailable, operating in offline simulation mode:', err);
      }
    }
    loadServerIncidents();
  }, []);

  // Load existing persistent outbox reports from IndexedDB on startup
  useEffect(() => {
    async function loadPersistentOutbox() {
      try {
        const stored = await getAllQueuedReports();
        setOutbox(stored);
      } catch (err) {
        console.error('Failed to load reports from IndexedDB:', err);
      }
    }
    loadPersistentOutbox();
  }, []);

  // Monitor hardware network events
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const selectedIncident = incidents.find(i => i.id === selectedIncidentId) || incidents[0];
  const selectedEvents = selectedIncident ? MOCK_EVENTS[selectedIncident.id] || [] : [];
  const selectedDuplicates = selectedIncident
    ? MOCK_DUPLICATES.filter(
        d => d.primary_incident_id === selectedIncident.id || d.candidate_incident_id === selectedIncident.id
      )
    : [];

  // Coordinator Actions
  const handleVerifyIncident = async (id: number) => {
    try {
      const res = await apiVerifyIncident(
        id,
        'Ground truth confirmed via VHF radio contact with Revenue Circle Officer.'
      );
      if (res.success && res.data) {
        setIncidents(prev => prev.map(inc => (inc.id === id ? res.data! : inc)));
        setSyncSuccessMsg(`Incident #${id} ground truth verified and recorded in SQLite audit ledger.`);
        return;
      }
      if (res.status === 401 || res.status === 403) {
        setSyncErrorMsg(
          'Verification blocked: Incident verification requires a cryptographically verified coordinator JWT token. Anonymous verification is prohibited by security policy.'
        );
        return;
      }
    } catch (err: any) {
      console.warn('Backend verification error:', err);
      setSyncErrorMsg(
        'Verification request failed: Server requires cryptographically verified coordinator credentials.'
      );
    }
  };

  const handleEscalateSeverity = (id: number, newSev: IncidentSeverity) => {
    setIncidents(prev => prev.map(inc => (inc.id === id ? { ...inc, severity: newSev } : inc)));
  };

  // Submit Emergency Report with IndexedDB Persistence
  const handleReportSubmit = async (reportData: {
    title: string;
    description: string;
    category: IncidentCategory;
    reported_urgency: ReportedUrgency;
    landmark: string;
    affected_count: number;
    medical_required: boolean;
    latitude: number;
    longitude: number;
  }) => {
    try {
      // 1. Enqueue report to IndexedDB
      const queuedReport = await enqueueReport(reportData);

      // 2. Reload outbox state from IndexedDB to ensure absolute parity with disk storage
      const refreshedOutbox = await getAllQueuedReports();
      setOutbox(refreshedOutbox);

      if (!isOnline) {
        setReportSuccessMsg(
          `Offline Mode Active: Report #${queuedReport.client_report_id.substring(
            0,
            8
          )} safely buffered in local IndexedDB. It will survive page refresh.`
        );
      } else {
        setReportSuccessMsg(
          `Distress report persisted in local outbox (UUID: ${queuedReport.client_report_id.substring(
            0,
            8
          )}...). Navigate to Offline Outbox to sync with central server.`
        );
      }
    } catch (err) {
      console.error('Failed to persist report to IndexedDB:', err);
      setReportSuccessMsg('Warning: Failed to persist report into local IndexedDB storage.');
    }
  };

  // Synchronize Offline Outbox (Conforming to API Contract Idempotency Rules)
  const handleSyncOutbox = async () => {
    setSyncSuccessMsg(null);
    setSyncErrorMsg(null);

    try {
      const result = await processOutboxSync(incidents, isOnline);

      if (result.syncedIncidents.length > 0) {
        const serverIds = new Set(result.syncedIncidents.map(i => i.id));
        const nonConflictingMocks = taggedMockIncidents.filter(m => !serverIds.has(m.id));
        setIncidents([...result.syncedIncidents, ...nonConflictingMocks]);
        setSelectedIncidentId(result.syncedIncidents[0].id);
      }

      // Reload remaining/conflicted reports from IndexedDB
      const remainingReports = await getAllQueuedReports();
      setOutbox(remainingReports);

      const { synced_count, already_synced_count, rejected_count } = result.batchResponse;

      if (rejected_count > 0) {
        setSyncErrorMsg(
          `Batch sync processed: ${synced_count} synced, ${already_synced_count} already synced, ${rejected_count} conflict(s) require resolution.`
        );
      } else if (synced_count > 0 || already_synced_count > 0) {
        setSyncSuccessMsg(
          `Successfully synchronized ${synced_count} report(s) to SQLite database (${already_synced_count} idempotent acknowledgements).`
        );
      }
    } catch (err: any) {
      setSyncErrorMsg(err.message || 'Synchronization failed.');
    }
  };

  // Conflict Resolution: Option A (Fork as New Report with Fresh UUID)
  const handleForkConflict = async (report: QueuedOfflineReport) => {
    await forkConflictReport(report);
    const updated = await getAllQueuedReports();
    setOutbox(updated);
    setSyncSuccessMsg('Conflicting report forked with a new UUIDv4 and re-enqueued for clean synchronization.');
  };

  // Conflict Resolution: Option B (Discard Local Draft)
  const handleDiscardConflict = async (client_report_id: string) => {
    await discardConflictReport(client_report_id);
    const updated = await getAllQueuedReports();
    setOutbox(updated);
    setSyncSuccessMsg('Conflicting local draft discarded. Original server record preserved.');
  };

  // Resource Assignment Lifecycle (Calling Production Service)
  const handleUpdateAssignmentStatus = (assignmentId: number, newStatus: AssignmentStatus) => {
    const targetAssignment = assignments.find(a => a.id === assignmentId);
    if (!targetAssignment) return;

    const targetResource = resources.find(r => r.id === targetAssignment.resource_id);
    if (!targetResource) return;

    try {
      const outcome = transitionAssignmentStatus(targetAssignment, newStatus, targetResource);

      setResources(prev =>
        prev.map(r => (r.id === outcome.updatedResource.id ? outcome.updatedResource : r))
      );
      setAssignments(prev =>
        prev.map(a => (a.id === outcome.updatedAssignment.id ? outcome.updatedAssignment : a))
      );
    } catch (err: any) {
      console.error('Resource lifecycle transition error:', err.message);
    }
  };

  const handleCreateAssignment = (
    incidentId: number,
    resourceId: number,
    quantity: number,
    notes: string
  ) => {
    const targetResource = resources.find(r => r.id === resourceId);
    const targetIncident = incidents.find(i => i.id === incidentId);
    if (!targetResource || !targetIncident) return;

    try {
      const outcome = allocateResource(targetIncident, targetResource, quantity, notes);

      setResources(prev =>
        prev.map(r => (r.id === outcome.updatedResource.id ? outcome.updatedResource : r))
      );
      setAssignments(prev => [outcome.newAssignment, ...prev]);
    } catch (err: any) {
      console.error('Resource allocation error:', err.message);
    }
  };

  const pendingOutboxCount = outbox.filter(i => i.status === 'QUEUED' || i.status === 'FAILED').length;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans antialiased">
      {/* ENTERPRISE PRODUCT HEADER */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded bg-teal-800 text-white flex items-center justify-center font-bold shadow-sm">
              <Shield className="w-4 h-4 text-teal-200" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-base font-bold tracking-tight text-slate-900">
                  SURAKSHA<span className="text-teal-800 font-medium">GRID</span>
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium border border-slate-200">
                  Assam Flood EOC
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                Emergency Operations & Field Resource Coordination Platform
              </p>
            </div>
          </div>
        </div>

        {/* Status, Simulation Indicator, and Connectivity */}
        <div className="flex items-center space-x-3 text-xs">
          {/* Coordinator Role & Authentication Controls */}
          {coordinatorToken ? (
            <div className="flex items-center space-x-1.5">
              <span className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full border border-emerald-300 bg-emerald-50 text-emerald-800 text-xs font-semibold">
                <Shield className="w-3 h-3 text-emerald-600" />
                <span>Coordinator Active</span>
              </span>
              <button
                onClick={() => {
                  handleSetCoordinatorToken(null);
                  setSyncSuccessMsg('Signed out of coordinator session.');
                }}
                className="flex items-center space-x-1 px-2.5 py-1 rounded border border-slate-200 text-slate-600 hover:text-rose-700 hover:bg-rose-50 hover:border-rose-200 text-[11px] font-medium transition cursor-pointer"
                title="Sign out of coordinator session"
              >
                <LogOut className="w-3 h-3" />
                <span>Logout</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsLoginModalOpen(true)}
              className="flex items-center space-x-1.5 px-3 py-1 rounded-full border border-teal-700 bg-teal-50 hover:bg-teal-100 text-teal-900 text-xs font-semibold cursor-pointer transition shadow-2xs"
              title="Sign in with coordinator credentials"
            >
              <KeyRound className="w-3 h-3 text-teal-700" />
              <span>Coordinator Sign In</span>
            </button>
          )}

          <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-600 font-medium border border-slate-200 text-[11px]">
            SIMULATED DEMO DATA
          </span>

          <div
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${
              isOnline
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {isOnline ? (
              <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block"></span>
            ) : (
              <span className="w-2 h-2 rounded-full bg-rose-600 inline-block"></span>
            )}
            <span>{isOnline ? 'Uplink: Online' : 'Network: Offline (IDB Buffer)'}</span>
          </div>

          {pendingOutboxCount > 0 && (
            <button
              onClick={() => setActiveTab('sync')}
              className="bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 px-2.5 py-1 rounded font-medium transition flex items-center space-x-1.5 shadow-xs"
            >
              <RefreshCw className="w-3 h-3 text-amber-700" />
              <span>Outbox ({pendingOutboxCount}) Sync Ready</span>
            </button>
          )}
        </div>
      </header>

      {/* REFINED NAVIGATION BAR */}
      <nav className="bg-white border-b border-slate-200 px-6 flex space-x-1 text-xs font-medium overflow-x-auto z-20">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`px-3.5 py-3 transition flex items-center space-x-2 whitespace-nowrap border-b-2 -mb-px ${
            activeTab === 'dashboard'
              ? 'border-teal-800 text-teal-900 font-semibold bg-teal-50/40'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Activity className="w-4 h-4 text-slate-500" />
          <span>Operations Dashboard</span>
          <span className="ml-1 px-1.5 py-0.2 rounded bg-slate-100 text-[11px] text-slate-600 font-mono">
            {incidents.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('map')}
          className={`px-3.5 py-3 transition flex items-center space-x-2 whitespace-nowrap border-b-2 -mb-px ${
            activeTab === 'map'
              ? 'border-teal-800 text-teal-900 font-semibold bg-teal-50/40'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <MapPin className="w-4 h-4 text-slate-500" />
          <span>Live Incident Map</span>
        </button>

        <button
          onClick={() => setActiveTab('report')}
          className={`px-3.5 py-3 transition flex items-center space-x-2 whitespace-nowrap border-b-2 -mb-px ${
            activeTab === 'report'
              ? 'border-teal-800 text-teal-900 font-semibold bg-teal-50/40'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <PlusCircle className="w-4 h-4 text-slate-500" />
          <span>+ Report Emergency</span>
        </button>

        <button
          onClick={() => setActiveTab('details')}
          className={`px-3.5 py-3 transition flex items-center space-x-2 whitespace-nowrap border-b-2 -mb-px ${
            activeTab === 'details'
              ? 'border-teal-800 text-teal-900 font-semibold bg-teal-50/40'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <ShieldAlert className="w-4 h-4 text-slate-500" />
          <span>Incident Detail & Triage</span>
          <span className="ml-1 px-1.5 py-0.2 rounded bg-slate-100 text-[11px] text-slate-600 font-mono">
            #{selectedIncident.id}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('resources')}
          className={`px-3.5 py-3 transition flex items-center space-x-2 whitespace-nowrap border-b-2 -mb-px ${
            activeTab === 'resources'
              ? 'border-teal-800 text-teal-900 font-semibold bg-teal-50/40'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Box className="w-4 h-4 text-slate-500" />
          <span>Resource Logistics</span>
          <span className="ml-1 px-1.5 py-0.2 rounded bg-slate-100 text-[11px] text-slate-600 font-mono">
            {assignments.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('ngos')}
          className={`px-3.5 py-3 transition flex items-center space-x-2 whitespace-nowrap border-b-2 -mb-px ${
            activeTab === 'ngos'
              ? 'border-teal-800 text-teal-900 font-semibold bg-teal-50/40'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Building2 className="w-4 h-4 text-slate-500" />
          <span>NGO Network</span>
        </button>

        <button
          onClick={() => setActiveTab('sync')}
          className={`px-3.5 py-3 transition flex items-center space-x-2 whitespace-nowrap border-b-2 -mb-px ${
            activeTab === 'sync'
              ? 'border-teal-800 text-teal-900 font-semibold bg-teal-50/40'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Database className="w-4 h-4 text-slate-500" />
          <span>Offline Outbox</span>
          {outbox.length > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded bg-amber-100 border border-amber-300 text-[11px] font-mono font-bold text-amber-900">
              {outbox.length}
            </span>
          )}
        </button>
      </nav>

      {/* MAIN OPERATIONS WORKSPACE */}
      <main className="flex-1 p-6 bg-slate-50 overflow-auto">
        {/* TAB 1: OPERATIONS DASHBOARD */}
        {activeTab === 'dashboard' && (
          <OperationsDashboard
            incidents={incidents}
            resources={resources}
            assignments={assignments}
            onVerifyIncident={handleVerifyIncident}
            onEscalateSeverity={handleEscalateSeverity}
            onNavigateToMap={id => {
              if (id) setSelectedIncidentId(id);
              setActiveTab('map');
            }}
            onNavigateToDetails={id => {
              setSelectedIncidentId(id);
              setActiveTab('details');
            }}
            onNavigateToResources={() => setActiveTab('resources')}
            onNavigateToReport={() => setActiveTab('report')}
          />
        )}

        {/* TAB 2: LIVE GEOSPATIAL INCIDENT MAP */}
        {activeTab === 'map' && (
          <Suspense fallback={<MapLoadingFallback />}>
            <LiveIncidentMap
              incidents={incidents}
              resources={resources}
              selectedIncidentId={selectedIncidentId}
              onSelectIncident={setSelectedIncidentId}
              onNavigateToDetails={id => {
                setSelectedIncidentId(id);
                setActiveTab('details');
              }}
              onNavigateToResources={() => setActiveTab('resources')}
            />
          </Suspense>
        )}

        {/* TAB 3: REPORT EMERGENCY */}
        {activeTab === 'report' && (
          <ReportEmergency
            isOnline={isOnline}
            onSubmitReport={handleReportSubmit}
            successMessage={reportSuccessMsg}
            onClearSuccessMessage={() => setReportSuccessMsg(null)}
          />
        )}

        {/* TAB 4: INCIDENT DETAILS & TRIAGE */}
        {activeTab === 'details' && selectedIncident && (
          <IncidentDetailTriage
            incidents={incidents}
            selectedIncident={selectedIncident}
            events={selectedEvents}
            duplicates={selectedDuplicates}
            onSelectIncident={setSelectedIncidentId}
            onVerifyIncident={handleVerifyIncident}
            onEscalateSeverity={handleEscalateSeverity}
            onNavigateToResources={() => setActiveTab('resources')}
            coordinatorToken={coordinatorToken}
            onNavigateToNgos={() => setActiveTab('ngos')}
            onOpenLogin={() => setIsLoginModalOpen(true)}
          />
        )}

        {/* TAB 5: RESOURCE LOGISTICS */}
        {activeTab === 'resources' && (
          <ResourceLogistics
            resources={resources}
            assignments={assignments}
            incidents={incidents}
            onUpdateAssignmentStatus={handleUpdateAssignmentStatus}
            onCreateAssignment={handleCreateAssignment}
          />
        )}

        {/* TAB 6: NGO NETWORK */}
        {activeTab === 'ngos' && (
          <NgoNetwork
            coordinatorToken={coordinatorToken}
            onSetCoordinatorToken={handleSetCoordinatorToken}
            onOpenLogin={() => setIsLoginModalOpen(true)}
          />
        )}

        {/* TAB 7: OFFLINE OUTBOX & SYNC */}
        {activeTab === 'sync' && (
          <OfflineOutbox
            outbox={outbox}
            isOnline={isOnline}
            onToggleOnlineSimulation={() => setIsOnline(prev => !prev)}
            onSyncOutbox={handleSyncOutbox}
            onForkConflict={handleForkConflict}
            onDiscardConflict={handleDiscardConflict}
            syncSuccessMessage={syncSuccessMsg}
            syncErrorMessage={syncErrorMsg}
          />
        )}
      </main>

      {/* Global Coordinator Login Modal */}
      <CoordinatorLoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onLoginSuccess={(token, user) => {
          handleSetCoordinatorToken(token);
          setSyncSuccessMsg(`Authenticated successfully as coordinator: ${user.full_name} (${user.username}).`);
        }}
      />

      {/* REFINED OPERATIONAL FOOTER */}
      <footer className="bg-white border-t border-slate-200 px-6 py-2.5 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <span>SURAKSHA GRID v1.0 • Assam State Flood Coordination</span>
          <span className="text-slate-300">•</span>
          <span>Offline Spatio-Temporal Sync</span>
        </div>
        <div className="flex items-center space-x-3 text-[11px]">
          <span>WHYCODE4U Hackathon 2026</span>
          <span className="text-slate-300">•</span>
          <span className="font-mono">Client DB: suraksha_grid_offline_db</span>
        </div>
      </footer>
    </div>
  );
}
