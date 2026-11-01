import React, { useState } from 'react';
import {
  ShieldAlert,
  Lock,
  User,
  KeyRound,
  Eye,
  EyeOff,
  X,
  AlertTriangle,
  Sparkles,
  CheckCircle,
} from 'lucide-react';
import { apiLogin } from '../../services/apiClient';
import { AuthUser } from '../../types/auth';

interface CoordinatorLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (token: string, user: AuthUser) => void;
}

export const CoordinatorLoginModal: React.FC<CoordinatorLoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMsg('Please enter both username and password.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await apiLogin({
        username: username.trim(),
        password,
      });

      if (res.success && res.data) {
        onLoginSuccess(res.data.token, res.data.user);
        setUsername('');
        setPassword('');
        setErrorMsg(null);
        onClose();
      } else {
        setErrorMsg(res.error?.message || 'Invalid username or password. Please try again.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to connect to the authentication service.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-lg bg-teal-500/20 border border-teal-500/30 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight">Coordinator Sign In</h2>
              <p className="text-[11px] text-slate-400">SURAKSHA Emergency Operations Center</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded transition"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Sign in with verified coordinator credentials to unlock 5-D NGO verification audits, incident confirmation, operational asset promotions, and ground dispatch.
          </p>

          {/* Quick Evaluation Note for Hackathon Judges */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5">
            <div className="flex items-center text-slate-800 font-semibold space-x-1.5">
              <Sparkles className="w-3.5 h-3.5 text-teal-700" />
              <span>Evaluation Coordinator Sign In</span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Sign in with your provisioned coordinator username (e.g. <code className="font-mono font-semibold text-slate-800">coord_assam_dev</code>) and password.
            </p>
            <p className="text-[10px] text-slate-500 italic">
              See <code className="font-mono text-slate-700">README.md</code> for evaluation credentials or run <code className="font-mono text-slate-700">npm run provision:coordinator</code> in the backend.
            </p>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800 flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Coordinator Username
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. coord_assam_dev"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-teal-700 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Enter coordinator password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-10 py-2 text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-teal-700"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end space-x-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition border border-slate-200"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={loading}
                className="bg-teal-800 hover:bg-teal-900 text-white font-semibold px-5 py-2 rounded-lg text-xs transition flex items-center space-x-1.5 shadow-xs cursor-pointer disabled:opacity-50"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{loading ? 'Authenticating...' : 'Sign In as Coordinator'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Footer Note */}
        <div className="bg-slate-50 border-t border-slate-200 p-3 px-6 text-[11px] text-slate-500 flex items-center space-x-2">
          <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>Issues an HS256 JWT valid for 12 hours. Public browsing is always available.</span>
        </div>
      </div>
    </div>
  );
};

