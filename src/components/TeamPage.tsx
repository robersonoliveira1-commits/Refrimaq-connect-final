import { useState, useEffect } from 'react';
import {
  Users, Plus, Pencil, Loader2, Shield, Wrench, Briefcase,
  Phone, Mail, UserCheck, UserX, X, Eye, EyeOff,
  KeyRound, ChevronDown, ChevronUp, Calendar, ToggleLeft, ToggleRight, Trash2, AlertTriangle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import Header from './Header';

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  role: 'admin' | 'technician' | 'comercial';
  active: boolean;
  assigned_day_index: number | null;
  created_at: string;
}

const ROLE_CONFIG = {
  admin:      { label: 'Administrador', icon: Shield,    bg: 'bg-blue-100',  text: 'text-blue-600',  badge: 'bg-blue-50 text-blue-700' },
  technician: { label: 'Técnico',       icon: Wrench,    bg: 'bg-amber-100', text: 'text-amber-600', badge: 'bg-amber-50 text-amber-700' },
  comercial:  { label: 'Comercial',     icon: Briefcase, bg: 'bg-green-100', text: 'text-green-600', badge: 'bg-green-50 text-green-700' },
};

const DAY_OPTIONS = [
  { value: null,  label: 'Sem dia fixo' },
  { value: 1,     label: 'Segunda-feira' },
  { value: 2,     label: 'Terça-feira' },
  { value: 3,     label: 'Quarta-feira' },
  { value: 4,     label: 'Quinta-feira' },
  { value: 5,     label: 'Sexta-feira' },
];

interface TeamPageProps { onMenuClick: () => void; }

