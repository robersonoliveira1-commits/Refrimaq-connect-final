import { useState, useEffect, useRef } from 'react';
import { Plus, Pencil, Trash2, Loader2, X, Save, Package, Wrench, Camera } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface CatalogItem {
  id: string;
  name: string;
  category: string;
  description: string;
  unit_price: number;
  stock_quantity: number;
  photo_url: string;
  created_at: string;
}

const CATEGORIES = ['Peça', 'Serviço', 'Componente', 'Insumo', 'Ferramenta', 'Outros'];

const CATEGORY_ICON: Record<string, typeof Package> = {
  'Serviço': Wrench,
};

const CATEGORY_COLOR: Record<string, string> = {
  'Peça':       'bg-blue-100 text-blue-700',
  'Serviço':    'bg-amber-100 text-amber-700',
  'Componente': 'bg-purple-100 text-purple-700',
  'Insumo':     'bg-green-100 text-green-700',
  'Ferramenta': 'bg-orange-100 text-orange-700',
  'Outros':     'bg-slate-100 text-slate-600',
};

const empty = (): Partial<CatalogItem> => ({
  name: '',
  category: 'Peça',
  description: '',
  unit_price: 0,
  stock_quantity: 0,
  photo_url: '',
});

interface Props {
  refresh: number;
  onRefresh: () => void;
}

