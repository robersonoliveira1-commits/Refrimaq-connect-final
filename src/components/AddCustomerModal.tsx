import { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, MapPin, Loader2, Search, AlertTriangle, Copy } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Customer, Product } from '../lib/types';
import { geocodeAddress } from '../lib/geocode';
import {
  extractCustomerSegment,
  stripSegmentTagFromNotes,
  hasSchemaColumn,
  isMissingColumnSchemaError,
  buildCustomerWritePayload,
  findPotentialCustomerDuplicates,
  normalizeDigits,
  CustomerDuplicateMatch,
} from '../lib/customersEngine';

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
  'Ar Condicionado',
];

// Session cache for optional columns so we don't repeatedly hit schema-cache retries
let detectedHasSegmentColumn: boolean | null = null;
let detectedHasEquipmentTypesColumn: boolean | null = null;

function addressFingerprint(address: string, city: string, state: string): string {
  return [address, city, state].map(v => v.trim().toLowerCase()).join('|');
}

export default function AddCustomerModal({ customer, onClose, onSuccess }: AddCustomerModalProps) {
  const [form, setForm] = useState({
    name: customer?.name ?? '',
    phone: customer?.phone ?? '',
    whatsapp: customer?.whatsapp ?? '',
    email: customer?.email ?? '',
    address: customer?.address ?? '',
    city: customer?.city ?? '',
    state: (customer?.state ?? '').toUpperCase(),
    zip_code: customer?.zip_code ?? '',
    document: customer?.document ?? '',
    segment: extractCustomerSegment(customer),
    notes: stripSegmentTagFromNotes(customer?.notes),
    equipment_types: Array.isArray(customer?.equipment_types) ? customer.equipment_types : [],
  });
  const [customEquip, setCustomEquip] = useState('');
  const [productEntries, setProductEntries] = useState<ProductEntry[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // CEP lookup state
  const [cepLoading, setCepLoading] = useState(false);
  const [cepFeedback, setCepFeedback] = useState<string | null>(null);
  const lastQueriedCepRef = useRef<string>(normalizeDigits(customer?.zip_code));

  // Duplicate warning state
  const [duplicateMatches, setDuplicateMatches] = useState<CustomerDuplicateMatch[]>([]);

  // GPS coordinates state
  const initialAddrFp = addressFingerprint(
    customer?.address ?? '',
    customer?.city ?? '',
    customer?.state ?? ''
  );
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null }>({
    lat: customer?.latitude ?? null,
    lng: customer?.longitude ?? null,
  });
  const [coordsAddrFp, setCoordsAddrFp] = useState<string>(initialAddrFp);
  const [geocoding, setGeocoding] = useState(false);

  const currentAddrFp = addressFingerprint(form.address, form.city, form.state);
  const addressChangedSinceCoords =
    Boolean(customer) &&
    coords.lat !== null &&
    coords.lng !== null &&
    currentAddrFp !== coordsAddrFp;

  useEffect(() => {
    let active = true;
    async function loadCatalog() {
      const all: Product[] = [];
      const PAGE_SIZE = 1000;
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error: prodErr } = await supabase
          .from('products')
          .select('*')
          .eq('active', true)
          .order('name')
          .range(from, from + PAGE_SIZE - 1);
        if (prodErr) {
          // Fallback if active column is unavailable
          const fallback = await supabase.from('products').select('*').order('name').range(from, from + PAGE_SIZE - 1);
          if (fallback.data && fallback.data.length > 0) {
            all.push(...(fallback.data as Product[]));
            from += PAGE_SIZE;
            if (fallback.data.length < PAGE_SIZE) hasMore = false;
          } else {
            hasMore = false;
          }
          continue;
        }
        if (data && data.length > 0) {
          all.push(...(data as Product[]));
          from += PAGE_SIZE;
          if (data.length < PAGE_SIZE) hasMore = false;
        } else {
          hasMore = false;
        }
      }
      if (active) setCatalogProducts(all);
    }
    loadCatalog();
    return () => { active = false; };
  }, []);

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
    if (duplicateMatches.length > 0 && (field === 'name' || field === 'document' || field === 'phone' || field === 'whatsapp')) {
      setDuplicateMatches([]);
    }
  }

  async function lookupCep(rawCep: string, overwriteExisting = false) {
    const clean = normalizeDigits(rawCep);
    if (clean.length !== 8) {
      if (overwriteExisting) setCepFeedback('Informe um CEP válido com 8 dígitos.');
      return;
    }
    lastQueriedCepRef.current = clean;
    setCepLoading(true);
    setCepFeedback(null);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      if (!res.ok) {
        setCepFeedback('Não foi possível consultar o ViaCEP.');
        return;
      }
      const data = await res.json();
      if (data.erro) {
        setCepFeedback('CEP não encontrado.');
        return;
      }
      const streetPart = [data.logradouro, data.bairro].filter(Boolean).join(' - ');
      setForm(prev => ({
        ...prev,
        address: overwriteExisting || !prev.address.trim() ? streetPart || prev.address : prev.address,
        city: overwriteExisting || !prev.city.trim() ? (data.localidade ?? prev.city) : prev.city,
        state: overwriteExisting || !prev.state.trim() ? String(data.uf ?? prev.state).toUpperCase() : prev.state,
      }));
      setCepFeedback('Endereço preenchido pelo CEP.');
    } catch {
      setCepFeedback('Falha de conexão ao consultar CEP.');
    } finally {
      setCepLoading(false);
    }
  }

  function handleCepChange(value: string) {
    set('zip_code', value);
    setCepFeedback(null);
    const digits = normalizeDigits(value);
    if (digits.length === 8 && digits !== lastQueriedCepRef.current) {
      lookupCep(digits, false);
    }
  }

  async function handleSyncCoords() {
    if (!form.address.trim() && !form.city.trim()) {
      setError('Preencha pelo menos o endereço ou a cidade para buscar as coordenadas.');
      return;
    }
    setError('');
    setGeocoding(true);
    try {
      const res = await geocodeAddress(form.address.trim(), form.city.trim(), form.state.trim());
      if (res) {
        setCoords({ lat: res.lat, lng: res.lng });
        setCoordsAddrFp(addressFingerprint(form.address, form.city, form.state));
      } else {
        setError('Não foi possível encontrar as coordenadas para o endereço informado.');
      }
    } catch (err) {
      console.error(err);
      setError('Erro ao tentar consultar as coordenadas.');
    } finally {
      setGeocoding(false);
    }
  }

  function addProduct() {
    setProductEntries(prev => [...prev, { ...BLANK_PRODUCT }]);
  }

  function updateProduct(index: number, field: string, value: string) {
    setProductEntries(prev => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  }

  function removeProduct(index: number) {
    setProductEntries(prev => prev.filter((_, i) => i !== index));
  }

  async function checkDuplicates(): Promise<CustomerDuplicateMatch[]> {
    const all: Customer[] = [];
    const PAGE_SIZE = 1000;
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const { data, error: fetchErr } = await supabase
        .from('customers')
        .select('id, name, document, phone, whatsapp')
        .range(from, from + PAGE_SIZE - 1);
      if (fetchErr || !data || data.length === 0) {
        hasMore = false;
      } else {
        all.push(...(data as Customer[]));
        from += PAGE_SIZE;
        if (data.length < PAGE_SIZE) hasMore = false;
      }
    }
    return findPotentialCustomerDuplicates(all, form, customer?.id);
  }

  async function persistCustomer(ignoreDuplicates: boolean) {
    if (!form.name.trim()) {
      setError('O nome é obrigatório.');
      return;
    }
    setSaving(true);
    setError('');

    if (!ignoreDuplicates) {
      const matches = await checkDuplicates();
      if (matches.length > 0) {
        setDuplicateMatches(matches);
        setSaving(false);
        return;
      }
    }

    let finalLat = coords.lat;
    let finalLng = coords.lng;

    // Geocode if missing coords OR if address was edited since coords were saved
    const shouldGeocode =
      (form.address.trim() || form.city.trim()) &&
      (finalLat === null || finalLng === null || addressChangedSinceCoords);

    if (shouldGeocode) {
      const res = await geocodeAddress(form.address.trim(), form.city.trim(), form.state.trim());
      if (res) {
        finalLat = res.lat;
        finalLng = res.lng;
      }
    }

    let includeSegmentColumn =
      customer !== null && customer !== undefined
        ? hasSchemaColumn(customer, 'segment')
        : (detectedHasSegmentColumn ?? true);
    let includeEquipmentTypesColumn =
      customer !== null && customer !== undefined
        ? hasSchemaColumn(customer, 'equipment_types')
        : (detectedHasEquipmentTypesColumn ?? true);

    let customerId = customer?.id;
    let saved = false;
    let lastError = 'Erro ao salvar cliente.';

    for (let attempt = 0; attempt < 3; attempt++) {
      const payload = buildCustomerWritePayload(
        {
          name: form.name,
          phone: form.phone,
          whatsapp: form.whatsapp,
          email: form.email,
          address: form.address,
          city: form.city,
          state: form.state,
          zip_code: form.zip_code,
          document: form.document,
          segment: form.segment,
          notes: form.notes,
          equipment_types: form.equipment_types,
          latitude: finalLat,
          longitude: finalLng,
        },
        { includeSegmentColumn, includeEquipmentTypesColumn }
      );

      if (customer) {
        const { error: err } = await supabase.from('customers').update(payload).eq('id', customer.id);
        if (!err) {
          detectedHasSegmentColumn = includeSegmentColumn;
          detectedHasEquipmentTypesColumn = includeEquipmentTypesColumn;
          saved = true;
          break;
        }
        if (includeSegmentColumn && isMissingColumnSchemaError(err, 'segment')) {
          includeSegmentColumn = false;
          detectedHasSegmentColumn = false;
          continue;
        }
        if (includeEquipmentTypesColumn && isMissingColumnSchemaError(err, 'equipment_types')) {
          includeEquipmentTypesColumn = false;
          detectedHasEquipmentTypesColumn = false;
          continue;
        }
        lastError = err.message;
        break;
      } else {
        const { data, error: err } = await supabase
          .from('customers')
          .insert(payload)
          .select('id')
          .single();
        if (!err && data) {
          detectedHasSegmentColumn = includeSegmentColumn;
          detectedHasEquipmentTypesColumn = includeEquipmentTypesColumn;
          customerId = data.id;
          saved = true;
          break;
        }
        if (includeSegmentColumn && isMissingColumnSchemaError(err, 'segment')) {
          includeSegmentColumn = false;
          detectedHasSegmentColumn = false;
          continue;
        }
        if (includeEquipmentTypesColumn && isMissingColumnSchemaError(err, 'equipment_types')) {
          includeEquipmentTypesColumn = false;
          detectedHasEquipmentTypesColumn = false;
          continue;
        }
        lastError = err?.message ?? 'Erro ao salvar cliente.';
        break;
      }
    }

    if (!saved) {
      setError(lastError);
      setSaving(false);
      return;
    }

    // Save initial products on customer creation, binding product_id when matched in catalog
    const validProducts = productEntries.filter(p => p.product_name.trim());
    if (validProducts.length > 0 && customerId) {
      const rows = validProducts.map(p => {
        const trimmedName = p.product_name.trim();
        const catalogMatch = catalogProducts.find(
          cp => cp.name.trim().toLowerCase() === trimmedName.toLowerCase()
        );
        return {
          customer_id: customerId,
          product_id: catalogMatch?.id ?? null,
          product_name: trimmedName,
          purchase_date: p.purchase_date || null,
          invoice_number: p.invoice_number.trim(),
          warranty_start: p.warranty_start || null,
          warranty_end: p.warranty_end || null,
          notes: p.notes.trim(),
        };
      });
      const { error: prodErr } = await supabase.from('customer_products').insert(rows);
      if (prodErr) {
        setError(`Cliente salvo, mas houve erro ao gravar os produtos: ${prodErr.message}`);
        setSaving(false);
        onSuccess();
        return;
      }
    }

    onSuccess();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await persistCustomer(false);
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

        <form id="add-customer-form" onSubmit={handleSubmit} className="flex-1 overflow-auto px-6 py-5 space-y-5">
          {/* Duplicate Warning */}
          {duplicateMatches.length > 0 && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 text-sm">
                  <p className="font-semibold text-amber-900">Possível cliente duplicado encontrado</p>
                  <p className="text-xs text-amber-800 mt-0.5">
                    Verifique os cadastros semelhantes antes de confirmar:
                  </p>
                  <ul className="mt-2 space-y-1">
                    {duplicateMatches.slice(0, 5).map(m => (
                      <li key={m.customer.id} className="text-xs text-amber-900 bg-white/70 rounded-lg px-2.5 py-1.5 border border-amber-200 flex items-center justify-between gap-2">
                        <span className="font-semibold truncate">{m.customer.name}</span>
                        <span className="text-amber-700 shrink-0">{m.reasons.join(' · ')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDuplicateMatches([])}
                  className="px-3 py-1.5 text-xs font-medium border border-amber-300 text-amber-800 bg-white hover:bg-amber-100/50 rounded-lg"
                >
                  Revisar dados
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => persistCustomer(true)}
                  className="px-3 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg disabled:opacity-50"
                >
                  Salvar mesmo assim
                </button>
              </div>
            </div>
          )}

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
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => set('phone', e.target.value)}
                  placeholder="(41) 99999-9999"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-600">WhatsApp</label>
                  {form.phone.trim() && form.whatsapp.trim() !== form.phone.trim() && (
                    <button
                      type="button"
                      onClick={() => set('whatsapp', form.phone)}
                      className="flex items-center gap-1 text-[11px] font-medium text-amber-600 hover:text-amber-700"
                    >
                      <Copy size={11} /> Igual ao telefone
                    </button>
                  )}
                </div>
                <input
                  type="tel"
                  value={form.whatsapp}
                  onChange={e => set('whatsapp', e.target.value)}
                  placeholder="(41) 99999-9999"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">E-mail</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  placeholder="email@exemplo.com"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">CPF / CNPJ</label>
                <input
                  type="text"
                  value={form.document}
                  onChange={e => set('document', e.target.value)}
                  placeholder="000.000.000-00 ou 00.000.000/0001-00"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Segmento</label>
                <input
                  type="text"
                  value={form.segment}
                  onChange={e => set('segment', e.target.value)}
                  placeholder="Ex: Bar, Restaurante, Choperia, Residência, Eventos"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* address */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Endereço</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">CEP</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={form.zip_code}
                    onChange={e => handleCepChange(e.target.value)}
                    placeholder="00000-000"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => lookupCep(form.zip_code, true)}
                    disabled={cepLoading}
                    title="Consultar endereço via CEP"
                    className="px-2.5 py-2 border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-600 disabled:opacity-50 shrink-0"
                  >
                    {cepLoading ? <Loader2 size={15} className="animate-spin text-amber-500" /> : <Search size={15} />}
                  </button>
                </div>
                {cepFeedback && <p className="text-[11px] text-slate-500 mt-1">{cepFeedback}</p>}
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Endereço</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={e => set('address', e.target.value)}
                  placeholder="Rua, número, bairro"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Cidade</label>
                <input
                  type="text"
                  value={form.city}
                  onChange={e => set('city', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Estado (UF)</label>
                <input
                  type="text"
                  value={form.state}
                  onChange={e => set('state', e.target.value.toUpperCase())}
                  placeholder="PR"
                  maxLength={2}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between bg-slate-50 border border-slate-200/60 rounded-xl p-3 gap-3">
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-slate-700">Geolocalização (GPS)</span>
                {coords.lat !== null && coords.lng !== null ? (
                  <>
                    <span className="text-[10px] text-emerald-600 font-mono mt-0.5 truncate">
                      Lat: {coords.lat.toFixed(6)} / Lng: {coords.lng.toFixed(6)}
                    </span>
                    {addressChangedSinceCoords && (
                      <span className="text-[11px] text-amber-700 mt-0.5">
                        Endereço alterado — o GPS será recalculado ao salvar.
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-[10px] text-slate-400 mt-0.5">Sem coordenadas vinculadas (será buscado ao salvar)</span>
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

              {form.equipment_types.filter(eq => !AVAILABLE_EQUIPMENT.includes(eq)).length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {form.equipment_types.filter(eq => !AVAILABLE_EQUIPMENT.includes(eq)).map(eq => (
                    <span key={eq} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium border border-amber-100">
                      {eq}
                      <button
                        type="button"
                        onClick={() => setForm(prev => ({ ...prev, equipment_types: prev.equipment_types.filter(t => t !== eq) }))}
                        className="hover:text-amber-900"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* products (only for new customers; existing customers manage products in CustomerProfile) */}
          {!isEdit && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Produtos Adquiridos</p>
                <button
                  type="button"
                  onClick={addProduct}
                  className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium"
                >
                  <Plus size={13} /> Adicionar Produto
                </button>
              </div>
              {productEntries.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-3 bg-slate-50 rounded-lg">
                  Nenhum produto adicionado (você também pode adicionar depois no perfil do cliente)
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
                      <input
                        type="date"
                        value={entry.purchase_date}
                        onChange={e => updateProduct(i, 'purchase_date', e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">N. Nota Fiscal</label>
                      <input
                        type="text"
                        value={entry.invoice_number}
                        onChange={e => updateProduct(i, 'invoice_number', e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Início Garantia</label>
                      <input
                        type="date"
                        value={entry.warranty_start}
                        onChange={e => updateProduct(i, 'warranty_start', e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Fim Garantia</label>
                      <input
                        type="date"
                        value={entry.warranty_end}
                        onChange={e => updateProduct(i, 'warranty_end', e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

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
            type="submit"
            form="add-customer-form"
            disabled={saving}
            className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Salvando...' : isEdit ? 'Salvar Alterações' : 'Criar Cliente'}
          </button>
        </div>
      </div>
    </div>
  );
}
