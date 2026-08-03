import { useState } from 'react';
import { Eye, EyeOff, LogIn, UserPlus, AlertTriangle } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { supabaseUrl } from '../lib/supabase';

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [success, setSuccess] = useState('');

  const isMissingSupabase = supabaseUrl === 'https://placeholder.supabase.co';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isMissingSupabase) {
      setError('Please configure Supabase environment variables (.env.example)');
      return;
    }
    if (!email.trim() || !password) return;
    setLoading(true);
    setError('');
    setSuccess('');

    if (mode === 'login') {
      const err = await signIn(email.trim(), password);
      if (err) {
        setError(
          err.includes('Invalid login credentials')
            ? 'E-mail ou senha incorretos.'
            : err.includes('Email not confirmed')
            ? 'Confirme seu e-mail antes de entrar.'
            : err
        );
      }
    } else {
      if (!fullName.trim()) {
        setError('Preencha seu nome.');
        setLoading(false);
        return;
      }
      const err = await signUp(email.trim(), password, fullName.trim());
      if (err) {
        setError(err);
      } else {
        setSuccess('Conta criada com sucesso! Você já está logado.');
      }
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-400/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-sky-600 to-sky-700 px-8 py-8 text-center">
            <img src="/Refrimaq_Logomarca_-_modelo03.JPG" alt="Refrimaq" className="w-24 h-24 rounded-3xl object-cover mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white tracking-tight">Refrimaq Connect</h1>
            <p className="text-sky-100 text-sm mt-1">Sistema de Gestao e Logistica</p>
          </div>

          <form onSubmit={handleSubmit} className="px-8 py-8 space-y-5">
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                  Nome Completo
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Seu nome"
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-shadow"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                E-mail
              </label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-shadow"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                Senha
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min. 6 caracteres"
                  required
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-shadow"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

            {isMissingSupabase && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-xl flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-600" />
                <div>
                  <p className="font-semibold">Supabase Configuração Ausente</p>
                  <p className="mt-1">
                    Para usar o sistema, você precisa configurar as variáveis de ambiente <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code>.
                  </p>
                </div>
              </div>
            )}

            {success && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-3 rounded-xl">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors shadow-sm"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : mode === 'login' ? (
                <><LogIn size={18} /> Entrar</>
              ) : (
                <><UserPlus size={18} /> Criar Conta</>
              )}
            </button>


          </form>
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          Entre em contato com o administrador para obter acesso.
        </p>
      </div>
    </div>
  );
}
