import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  Search,
  RefreshCw,
  Shield,
  ShieldCheck,
  AlertTriangle,
  PlusCircle,
  MapPin,
  KeyRound,
  X,
  ExternalLink,
  Lock,
} from 'lucide-react';
import {
  NgoSummary,
  ASSAM_DISTRICTS,
} from '../../types/ngo';
import {
  apiGetNgos,
  apiRegisterNgo,
} from '../../services/apiClient';
import { NgoDetailDrawer } from './NgoDetailDrawer';

interface NgoNetworkProps {
  coordinatorToken: string | null;
  onSetCoordinatorToken: (token: string | null) => void;
  onOpenLogin?: () => void;
}

export interface TokenPayload {
  id?: number;
  sub?: number;
  username?: string;
  role?: string;
  full_name?: string;
  exp?: number;
}

export function parseJwtPayload(token: string | null): TokenPayload | null {
  if (!token) return null;
  try {
    const raw = token.trim().replace(/^Bearer\s+/i, '');
    const parts = raw.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

export const NgoNetwork: React.FC<NgoNetworkProps> = ({
  coordinatorToken,
  onSetCoordinatorToken,
  onOpenLogin,
}) => {
  const [ngos, setNgos] = useState<NgoSummary[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDistrict, setSelectedDistrict] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'OPERATIONAL' | 'SIMULATED'>('ALL');

  // Drawer & Modals
  const [selectedNgoId, setSelectedNgoId] = useState<string | null>(null);

  // Register Modal State & Form Fields (Strictly matching createNgoSchema)
  const [isRegisterOpen, setIsRegisterOpen] = useState<boolean>(false);
  const [registerForm, setRegisterForm] = useState({
    id: '',
    name: '',
    legal_name: '',
    registration_reference: '',
    description: '',
    primary_contact_name: '',
    primary_contact_phone: '',
    primary_contact_email: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [isSubmittingRegister, setIsSubmittingRegister] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<{ text: string; ngoId?: string } | null>(null);

  const parsedToken = parseJwtPayload(coordinatorToken);
  const isTokenExpired = Boolean(parsedToken?.exp && parsedToken.exp * 1000 < Date.now());
  const hasCoordinatorRole = Boolean(parsedToken && (parsedToken.role === 'coordinator' || parsedToken.role === 'admin'));
  const isCoordinator = Boolean(coordinatorToken && parsedToken && hasCoordinatorRole && !isTokenExpired);

  // Load NGO Directory from backend
  const loadDirectory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGetNgos(
        {
          search: searchQuery.trim() || undefined,
          district: selectedDistrict || undefined,
          filter_mode: filterMode,
          limit: 50,
        },
        coordinatorToken || undefined
      );

      if (res.success) {
        // Defensive array extraction: handle data as array OR data.ngos if wrapped
        const rawList: NgoSummary[] = Array.isArray(res.data)
          ? res.data
          : Array.isArray((res.data as any)?.ngos)
          ? (res.data as any).ngos
          : [];

        setNgos(rawList);
        const total = typeof res.meta?.total === 'number'
          ? res.meta.total
          : typeof (res.data as any)?.meta?.total === 'number'
          ? (res.data as any).meta.total
          : rawList.length;

        setTotalCount(total);
      } else {
        setError(res.error?.message || 'Failed to retrieve NGO directory.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error communicating with NGO service.');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedDistrict, filterMode, coordinatorToken]);

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  // Client-side field validation matching backend createNgoSchema
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    const cleanId = registerForm.id.trim();
    if (!cleanId) {
      errors.id = 'Partner Identifier (slug) is required.';
    } else if (cleanId.length < 3) {
      errors.id = 'ID must be at least 3 characters.';
    } else if (cleanId.length > 64) {
      errors.id = 'ID cannot exceed 64 characters.';
    } else if (!/^[a-z0-9_-]+$/i.test(cleanId)) {
      errors.id = 'ID must be alphanumeric with hyphens or underscores (no spaces or special symbols).';
    }

    const cleanName = registerForm.name.trim();
    if (!cleanName) {
      errors.name = 'Organization Display Name is required.';
    } else if (cleanName.length < 3) {
      errors.name = 'Name must be at least 3 characters.';
    } else if (cleanName.length > 200) {
      errors.name = 'Name cannot exceed 200 characters.';
    }

    if (registerForm.legal_name && registerForm.legal_name.trim().length > 255) {
      errors.legal_name = 'Legal name cannot exceed 255 characters.';
    }

    if (registerForm.registration_reference && registerForm.registration_reference.trim().length > 100) {
      errors.registration_reference = 'Registration reference cannot exceed 100 characters.';
    }

    if (registerForm.description && registerForm.description.trim().length > 2000) {
      errors.description = 'Description cannot exceed 2000 characters.';
    }

    const cleanContact = registerForm.primary_contact_name.trim();
    if (!cleanContact) {
      errors.primary_contact_name = 'Representative Name is required.';
    } else if (cleanContact.length < 2) {
      errors.primary_contact_name = 'Representative name must be at least 2 characters.';
    } else if (cleanContact.length > 150) {
      errors.primary_contact_name = 'Representative name cannot exceed 150 characters.';
    }

    const cleanPhone = registerForm.primary_contact_phone.trim();
    if (!cleanPhone) {
      errors.primary_contact_phone = 'Contact Phone is required.';
    } else if (cleanPhone.length < 7) {
      errors.primary_contact_phone = 'Phone must be at least 7 digits.';
    } else if (cleanPhone.length > 20) {
      errors.primary_contact_phone = 'Phone cannot exceed 20 digits.';
    }

    const cleanEmail = registerForm.primary_contact_email.trim();
    if (cleanEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        errors.primary_contact_email = 'Invalid email address format (e.g. contact@domain.org).';
      } else if (cleanEmail.length > 150) {
        errors.primary_contact_email = 'Email cannot exceed 150 characters.';
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle NGO Registration Submission
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError(null);

    if (!isCoordinator || !coordinatorToken) {
      setRegisterError('Coordinator authentication required. Please supply a valid coordinator JWT token.');
      return;
    }

    if (!validateForm()) {
      return;
    }

    setIsSubmittingRegister(true);

    try {
      // Clean payload strictly adhering to createNgoSchema (no invented fields)
      const payload = {
        id: registerForm.id.trim(),
        name: registerForm.name.trim(),
        legal_name: registerForm.legal_name.trim() || undefined,
        registration_reference: registerForm.registration_reference.trim() || undefined,
        description: registerForm.description.trim() || undefined,
        primary_contact_name: registerForm.primary_contact_name.trim(),
        primary_contact_phone: registerForm.primary_contact_phone.trim(),
        primary_contact_email: registerForm.primary_contact_email.trim() || undefined,
        is_simulated: true, // Mandatory: all fresh registrations default to SIMULATED
      };

      const res = await apiRegisterNgo(payload, coordinatorToken);

      if (res.success) {
        const createdId = payload.id;
        const createdName = payload.name;

        setIsRegisterOpen(false);
        setRegisterForm({
          id: '',
          name: '',
          legal_name: '',
          registration_reference: '',
          description: '',
          primary_contact_name: '',
          primary_contact_phone: '',
          primary_contact_email: '',
        });
        setFieldErrors({});

        // If currently filtering operational only, switch to ALL so user sees the new simulated partner
        if (filterMode === 'OPERATIONAL') {
          setFilterMode('ALL');
        } else {
          await loadDirectory();
        }

        setSuccessMessage({
          text: `Successfully registered "${createdName}" (ID: #${createdId}). New partners are visibly isolated as DEMO DATA (SIMULATED) until explicit 5-D coordinator verification.`,
          ngoId: createdId,
        });
      } else {
        if (res.status === 401) {
          setRegisterError(res.error?.message || 'Unauthorized: A cryptographically verified coordinator JWT token is required.');
        } else if (res.status === 403) {
          setRegisterError(res.error?.message || 'Forbidden: Role is not authorized to register partners. Coordinator privileges required.');
        } else if (res.status === 409) {
          setRegisterError(res.error?.message || `Conflict: An NGO with identifier '${registerForm.id.trim()}' already exists in the grid.`);
          setFieldErrors(prev => ({ ...prev, id: 'This identifier is already taken.' }));
        } else if (res.error?.code === 'VALIDATION_ERROR' && Array.isArray(res.error.details)) {
          setRegisterError(res.error.message || 'Validation error: please check highlighted fields.');
          const serverErrors: Record<string, string> = {};
          for (const d of res.error.details) {
            if (d.field) serverErrors[d.field] = d.issue;
          }
          setFieldErrors(serverErrors);
        } else {
          setRegisterError(res.error?.message || `Request failed with HTTP status ${res.status}`);
        }
      }
    } catch (err: any) {
      setRegisterError(err.message || 'Network error communicating with NGO registration service.');
    } finally {
      setIsSubmittingRegister(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* 1. PRODUCT HEADER & QUICK STATS */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 p-5 rounded-lg shadow-xs">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
            <Building2 className="w-5 h-5 text-teal-800" />
            <span>NGO Partner Network & Civil Defense Directory</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Verified humanitarian organizations and disaster response partners across Assam. Verified with 5-D audit criteria.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2.5">
          {/* Coordinator Login / Status Trigger */}
          {isCoordinator ? (
            <div className="flex items-center space-x-1.5">
              <span className="px-3 py-1.5 rounded text-xs font-semibold border bg-emerald-50 border-emerald-300 text-emerald-800 flex items-center space-x-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Coordinator: {parsedToken?.username || 'Active'}</span>
              </span>
              <button
                onClick={() => onSetCoordinatorToken(null)}
                className="px-2.5 py-1.5 rounded text-xs font-medium text-slate-600 hover:text-rose-700 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 transition cursor-pointer"
                title="Sign out of coordinator session"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenLogin}
              className="px-3.5 py-1.5 rounded text-xs font-semibold border border-teal-700 bg-teal-50 hover:bg-teal-100 text-teal-900 flex items-center space-x-1.5 transition cursor-pointer shadow-2xs"
            >
              <KeyRound className="w-3.5 h-3.5 text-teal-700" />
              <span>Coordinator Sign In</span>
            </button>
          )}

          {/* Register Partner Button (Coordinator Only) */}
          {isCoordinator ? (
            <button
              onClick={() => {
                setRegisterError(null);
                setIsRegisterOpen(true);
              }}
              className="bg-teal-800 hover:bg-teal-900 text-white px-3.5 py-1.5 rounded font-medium text-xs transition flex items-center space-x-1.5 shadow-xs cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Register Partner</span>
            </button>
          ) : (
            <button
              onClick={onOpenLogin}
              title="Sign in with coordinator credentials to register humanitarian partners"
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 px-3.5 py-1.5 rounded font-medium text-xs flex items-center space-x-1.5 cursor-pointer transition"
            >
              <Lock className="w-3.5 h-3.5 text-slate-500" />
              <span>Register Partner (Sign In)</span>
            </button>
          )}

          {/* Manual Refresh */}
          <button
            onClick={loadDirectory}
            disabled={loading}
            className="p-1.5 rounded border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition"
            title="Refresh NGO Network"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-teal-800' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. SECURITY MODE BANNER */}
      {isCoordinator ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 px-4 text-xs text-emerald-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>
              <strong>Coordinator Privilege Active ({parsedToken?.username || 'Verified'}):</strong> Full unredacted contact numbers, exact GPS staging coordinates, and 5-D audit ledger verification privileges are unlocked.
            </span>
          </div>
          <button
            onClick={() => onSetCoordinatorToken(null)}
            className="text-emerald-900 font-semibold hover:underline text-[11px] whitespace-nowrap ml-3 cursor-pointer"
          >
            Sign Out (Switch to Public)
          </button>
        </div>
      ) : coordinatorToken && isTokenExpired ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 px-4 text-xs text-amber-900 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Coordinator Session Expired:</strong> Your coordinator session has expired. Please sign in again.
            </span>
          </div>
          <button
            onClick={onOpenLogin}
            className="text-amber-900 font-semibold hover:underline text-[11px] whitespace-nowrap ml-3 cursor-pointer"
          >
            Sign In Again
          </button>
        </div>
      ) : coordinatorToken && !hasCoordinatorRole ? (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 px-4 text-xs text-rose-900 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              <strong>Insufficient Role Privileges:</strong> Active session belongs to <code>{parsedToken?.username || 'user'}</code> with role <code>'{parsedToken?.role || 'unknown'}'</code>. Coordinator privileges required.
            </span>
          </div>
          <button
            onClick={onOpenLogin}
            className="text-rose-900 font-semibold hover:underline text-[11px] whitespace-nowrap ml-3 cursor-pointer"
          >
            Switch Account
          </button>
        </div>
      ) : (
        <div className="bg-slate-100/80 border border-slate-200 rounded-lg p-3 px-4 text-xs text-slate-600 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Lock className="w-4 h-4 text-slate-500 shrink-0" />
            <span>
              <strong>Public View:</strong> Read-only access with privacy-redacted contact details. Sign in as coordinator to register partners, audit 5-D verifications, and view staging logistics.
            </span>
          </div>
          <button
            onClick={onOpenLogin}
            className="text-teal-800 font-semibold hover:underline text-[11px] whitespace-nowrap ml-3 cursor-pointer"
          >
            Sign In as Coordinator
          </button>
        </div>
      )}

      {/* 2.5 SUCCESS NOTIFICATION BANNER */}
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3.5 px-4 text-xs text-emerald-900 flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{successMessage.text}</span>
          </div>
          <div className="flex items-center space-x-2 ml-3">
            {successMessage.ngoId && (
              <button
                onClick={() => {
                  setSelectedNgoId(successMessage.ngoId!);
                  setSuccessMessage(null);
                }}
                className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-[11px] font-medium transition cursor-pointer"
              >
                Open Dossier
              </button>
            )}
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-emerald-700 hover:text-emerald-950 p-1"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 3. SEARCH & FILTER TOOLBAR */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Search Query */}
          <div className="md:col-span-5 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search partner name, registration code, or keywords..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full border border-slate-300 rounded pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-teal-700"
            />
          </div>

          {/* District Filter */}
          <div className="md:col-span-4">
            <select
              value={selectedDistrict}
              onChange={e => setSelectedDistrict(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-1.5 text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-700"
            >
              <option value="">All Assam Districts (Statewide)</option>
              {ASSAM_DISTRICTS.map(dist => (
                <option key={dist} value={dist}>
                  {dist}
                </option>
              ))}
            </select>
          </div>

          {/* Filter Mode: All / Operational / Simulated */}
          <div className="md:col-span-3 flex border border-slate-200 rounded overflow-hidden text-xs">
            <button
              onClick={() => setFilterMode('ALL')}
              className={`flex-1 py-1.5 text-center font-medium transition ${
                filterMode === 'ALL'
                  ? 'bg-teal-800 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterMode('OPERATIONAL')}
              className={`flex-1 py-1.5 text-center font-medium transition border-l border-slate-200 ${
                filterMode === 'OPERATIONAL'
                  ? 'bg-teal-800 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              Operational
            </button>
            <button
              onClick={() => setFilterMode('SIMULATED')}
              className={`flex-1 py-1.5 text-center font-medium transition border-l border-slate-200 ${
                filterMode === 'SIMULATED'
                  ? 'bg-teal-800 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              Demo Only
            </button>
          </div>
        </div>

        {/* Results Count & Badges */}
        <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
          <span>
            Showing <strong className="text-slate-800">{(ngos || []).length}</strong> of{' '}
            <strong className="text-slate-800">{totalCount}</strong> registered partners
          </span>

          <span className="text-[11px] font-mono text-slate-400">
            Source: SQLite /api/v1/ngos
          </span>
        </div>
      </div>

      {/* 4. LOADING STATE */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div
              key={i}
              className="bg-white border border-slate-200 rounded-lg p-5 space-y-3 shadow-xs animate-pulse"
            >
              <div className="flex justify-between">
                <div className="h-5 bg-slate-200 rounded w-1/2"></div>
                <div className="h-5 bg-slate-100 rounded w-1/4"></div>
              </div>
              <div className="h-3 bg-slate-100 rounded w-3/4"></div>
              <div className="space-y-2 pt-2">
                <div className="h-4 bg-slate-100 rounded"></div>
                <div className="h-4 bg-slate-100 rounded w-5/6"></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 5. ERROR STATE */}
      {!loading && error && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-6 text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-rose-600 mx-auto" />
          <h3 className="text-sm font-bold text-rose-900">Failed to Load NGO Directory</h3>
          <p className="text-xs text-rose-700 max-w-md mx-auto">{error}</p>
          <button
            onClick={loadDirectory}
            className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded text-xs font-medium transition cursor-pointer shadow-xs"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* 6. EMPTY STATE */}
      {!loading && !error && (ngos || []).length === 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center space-y-4 shadow-xs">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
            <Building2 className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-800">No NGO Partners Found</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              No humanitarian partners match your current filter parameters or the database has not yet received verified partner entries.
            </p>
          </div>

          <div className="flex justify-center gap-3 pt-2">
            {(searchQuery || selectedDistrict || filterMode !== 'ALL') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedDistrict('');
                  setFilterMode('ALL');
                }}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium transition"
              >
                Clear Filters
              </button>
            )}

            {isCoordinator && (
              <button
                onClick={() => setIsRegisterOpen(true)}
                className="px-3.5 py-1.5 bg-teal-800 hover:bg-teal-900 text-white rounded text-xs font-medium transition flex items-center space-x-1.5 shadow-xs"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Register First NGO</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 7. NGO CARDS GRID */}
      {!loading && !error && (ngos || []).length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {(ngos || []).map(ngo => {
            const verifiedCount = Array.isArray(ngo.active_verification_dimensions)
              ? ngo.active_verification_dimensions.length
              : 0;
            const isFullyVerified = verifiedCount === 5;
            const primaryDistrict = Array.isArray(ngo.operating_coverage) && ngo.operating_coverage.length > 0
              ? ngo.operating_coverage[0]?.district || 'Assam Statewide'
              : 'Assam Statewide';
            const capabilities = Array.isArray(ngo.capabilities) ? ngo.capabilities : [];

            return (
              <div
                key={ngo.id}
                className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 transition space-y-4"
              >
                <div className="space-y-3">
                  {/* Top Row: Title & Simulation / Verification Badges */}
                  <div className="space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-bold text-slate-900 leading-snug line-clamp-1">
                        {ngo.name}
                      </h3>

                      {/* Prominent Demo Watermark / Operational Badge */}
                      {ngo.is_simulated ? (
                        <span className="shrink-0 px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-300 font-bold text-[10px] flex items-center space-x-1">
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          <span>DEMO DATA</span>
                        </span>
                      ) : (
                        <span className="shrink-0 px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold text-[10px] flex items-center space-x-1">
                          <ShieldCheck className="w-3 h-3 text-emerald-600" />
                          <span>OPERATIONAL</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-2 text-[11px] text-slate-500">
                      <span className="flex items-center space-x-1">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        <span>{primaryDistrict}</span>
                      </span>
                      {ngo.registration_reference && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span className="font-mono">{ngo.registration_reference}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Mandate Description Snippet */}
                  {ngo.description && (
                    <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                      {ngo.description}
                    </p>
                  )}

                  {/* Capabilities Tags */}
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Capabilities
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {capabilities.length > 0 ? (
                        capabilities.slice(0, 3).map((cap, idx) => {
                          const capLabel = typeof cap === 'object' && cap !== null ? (cap as any).name || (cap as any).capability_id : String(cap);
                          return (
                            <span
                              key={idx}
                              className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[11px] font-medium"
                            >
                              {capLabel}
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">No capabilities tagged</span>
                      )}
                      {capabilities.length > 3 && (
                        <span className="text-[11px] text-slate-500 font-medium">
                          +{capabilities.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Verification & Availability Status Badges */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    {/* 5-D Verification Counter */}
                    <div className="flex items-center space-x-1.5">
                      <Shield className={`w-3.5 h-3.5 ${isFullyVerified ? 'text-teal-700' : 'text-slate-400'}`} />
                      <span className={`text-[11px] font-medium ${isFullyVerified ? 'text-teal-900 font-semibold' : 'text-slate-600'}`}>
                        {verifiedCount} / 5 Dimensions
                      </span>
                    </div>

                    {/* Freshness Badge */}
                    {ngo.availability_summary ? (
                      <span
                        className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                          ngo.availability_summary.freshness === 'FRESH'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : ngo.availability_summary.freshness === 'AGING'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {ngo.availability_summary.status}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400">Unchecked</span>
                    )}
                  </div>
                </div>

                {/* Footer Action */}
                <button
                  onClick={() => setSelectedNgoId(ngo.id)}
                  className="w-full py-2 bg-slate-50 hover:bg-slate-100 text-slate-800 font-medium text-xs rounded border border-slate-200 transition flex items-center justify-center space-x-1.5 cursor-pointer"
                >
                  <span>View Partner Dossier</span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* 8. NGO DETAIL DRAWER */}
      {selectedNgoId && (
        <NgoDetailDrawer
          ngoId={selectedNgoId}
          isCoordinator={isCoordinator}
          coordinatorToken={coordinatorToken}
          onClose={() => setSelectedNgoId(null)}
          onRefreshList={loadDirectory}
          onOpenLogin={onOpenLogin}
        />
      )}

      {/* 10. REGISTER NGO MODAL (COORDINATOR ONLY) */}
      {isRegisterOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 flex items-center space-x-2">
                <Building2 className="w-4 h-4 text-teal-800" />
                <span>Register New NGO Partner</span>
              </h3>
              <button
                onClick={() => setIsRegisterOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-amber-800 bg-amber-50 p-3 rounded border border-amber-200 flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>Simulation Isolation Policy:</strong> All freshly registered partner records default to SIMULATED DEMO DATA with 0 verifications. Promotion to operational status requires explicit coordinator 5-D audit confirmation.
              </div>
            </div>

            {registerError && (
              <div className="text-xs text-rose-800 bg-rose-50 p-3 rounded border border-rose-200 flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1">{registerError}</div>
              </div>
            )}

            <form onSubmit={handleRegisterSubmit} className="space-y-3.5 text-xs">
              {/* Partner ID & Display Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Partner Identifier (Slug) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ngo-kamrup-suraksha"
                    value={registerForm.id}
                    onChange={e => {
                      setRegisterForm({ ...registerForm, id: e.target.value });
                      if (fieldErrors.id) setFieldErrors({ ...fieldErrors, id: '' });
                    }}
                    className={`w-full border rounded px-2.5 py-1.5 font-mono text-xs ${
                      fieldErrors.id ? 'border-rose-400 bg-rose-50/30 focus:ring-1 focus:ring-rose-500' : 'border-slate-300 focus:ring-1 focus:ring-teal-700'
                    }`}
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">3–64 chars: lowercase letters, numbers, hyphens</p>
                  {fieldErrors.id && (
                    <p className="text-[11px] text-rose-600 mt-1 font-medium">{fieldErrors.id}</p>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Organization Display Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Kamrup Flood Rescue Front"
                    value={registerForm.name}
                    onChange={e => {
                      setRegisterForm({ ...registerForm, name: e.target.value });
                      if (fieldErrors.name) setFieldErrors({ ...fieldErrors, name: '' });
                    }}
                    className={`w-full border rounded px-2.5 py-1.5 text-xs ${
                      fieldErrors.name ? 'border-rose-400 bg-rose-50/30 focus:ring-1 focus:ring-rose-500' : 'border-slate-300 focus:ring-1 focus:ring-teal-700'
                    }`}
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">3–200 characters</p>
                  {fieldErrors.name && (
                    <p className="text-[11px] text-rose-600 mt-1 font-medium">{fieldErrors.name}</p>
                  )}
                </div>
              </div>

              {/* Legal Name & Registration Reference */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Legal Registered Name (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Kamrup Disaster Relief Foundation Trust"
                    value={registerForm.legal_name}
                    onChange={e => {
                      setRegisterForm({ ...registerForm, legal_name: e.target.value });
                      if (fieldErrors.legal_name) setFieldErrors({ ...fieldErrors, legal_name: '' });
                    }}
                    className={`w-full border rounded px-2.5 py-1.5 text-xs ${
                      fieldErrors.legal_name ? 'border-rose-400 bg-rose-50/30' : 'border-slate-300 focus:ring-teal-700'
                    }`}
                  />
                  {fieldErrors.legal_name && (
                    <p className="text-[11px] text-rose-600 mt-1 font-medium">{fieldErrors.legal_name}</p>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Registration Ref / Darpan ID (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. AS/2024/098812"
                    value={registerForm.registration_reference}
                    onChange={e => {
                      setRegisterForm({ ...registerForm, registration_reference: e.target.value });
                      if (fieldErrors.registration_reference) setFieldErrors({ ...fieldErrors, registration_reference: '' });
                    }}
                    className={`w-full border rounded px-2.5 py-1.5 text-xs font-mono ${
                      fieldErrors.registration_reference ? 'border-rose-400 bg-rose-50/30' : 'border-slate-300 focus:ring-teal-700'
                    }`}
                  />
                  {fieldErrors.registration_reference && (
                    <p className="text-[11px] text-rose-600 mt-1 font-medium">{fieldErrors.registration_reference}</p>
                  )}
                </div>
              </div>

              {/* Mandate Description */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Mandate & Mission Scope (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Flood rescue capabilities, relief operations, evacuation assistance..."
                  value={registerForm.description}
                  onChange={e => {
                    setRegisterForm({ ...registerForm, description: e.target.value });
                    if (fieldErrors.description) setFieldErrors({ ...fieldErrors, description: '' });
                  }}
                  className={`w-full border rounded px-2.5 py-1.5 text-xs ${
                    fieldErrors.description ? 'border-rose-400 bg-rose-50/30' : 'border-slate-300 focus:ring-teal-700'
                  }`}
                />
                {fieldErrors.description && (
                  <p className="text-[11px] text-rose-600 mt-1 font-medium">{fieldErrors.description}</p>
                )}
              </div>

              {/* Representative & Contacts */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Authorized Representative *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Full Legal Name"
                    value={registerForm.primary_contact_name}
                    onChange={e => {
                      setRegisterForm({ ...registerForm, primary_contact_name: e.target.value });
                      if (fieldErrors.primary_contact_name) setFieldErrors({ ...fieldErrors, primary_contact_name: '' });
                    }}
                    className={`w-full border rounded px-2.5 py-1.5 text-xs ${
                      fieldErrors.primary_contact_name ? 'border-rose-400 bg-rose-50/30 focus:ring-rose-500' : 'border-slate-300 focus:ring-teal-700'
                    }`}
                  />
                  {fieldErrors.primary_contact_name && (
                    <p className="text-[11px] text-rose-600 mt-1 font-medium">{fieldErrors.primary_contact_name}</p>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Emergency Phone *
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="7–20 digits"
                    value={registerForm.primary_contact_phone}
                    onChange={e => {
                      setRegisterForm({ ...registerForm, primary_contact_phone: e.target.value });
                      if (fieldErrors.primary_contact_phone) setFieldErrors({ ...fieldErrors, primary_contact_phone: '' });
                    }}
                    className={`w-full border rounded px-2.5 py-1.5 text-xs font-mono ${
                      fieldErrors.primary_contact_phone ? 'border-rose-400 bg-rose-50/30 focus:ring-rose-500' : 'border-slate-300 focus:ring-teal-700'
                    }`}
                  />
                  {fieldErrors.primary_contact_phone && (
                    <p className="text-[11px] text-rose-600 mt-1 font-medium">{fieldErrors.primary_contact_phone}</p>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Official Email (Optional)
                  </label>
                  <input
                    type="email"
                    placeholder="contact@domain.org"
                    value={registerForm.primary_contact_email}
                    onChange={e => {
                      setRegisterForm({ ...registerForm, primary_contact_email: e.target.value });
                      if (fieldErrors.primary_contact_email) setFieldErrors({ ...fieldErrors, primary_contact_email: '' });
                    }}
                    className={`w-full border rounded px-2.5 py-1.5 text-xs ${
                      fieldErrors.primary_contact_email ? 'border-rose-400 bg-rose-50/30 focus:ring-rose-500' : 'border-slate-300 focus:ring-teal-700'
                    }`}
                  />
                  {fieldErrors.primary_contact_email && (
                    <p className="text-[11px] text-rose-600 mt-1 font-medium">{fieldErrors.primary_contact_email}</p>
                  )}
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <span className="text-[11px] text-slate-400 font-mono">
                  Schema: createNgoSchema (Zod)
                </span>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsRegisterOpen(false);
                      setFieldErrors({});
                      setRegisterError(null);
                    }}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded border border-slate-200 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingRegister}
                    className="px-4 py-1.5 text-xs bg-teal-800 hover:bg-teal-900 text-white rounded font-medium transition cursor-pointer shadow-xs flex items-center space-x-1.5"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>{isSubmittingRegister ? 'Registering Partner...' : 'Register Partner Record'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