export default function TeamPage({ onMenuClick }: TeamPageProps) {
  const { session } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);

  useEffect(() => { loadMembers(); }, [session]);

  async function loadMembers() {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, full_name, email, phone, role, active, assigned_day_index, created_at')
      .order('created_at', { ascending: true });
    if (error) {
      setLoadError(error.message);
      setLoading(false);
      return;
    }
    setMembers((data as TeamMember[]) ?? []);
    setLoading(false);
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Equipe"
        subtitle="Gestão de usuários e perfis de acesso"
        onMenuClick={onMenuClick}
        actions={
          <button
            onClick={() => { setEditingMember(null); setShowModal(true); }}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            <Plus size={15} /> Novo Usuário
          </button>
        }
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="text-amber-500 animate-spin" />
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <AlertTriangle size={36} className="text-red-400" />
            <p className="text-red-600 font-semibold">Erro ao carregar membros</p>
            <p className="text-slate-500 text-sm max-w-sm text-center">{loadError}</p>
            <button onClick={loadMembers} className="mt-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors">
              Tentar novamente
            </button>
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-16">
            <Users size={48} className="text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium text-lg">Nenhum membro cadastrado</p>
            <p className="text-slate-400 text-sm mt-1">Adicione o primeiro usuário clicando em "Novo Usuário"</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Usuário</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Contato</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Perfil</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {members.map(m => {
                    const rc = ROLE_CONFIG[m.role] ?? ROLE_CONFIG.technician;
                    const RoleIcon = rc.icon;
                    const dayLabel = DAY_OPTIONS.find(d => d.value === m.assigned_day_index)?.label;
                    return (
                      <tr key={m.id} className={`hover:bg-slate-50 transition-colors ${!m.active ? 'opacity-50' : ''}`}>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${rc.bg} ${rc.text}`}>
                              <RoleIcon size={16} />
                            </div>
                            <div>
                              <p className="font-semibold text-slate-800 text-sm">{m.full_name || 'Sem nome'}</p>
                              {m.email && <p className="text-xs text-slate-400 mt-0.5">{m.email}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          {m.phone && (
                            <p className="text-sm text-slate-600 flex items-center gap-1.5">
                              <Phone size={12} className="text-slate-400" /> {m.phone}
                            </p>
                          )}
                          {m.assigned_day_index && (
                            <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-1">
                              <Calendar size={11} /> {dayLabel}
                            </p>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${rc.badge}`}>
                            <RoleIcon size={11} /> {rc.label}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${m.active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                            {m.active ? <><UserCheck size={11} /> Ativo</> : <><UserX size={11} /> Inativo</>}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button
                            onClick={() => { setEditingMember(m); setShowModal(true); }}
                            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                          >
                            <Pencil size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-slate-100">
              {members.map(m => {
                const rc = ROLE_CONFIG[m.role] ?? ROLE_CONFIG.technician;
                const RoleIcon = rc.icon;
                return (
                  <div key={m.id} className={`p-4 ${!m.active ? 'opacity-50' : ''}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${rc.bg} ${rc.text}`}>
                        <RoleIcon size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800 text-sm truncate">{m.full_name || 'Sem nome'}</p>
                        <p className="text-xs text-slate-400 truncate">{m.email || '—'}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${rc.badge}`}>
                            {rc.label}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${m.active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                            {m.active ? 'Ativo' : 'Inativo'}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => { setEditingMember(m); setShowModal(true); }}
                        className="p-2 text-slate-400 hover:text-slate-600"
                      >
                        <Pencil size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <UserFormModal
          member={editingMember}
          session={session}
          onClose={() => { setShowModal(false); setEditingMember(null); }}
          onSuccess={() => { setShowModal(false); setEditingMember(null); loadMembers(); }}
        />
      )}
    </div>
  );
}

// ── Form modal ────────────────────────────────────────────────────────────────

function UserFormModal({ member, session, onClose, onSuccess }: {
  member: TeamMember | null;
  session: { access_token: string } | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = !!member;

  const [fullName, setFullName]       = useState(member?.full_name ?? '');
  const [email, setEmail]             = useState(member?.email ?? '');
  const [phone, setPhone]             = useState(member?.phone ?? '');
  const [role, setRole]               = useState<'admin' | 'technician' | 'comercial'>(member?.role ?? 'technician');
  const [active, setActive]           = useState(member?.active ?? true);
  const [assignedDay, setAssignedDay] = useState<number | null>(member?.assigned_day_index ?? null);

  const [password, setPassword]       = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');

  // Change password (edit only)
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [newPwd, setNewPwd]               = useState('');
  const [confirmPwd, setConfirmPwd]       = useState('');
  const [showNewPwd, setShowNewPwd]       = useState(false);
  const [savingPwd, setSavingPwd]         = useState(false);
  const [pwdError, setPwdError]           = useState('');
  const [pwdSuccess, setPwdSuccess]       = useState(false);

  // Delete confirmation
  const [showDelete, setShowDelete]     = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [deleteError, setDeleteError]   = useState('');

  const apiUrl = '/api';

  async function callBackend(endpoint: string, payload: Record<string, unknown>) {
    return fetch(`${apiUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
        'ngrok-skip-browser-warning': 'true'
      },
      body: JSON.stringify(payload),
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      if (isEdit) {
        const { error: profileErr } = await supabase.from('user_profiles').update({
          full_name: fullName,
          phone,
          role,
          active,
          assigned_day_index: assignedDay
        }).eq('id', member!.id);

        if (profileErr) { setError(profileErr.message); setSaving(false); return; }

        if (email !== member.email) {
          const res = await callBackend('/users/update', { user_id: member!.id, email });
          
          if (!res.ok) {
            let errorMsg = 'Erro ao atualizar e-mail.';
            try { const data = await res.json(); errorMsg = data.error || errorMsg; } catch (e) {}
            setError(errorMsg);
            setSaving(false);
            return;
          }
        }

        onSuccess();
      } else {
        if (!email || !password || !fullName) {
          setError('Preencha todos os campos obrigatórios.');
          setSaving(false);
          return;
        }
        const res = await callBackend('/users/create', { email, password, full_name: fullName, phone, role, active, assigned_day_index: assignedDay });
        
        if (!res.ok) {
          let errorMsg = 'Erro ao criar usuário.';
          try { const data = await res.json(); errorMsg = data.error || errorMsg; } catch (e) {}
          setError(errorMsg);
          setSaving(false);
          return;
        }
        onSuccess();
      }
    } catch (err: any) {
      console.error("Submit error:", err);
      setError(err.message || 'Ocorreu um erro de conexão.');
      setSaving(false);
    }
  }

  async function handleChangePassword() {
    if (!newPwd || !confirmPwd) { setPwdError('Preencha os dois campos.'); return; }
    if (newPwd.length < 6) { setPwdError('Mínimo 6 caracteres.'); return; }
    if (newPwd !== confirmPwd) { setPwdError('As senhas não coincidem.'); return; }
    setSavingPwd(true);
    setPwdError('');
    
    const res = await callBackend('/users/update', { user_id: member!.id, password: newPwd });
    const data = await res.json();
    if (!res.ok) {
      setPwdError(data.error || 'Erro ao alterar senha.');
    } else {
      setShowChangePwd(false);
    }
    setSavingPwd(false);
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError('');
    
    try {
      const res = await callBackend('/users/update', { user_id: member!.id, action: 'delete' });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error || 'Erro ao excluir usuário.');
      } else {
        onSuccess();
      }
    } catch (err) {
      setDeleteError('Erro de conexão ao tentar excluir.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh] relative"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{isEdit ? 'Editar Perfil' : 'Novo Usuário'}</h2>
            {isEdit && member.full_name && (
              <p className="text-xs text-slate-400 mt-0.5">{member.full_name}</p>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X size={20} /></button>
        </div>

        {/* Delete confirm overlay */}
        {showDelete && (
          <div className="absolute inset-0 bg-white z-10 flex flex-col items-center justify-center p-8 rounded-2xl">
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mb-4">
              <AlertTriangle size={28} className="text-red-500" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-1">Excluir usuário?</h3>
            <p className="text-sm text-slate-500 text-center mb-2">
              O perfil de <strong>{member?.full_name || 'este usuário'}</strong> será removido permanentemente. Esta ação não pode ser desfeita.
            </p>
            {deleteError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg mb-3 w-full text-center">{deleteError}</p>}
            <div className="flex gap-3 w-full mt-2">
              <button
                type="button"
                onClick={() => { setShowDelete(false); setDeleteError(''); }}
                className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-600 py-2.5 rounded-xl text-sm font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {deleting ? 'Excluindo...' : 'Sim, excluir'}
              </button>
            </div>
          </div>
        )}

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1">
          <form onSubmit={handleSubmit} id="user-form" autoComplete="off">
            <div className="px-6 pt-5 pb-2 space-y-5">

              {/* ── Informações Básicas ── */}
              <section>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Informações Básicas</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Nome Completo</label>
                    <input
                      type="text" value={fullName} onChange={e => setFullName(e.target.value)} required
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      E-mail {isEdit && <span className="font-normal text-slate-400">(login)</span>}
                    </label>
                    <div className="relative">
                      <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="email" value={email} onChange={e => setEmail(e.target.value)} required
                        autoComplete="new-email"
                        className="w-full pl-9 pr-4 border border-slate-200 rounded-xl py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Telefone / WhatsApp</label>
                    <div className="relative">
                      <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                        placeholder="(00) 00000-0000"
                        className="w-full pl-9 pr-4 border border-slate-200 rounded-xl py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </div>
                  </div>
                </div>
              </section>

              <div className="border-t border-slate-100" />

              {/* ── Acesso ── */}
              <section>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Acesso e Permissões</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Perfil de Acesso</label>
                    <select
                      value={role}
                      onChange={e => setRole(e.target.value as 'admin' | 'technician' | 'comercial')}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                    >
                      <option value="technician">Técnico — Mobile: Oficina / OS</option>
                      <option value="comercial">Comercial — Mobile: Logística / Visitas</option>
                      <option value="admin">Administrador — Painel completo</option>
                    </select>
                  </div>

                  {role === 'technician' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1.5">
                        <Calendar size={12} className="text-slate-400" /> Dia de Rota
                      </label>
                      <select
                        value={assignedDay ?? ''}
                        onChange={e => setAssignedDay(e.target.value === '' ? null : parseInt(e.target.value))}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                      >
                        {DAY_OPTIONS.map(d => (
                          <option key={String(d.value)} value={d.value ?? ''}>{d.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {isEdit && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-2">Status da Conta</label>
                      <button
                        type="button"
                        onClick={() => setActive(a => !a)}
                        className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl border transition-colors ${active ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}
                      >
                        {active
                          ? <ToggleRight size={22} className="text-emerald-600 flex-shrink-0" />
                          : <ToggleLeft size={22} className="text-red-400 flex-shrink-0" />
                        }
                        <div className="text-left">
                          <p className={`text-sm font-semibold ${active ? 'text-emerald-700' : 'text-red-600'}`}>
                            {active ? 'Conta Ativa' : 'Conta Inativa'}
                          </p>
                          <p className="text-xs text-slate-400">
                            {active ? 'Usuário pode fazer login normalmente' : 'Acesso bloqueado ao sistema'}
                          </p>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              </section>

              {/* ── Senha (novo usuário) ── */}
              {!isEdit && (
                <>
                  <div className="border-t border-slate-100" />
                  <section>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Credenciais de Acesso</p>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Senha Provisória</label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password} onChange={e => setPassword(e.target.value)} required
                          placeholder="Mínimo 6 caracteres"
                          autoComplete="new-password"
                          className="w-full border border-slate-200 rounded-xl px-4 pr-11 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                        />
                        <button type="button" onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                          {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>
                  </section>
                </>
              )}

              {/* ── Alterar Senha (edit only) ── */}
              {isEdit && (
                <>
                  <div className="border-t border-slate-100" />
                  <section>
                    <button
                      type="button"
                      onClick={() => { setShowChangePwd(!showChangePwd); setPwdError(''); setPwdSuccess(false); }}
                      className="w-full flex items-center justify-between py-1 text-xs font-bold text-slate-400 uppercase tracking-widest"
                    >
                      <span className="flex items-center gap-2"><KeyRound size={13} /> Alterar Senha</span>
                      {showChangePwd ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>

                    {showChangePwd && (
                      <div className="mt-3 space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">Nova Senha</label>
                          <div className="relative">
                            <input
                              type={showNewPwd ? 'text' : 'password'}
                              value={newPwd} onChange={e => setNewPwd(e.target.value)}
                              placeholder="Mínimo 6 caracteres"
                              autoComplete="new-password"
                              className="w-full border border-slate-200 rounded-xl px-4 pr-11 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                            />
                            <button type="button" onClick={() => setShowNewPwd(!showNewPwd)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                              {showNewPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">Confirmar Nova Senha</label>
                          <input
                            type={showNewPwd ? 'text' : 'password'}
                            value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)}
                            placeholder="Repita a nova senha"
                            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                          />
                        </div>
                        {pwdError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{pwdError}</p>}
                        {pwdSuccess && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg font-medium">Senha alterada com sucesso!</p>}
                        <button
                          type="button"
                          onClick={handleChangePassword}
                          disabled={savingPwd || !newPwd || !confirmPwd}
                          className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
                        >
                          {savingPwd ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
                          {savingPwd ? 'Salvando...' : 'Confirmar Nova Senha'}
                        </button>
                      </div>
                    )}
                  </section>
                </>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>
              )}
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex-shrink-0 bg-white">
          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-600 py-2.5 rounded-xl text-sm font-medium transition-colors">
              Cancelar
            </button>
            <button type="submit" form="user-form" disabled={saving}
              className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2">
              {saving && <Loader2 size={15} className="animate-spin" />}
              {isEdit ? 'Salvar Alterações' : 'Criar Usuário'}
            </button>
          </div>
          {isEdit && (
            <button
              type="button"
              onClick={() => setShowDelete(true)}
              className="w-full mt-2 flex items-center justify-center gap-2 text-red-500 hover:text-red-600 hover:bg-red-50 py-2 rounded-xl text-xs font-semibold transition-colors"
            >
              <Trash2 size={13} /> Excluir este usuário
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
