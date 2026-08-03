import { useState, useEffect } from 'react';
import { X, Plus, Trash2, MapPin, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Customer, Product } from '../lib/types';
import { geocodeAddress } from '../lib/geocode';

interface AddCustomerModalProps {
  customer?: Customer | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface ProductEntry {
  product_name: string;
  purchase_date: string;
  invoice_number: string;
  warranty_start: string;
  warranty_end: string;
  notes: string;
}

const BLANK_PRODUCT: ProductEntry = {
  product_name: '',
  purchase_date: '',
  invoice_number: '',
  warranty_start: '',
  warranty_end: '',
  notes: '',
};

const AVAILABLE_EQUIPMENT = [
  'Chopeira Balcão',
  'Torre Naja',
  'Pré Resfriador',
  'Chopeira a Gelo',
  'Refrigerador',
  'Máquina de Gelo',
  'Câmara Fria',
  'Ar Condicionado'
];

export default function AddCustomerModal({ customer, onClose, onSuccess }: AddCustomerModalProps) {
  const [form, setForm] = useState({
    name: customer?.name ?? '',
    phone: customer?.phone ?? '',
    whatsapp: customer?.whatsapp ?? '',
    email: customer?.email ?? '',
    address: customer?.address ?? '',
    city: customer?.city ?? '',
    state: customer?.state ?? '',
    zip_code: customer?.zip_code ?? '',
    document: customer?.document ?? '',
    segment: customer?.segment ?? '',
    notes: customer?.notes ?? '',
    equipment_types: Array.isArray(customer?.equipment_types) ? customer.equipment_types : [],
  });
  const [customEquip, setCustomEquip] = useState('');
  const [productEntries, setProductEntries] = useState<ProductEntry[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null }>({
    lat: customer?.latitude ?? null,
    lng: customer?.longitude ?? null,
  });
  const [geocoding, setGeocoding] = useState(false);

  async function handleSyncCoords() {
    if (!form.address.trim() && !form.city.trim()) {
      alert('Preencha pelo menos o endereço ou a cidade para buscar as coordenadas.');
      return;
    }
    setGeocoding(true);
    try {
      const res = await geocodeAddress(form.address.trim(), form.city.trim(), form.state.trim());
      if (res) {
        setCoords({ lat: res.lat, lng: res.lng });
      } else {
        alert('Não foi possível encontrar a localização para o endereço informado. Verifique os dados digitados.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao tentar consultar as coordenadas.');
    } finally {
      setGeocoding(false);
    }
  }

  useEffect(() => {
    supabase.from('products').select('*').eq('active', true).order('name').then(({ data }) => {
      if (data) setCatalogProducts(data);
    });
  }, []);

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function addProduct() {
    setProductEntries(prev => [...prev, { ...BLANK_PRODUCT }]);
  }

  function updateProduct(index: number, field: string, value: string) {
    setProductEntries(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
  }

  function removeProduct(index: number) {
    setProductEntries(prev => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('O nome é obrigatório.'); return; }
    setSaving(true);
    setError('');

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      whatsapp: form.whatsapp.trim(),
      email: form.email.trim(),
      address: form.address.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      zip_code: form.zip_code.trim(),
      document: form.document.trim(),
      // segment: form.segment.trim(), // Removido temporariamente até a coluna ser criada no banco
      notes: form.notes.trim(),
      equipment_types: form.equipment_types,
    };

    let finalLat = coords.lat;
    let finalLng = coords.lng;

    // geocode address if city or address provided and no coords are present
    if ((finalLat === null || finalLng === null) && (form.address.trim() || form.city.trim())) {
      const res = await geocodeAddress(form.address.trim(), form.city.trim(), form.state.trim());
      if (res) {
        finalLat = res.lat;
        finalLng = res.lng;
      }
    }

    payload.latitude = finalLat;
    payload.longitude = finalLng;

    let customerId = customer?.id;

    if (customer) {
      const { error: err } = await supabase.from('customers').update(payload).eq('id', customer.id);
      if (err) { setError(err.message); setSaving(false); return; }
    } else {
      const { data, error: err } = await supabase.from('customers').insert(payload).select('id').single();
      if (err || !data) { setError(err?.message ?? 'Erro ao salvar'); setSaving(false); return; }
      customerId = data.id;
    }

    // save new products
    const validProducts = productEntries.filter(p => p.product_name.trim());
    if (validProducts.length > 0 && customerId) {
      const rows = validProducts.map(p => ({
        customer_id: customerId,
        product_name: p.product_name.trim(),
        purchase_date: p.purchase_date || null,
        invoice_number: p.invoice_number.trim(),
        warranty_start: p.warranty_start || null,
        warranty_end: p.warranty_end || null,
        notes: p.notes.trim(),
      }));
      await supabase.from('customer_products').insert(rows);
    }

    onSuccess();
    onClose();
  }

  const isEdit = !!customer;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800">{isEdit ? 'Editar Cliente' : 'Novo Cliente'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-auto px-6 py-5 space-y-5">
          {/* basic info */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Dados Básicos</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nome / Razão Social *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="Nome completo ou razão social"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Telefone</label>
                <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">WhatsApp</label>
                <input type="tel" value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">E-mail</label>
                <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                  placeholder="email@exemplo.com"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">CPF / CNPJ</label>
                <input type="text" value={form.document} onChange={e => set('document', e.target.value)}
                  placeholder="000.000.000-00"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Segmento</label>
                <input type="text" value={form.segment} onChange={e => set('segment', e.target.value)}
                  placeholder="Ex: Bar, Restaurante, Residência"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent" />
              </div>
            </div>
          </div>

          {/* address */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Endereço</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Endereço</label>
                <input type="text" value={form.address} onChange={e => set('address', e.target.value)}
                  placeholder="Rua, número, bairro"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Cidade</label>
                <input type="text" value={form.city} onChange={e => set('city', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Estado</label>
                <input type="text" value={form.state} onChange={e => set('state', e.target.value)}
                  placeholder="SP"
                  maxLength={2}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">CEP</label>
                <input type="text" value={form.zip_code} onChange={e => set('zip_code', e.target.value)}
                  placeholder="00000-000"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent" />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between bg-slate-50 border border-slate-200/60 rounded-xl p-3">
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-slate-700">Geolocalização (GPS)</span>
                {coords.lat && coords.lng ? (
                  <span className="text-[10px] text-emerald-600 font-mono mt-0.5 truncate">
                    Lat: {coords.lat.toFixed(6)} / Lng: {coords.lng.toFixed(6)}
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400 mt-0.5">Sem coordenadas vinculadas</span>
                )}
              </div>
              <button
                type="button"
                onClick={handleSyncCoords}
                disabled={geocoding}
                className="flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm shrink-0"
              >
                {geocoding ? (
                  <Loader2 size={13} className="animate-spin text-amber-500" />
                ) : (
                  <MapPin size={13} className="text-amber-500" />
                )}
                Sincronizar GPS
              </button>
            </div>
          </div>

          {/* notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Observações</label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={2}
              placeholder="Informações adicionais sobre o cliente..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent resize-none"
            />
          </div>

          {/* equipment types */}
          <div className="pt-2 border-t border-slate-100 mt-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Tipos de Equipamento do Cliente</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {AVAILABLE_EQUIPMENT.map(eq => (
                <label key={eq} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer hover:bg-slate-50 p-1.5 rounded-lg transition-colors">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 text-amber-500 focus:ring-amber-500/30"
                    checked={form.equipment_types.includes(eq)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setForm(prev => ({ ...prev, equipment_types: [...prev.equipment_types, eq] }));
                      } else {
                        setForm(prev => ({ ...prev, equipment_types: prev.equipment_types.filter(t => t !== eq) }));
                      }
                    }}
                  />
                  {eq}
                </label>
              ))}
            </div>
            
            <div className="flex flex-col gap-1.5">
              <label className="block text-xs font-semibold text-slate-600">Outros equipamentos</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customEquip}
                  onChange={e => setCustomEquip(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && customEquip.trim()) {
                      e.preventDefault();
                      if (!form.equipment_types.includes(customEquip.trim())) {
                        setForm(prev => ({ ...prev, equipment_types: [...prev.equipment_types, customEquip.trim()] }));
                      }
                      setCustomEquip('');
                    }
                  }}
                  placeholder="Digite e pressione Enter..."
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (customEquip.trim() && !form.equipment_types.includes(customEquip.trim())) {
                      setForm(prev => ({ ...prev, equipment_types: [...prev.equipment_types, customEquip.trim()] }));
                      setCustomEquip('');
                    }
                  }}
                  className="px-3 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-200"
                >
                  Adicionar
                </button>
              </div>
              
              {/* Custom tags already added that are not in the predefined list */}
              {form.equipment_types.filter(eq => !AVAILABLE_EQUIPMENT.includes(eq)).length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {form.equipment_types.filter(eq => !AVAILABLE_EQUIPMENT.includes(eq)).map(eq => (
                    <span key={eq} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium border border-amber-100">
                      {eq}
                      <button type="button" onClick={() => setForm(prev => ({ ...prev, equipment_types: prev.equipment_types.filter(t => t !== eq) }))} className="hover:text-amber-900">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>


          {/* products (only for new customers) */}
          {!isEdit && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Produtos Adquiridos</p>
                <button type="button" onClick={addProduct}
                  className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium">
                  <Plus size={13} /> Adicionar Produto
                </button>
              </div>
              {productEntries.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-3 bg-slate-50 rounded-lg">
                  Nenhum produto adicionado
                </p>
              )}
              {productEntries.map((entry, i) => (
                <div key={i} className="bg-slate-50 rounded-xl p-4 mb-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-600">Produto {i + 1}</p>
                    <button type="button" onClick={() => removeProduct(i)} className="text-red-400 hover:text-red-600">
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Nome do Produto</label>
                    <input
                      list={`product-list-${i}`}
                      value={entry.product_name}
                      onChange={e => updateProduct(i, 'product_name', e.target.value)}
                      placeholder="Nome da chopeira ou acessório"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent bg-white"
                    />
                    <datalist id={`product-list-${i}`}>
                      {catalogProducts.map(p => <option key={p.id} value={p.name} />)}
                    </datalist>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Data Compra</label>
                      <input type="date" value={entry.purchase_date}
                        onChange={e => updateProduct(i, 'purchase_date', e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">N. Nota Fiscal</label>
                      <input type="text" value={entry.invoice_number}
                        onChange={e => updateProduct(i, 'invoice_number', e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Início Garantia</label>
                      <input type="date" value={entry.warranty_start}
                        onChange={e => updateProduct(i, 'warranty_start', e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Fim Garantia</label>
                      <input type="date" value={entry.warranty_end}
                        onChange={e => updateProduct(i, 'warranty_end', e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </form>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Salvando...' : isEdit ? 'Salvar Alterações' : 'Criar Cliente'}
          </button>
        </div>
      </div>
    </div>
  );
}
