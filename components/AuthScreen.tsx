
import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Sparkles, Mail, Lock, User, Loader2, ArrowRight, HardDriveDownload, MonitorPlay } from 'lucide-react';

export const AuthScreen: React.FC = () => {
  const { login, signup } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isLogin) {
        await login(email, password);
      } else {
        if (!name) throw new Error("Name is required");
        await signup(email, password, name);
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
      setEmail('demo@flashcard.ai');
      setPassword('demo123');
      setError(null);
      setLoading(true);
      try {
          // Small delay to make the UI update visible
          setTimeout(async () => {
              await login('demo@flashcard.ai', 'demo123');
              setLoading(false);
          }, 500);
      } catch (e: any) {
          setError(e.message);
          setLoading(false);
      }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100">
        <div className="p-8 pb-6 bg-indigo-600 text-center">
            <div className="inline-flex items-center justify-center p-3 bg-white/10 rounded-xl mb-4 backdrop-blur-sm">
                <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">
                {isLogin ? 'Welcome Back' : 'Create Account'}
            </h1>
            <p className="text-indigo-100 text-sm">
                {isLogin ? 'Sign in to access your flashcards' : 'Get started with AI-powered study tools'}
            </p>
        </div>

        <div className="p-8 pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 text-center">
                        {error}
                    </div>
                )}

                {!isLogin && (
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Full Name</label>
                        <div className="relative">
                            <User className="absolute left-3 top-3 text-slate-400" size={18} />
                            <input 
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-slate-900 placeholder:text-slate-400"
                                placeholder="John Doe"
                            />
                        </div>
                    </div>
                )}

                <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Email</label>
                    <div className="relative">
                        <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
                        <input 
                            type="email"
                            required
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-slate-900 placeholder:text-slate-400"
                            placeholder="you@example.com"
                        />
                    </div>
                </div>

                <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Password</label>
                    <div className="relative">
                        <Lock className="absolute left-3 top-3 text-slate-400" size={18} />
                        <input 
                            type="password"
                            required
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-slate-900 placeholder:text-slate-400"
                            placeholder="••••••••"
                        />
                    </div>
                </div>

                <button 
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold shadow-md hover:bg-indigo-700 focus:ring-4 focus:ring-indigo-200 transition-all flex items-center justify-center gap-2 mt-4"
                >
                    {loading ? (
                        <Loader2 className="animate-spin" size={20} />
                    ) : (
                        <>
                           {isLogin ? 'Sign In' : 'Create Account'} 
                           <ArrowRight size={18} />
                        </>
                    )}
                </button>
            </form>
            
            <div className="mt-4 flex items-center justify-between gap-4">
                <div className="h-px bg-slate-200 flex-1"></div>
                <span className="text-xs text-slate-400 font-medium">OR</span>
                <div className="h-px bg-slate-200 flex-1"></div>
            </div>

            <button 
                type="button"
                onClick={handleDemoLogin}
                className="w-full mt-4 py-2.5 bg-slate-100 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl font-medium border border-slate-200 transition-all flex items-center justify-center gap-2"
            >
                <MonitorPlay size={18} /> Use Demo Account
            </button>

            <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
                <div className="flex items-start gap-3">
                    <HardDriveDownload className="text-blue-600 shrink-0 mt-0.5" size={18} />
                    <div className="text-left">
                        <h4 className="text-sm font-semibold text-blue-800">Local Storage & Sync</h4>
                        <p className="text-xs text-blue-600 mt-1">
                            Regular accounts are saved to this device only. To move data, use <b>Export/Import</b> in the app, or use the <b>Demo Account</b> to test on multiple devices immediately.
                        </p>
                    </div>
                </div>
            </div>

            <div className="mt-6 text-center">
                <p className="text-slate-500 text-sm">
                    {isLogin ? "Don't have an account?" : "Already have an account?"}
                    <button 
                        onClick={() => { setIsLogin(!isLogin); setError(null); }}
                        className="ml-2 text-indigo-600 font-semibold hover:underline"
                    >
                        {isLogin ? 'Sign up' : 'Log in'}
                    </button>
                </p>
            </div>
        </div>
      </div>
    </div>
  );
};