export default function WorkshopCatalog({ refresh, onRefresh }: Props) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Partial<CatalogItem>>(empty());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    load();
  }, [refresh]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('products')
      .select('*')
      .order('category')
      .order('name');
    setItems((data as unknown as CatalogItem[]) ?? []);
    setLoading(false);
  }

  function openNew() {
    setEditing(empty());
    setEditingId(null);
    setPhotoFile(null);
    setPhotoPreview('');
    setShowModal(true);
  }

  function openEdit(item: CatalogItem) {
    setEditing({ ...item });
    setEditingId(item.id);
    setPhotoFile(null);
    setPhotoPreview(item.photo_url ?? '');
    setShowModal(true);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function removePhoto() {
    setPhotoFile(null);
    setPhotoPreview('');
    setEditing(d => ({ ...d, photo_url: '' }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function uploadPhoto(file: File): Promise<string> {
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from('product-photos').upload(path, file, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from('product-photos').getPublicUrl(path);
    return data.publicUrl;
  }

  async function save() {
    if (!editing.name?.trim()) return;
    setSaving(true);

    let photoUrl = editing.photo_url ?? '';
    if (photoFile) {
      setUploadingPhoto(true);
      try {
        photoUrl = await uploadPhoto(photoFile);
      } catch {
        alert('Erro ao enviar a foto. Tente novamente.');
        setSaving(false);
        setUploadingPhoto(false);
        return;
      }
      setUploadingPhoto(false);
    }

    const payload = {
      name: editing.name!.trim(),
      category: editing.category ?? 'Peça',
      description: editing.description ?? '',
      unit_price: editing.unit_price ?? 0,
      stock_quantity: editing.stock_quantity ?? 0,
      photo_url: photoUrl,
    };

    if (editingId) {
      await supabase.from('products').update(payload).eq('id', editingId);
    } else {
      await supabase.from('products').insert(payload);
    }
    setSaving(false);
    setShowModal(false);
    onRefresh();
    load();
  }

  async function deleteItem(id: string) {
    
    setDeleting(id);
    await supabase.from('products').delete().eq('id', id);
    setDeleting(null);
    onRefresh();
    load();
  }

  const allCategories = ['all', ...CATEGORIES.filter(c => items.some(i => i.category === c))];
  const filtered = categoryFilter === 'all' ? items : items.filter(i => i.category === categoryFilter);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <div className="flex gap-1.5 flex-1 overflow-x-auto scrollbar-hide">
          {allCategories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${categoryFilter === cat ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {cat === 'all' ? `Todos (${items.length})` : `${cat} (${items.filter(i => i.category === cat).length})`}
            </button>
          ))}
        </div>
        <button
          onClick={openNew}
          className="flex-shrink-0 flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={14} />
          <span className="hidden sm:inline">Novo Item</span>
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={28} className="text-amber-500 animate-spin" />
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Package size={40} className="mb-3 opacity-30" />
            <p className="font-medium">Catálogo vazio</p>
            <p className="text-sm mt-1">Adicione peças e serviços para usar nas ordens</p>
          </div>
        )}
        {!loading && filtered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(item => {
              const Icon = CATEGORY_ICON[item.category] ?? Package;
              const catColor = CATEGORY_COLOR[item.category] ?? 'bg-slate-100 text-slate-600';
              return (
                <div key={item.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-slate-300 hover:shadow-sm transition-all">
                  {/* Photo area */}
                  {item.photo_url ? (
                    <div className="h-36 overflow-hidden bg-slate-100">
                      <img
                        src={item.photo_url}
                        alt={item.name}
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                  ) : (
                    <div className="h-36 bg-slate-50 flex items-center justify-center">
                      <Icon size={32} className="text-slate-300" />
                    </div>
                  )}

                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-semibold text-slate-800 text-sm leading-tight">{item.name}</p>
                      <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${catColor}`}>{item.category}</span>
                    </div>
                    {item.description && (
                      <p className="text-xs text-slate-400 mb-2 line-clamp-2">{item.description}</p>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                        R$ {Number(item.unit_price).toFixed(2)}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${item.stock_quantity > 0 ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-600'}`}>
                        Est: {item.stock_quantity}
                      </span>
                      <div className="ml-auto flex gap-1">
                        <button
                          onClick={() => openEdit(item)}
                          className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => deleteItem(item.id)}
                          disabled={deleting === item.id}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                        >
                          {deleting === item.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-base font-bold text-slate-800">
                {editingId ? 'Editar Item' : 'Novo Item'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
              {/* Photo upload */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Foto</label>
                <div className="relative group">
                  {photoPreview ? (
                    <div className="relative w-full h-44 rounded-xl overflow-hidden border border-slate-200">
                      <img src={photoPreview} alt="preview" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-3">
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 bg-white text-slate-700 px-3 py-1.5 rounded-lg text-xs font-medium shadow"
                        >
                          <Camera size={13} />
                          Trocar
                        </button>
                        <button
                          onClick={removePhoto}
                          className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 bg-red-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium shadow"
                        >
                          <X size={13} />
                          Remover
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full h-32 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-amber-300 hover:text-amber-500 hover:bg-amber-50/50 transition-colors"
                    >
                      <Camera size={24} />
                      <span className="text-xs font-medium">Clique para adicionar foto</span>
                      <span className="text-xs text-slate-300">JPG, PNG, WEBP até 5MB</span>
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Nome *</label>
                <input
                  type="text"
                  value={editing.name ?? ''}
                  onChange={e => setEditing(d => ({ ...d, name: e.target.value }))}
                  placeholder="Ex: Resistência 127V, Limpeza de Chopeira..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Categoria</label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setEditing(d => ({ ...d, category: cat }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${editing.category === cat ? 'bg-amber-500 text-white border-amber-500' : 'border-slate-200 text-slate-600 hover:border-amber-300 hover:bg-amber-50'}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Descrição</label>
                <input
                  type="text"
                  value={editing.description ?? ''}
                  onChange={e => setEditing(d => ({ ...d, description: e.target.value }))}
                  placeholder="Descrição opcional"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Preço Unitário (R$)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={editing.unit_price ?? 0}
                    onChange={e => setEditing(d => ({ ...d, unit_price: parseFloat(e.target.value) || 0 }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Qtd. em Estoque</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={editing.stock_quantity ?? 0}
                    onChange={e => setEditing(d => ({ ...d, stock_quantity: parseInt(e.target.value) || 0 }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2 flex-shrink-0">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={saving || !editing.name?.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {saving ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    {uploadingPhoto ? 'Enviando foto...' : 'Salvando...'}
                  </>
                ) : (
                  <>
                    <Save size={14} />
                    Salvar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

