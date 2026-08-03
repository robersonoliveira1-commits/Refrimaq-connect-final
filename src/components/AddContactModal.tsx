import { useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface AddContactModalProps {
  customerId: string;
  customerName: string;
  onClose: () => void;
  onSuccess: () => void;
}

const CONTACT_TYPES = [
  { value: 'phone', label: 'Telefone' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'E-mail' },
  { value: 'visit', label: 'Visita' },
  { value: 'other', label: 'Outro' },
];

export default function AddContactModal({ customerId, customerName, onClose, onSuccess }: AddContactModalProps) {
  const [form, setForm] = useState({
    contact_type: 'phone',
    contacted_by: '',
    subject: '',
    details: '',
    contacted_at: new Date().toISOString().slice(0, 16),
    next_contact_at: '',
    next_contact_notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.subject.trim()) { setError('O assunto é obrigatório.'); return; }
    setSaving(true);
    setError('');

    const payload: Record<string, unknown> = {
      customer_id: customerId,
      contact_type: form.contact_type,
      contacted_by: form.contacted_by,
      subject: form.subject.trim(),
      details: form.details.trim(),
      contacted_at: form.contacted_at,
    };
    if (form.next_contact_at) {
      payload.next_contact_at = form.next_contact_at;
      payload.next_contact_notes = form.next_contact_notes;
    }

    const { error: err } = await supabase.from('contacts').insert(payload);
    if (err) { setError(err.message); setSaving(false); return; }

    // if next contact set, also create a schedule
    if (form.next_contact_at) {
      await supabase.from('contact_schedules').insert({
        customer_id: customerId,
        scheduled_at: form.next_contact_at,
        assigned_to: form.contacted_by,
        notes: form.next_contact_notes,
      });
    }

    onSuccess();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-slate-800">Registrar Contato</h2>
            <p className="text-sm text-slate-500">{customerName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-auto px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Tipo de Contato</label>
              <select
                value={form.contact_type}
                onChange={e => set('contact_type', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent bg-white"
              >
                {CONTACT_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Data e Hora</label>
              <input
                type="datetime-local"
                value={form.contacted_at}
                onChange={e => set('contacted_at', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Responsável pelo Contato</label>
            <input
              type="text"
              placeholder="Nome do vendedor / atendente"
              value={form.contacted_by}
              onChange={e => set('contacted_by', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Assunto *</label>
            <input
              type="text"
              placeholder="Breve descrição do que foi tratado"
              value={form.subject}
              onChange={e => set('subject', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Detalhes / Anotações</label>
            <textarea
              placeholder="Anotações adicionais sobre o contato..."
              value={form.details}
              onChange={e => set('details', e.target.value)}
              rows={3}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent resize-none"
            />
          </div>

          <div className="bg-slate-50 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-600">Próximo Contato (opcional)</p>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Data e Hora</label>
              <input
                type="datetime-local"
                value={form.next_contact_at}
                onChange={e => set('next_contact_at', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent bg-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Observação</label>
              <input
                type="text"
                placeholder="O que precisa ser feito no próximo contato?"
                value={form.next_contact_notes}
                onChange={e => set('next_contact_notes', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent bg-white"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </form>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Salvar Contato'}
          </button>
        </div>
      </div>
    </div>
  );
}
