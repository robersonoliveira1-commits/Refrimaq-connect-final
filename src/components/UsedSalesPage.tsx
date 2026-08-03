import { useState, useEffect } from 'react';
import { Plus, Filter, Search, Edit, Trash2, Camera, MapPin, Loader2, Share2, FileText, ShoppingBag, DollarSign } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { UsedItem } from '../lib/types';
import Header from './Header';
import UsedItemFormModal from './UsedItemFormModal';
import UsedItemDetailsModal from './UsedItemDetailsModal';
import UsedSalesControlTab from './UsedSalesControlTab';
import { useAuth } from '../lib/auth';

interface Props {
  onMenuClick: () => void;
}

export default function UsedSalesPage({ onMenuClick }: Props) {
  const [items, setItems] = useState<UsedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'catalogo' | 'controle'>('catalogo');
  const { profile } = useAuth();
  
  // Filters
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterCondition, setFilterCondition] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('Disponível');

  // Modals
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<UsedItem | null>(null);
  const [detailsItem, setDetailsItem] = useState<UsedItem | null>(null);

  useEffect(() => {
    loadItems();
  }, []);

  async function loadItems() {
    setLoading(true);
    const { data } = await supabase
      .from('used_items')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (data) setItems(data as UsedItem[]);
    setLoading(false);
  }

  const filteredItems = items.filter(item => {
    if (filterCategory && item.category !== filterCategory) return false;
    if (filterCondition && item.condition !== filterCondition) return false;
    if (filterStatus && item.status !== filterStatus) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!item.name.toLowerCase().includes(s) && !item.internal_code.toLowerCase().includes(s) && !item.brand_model.toLowerCase().includes(s)) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <Header title="Venda de Usados" subtitle="Gerenciamento de máquinas e peças usadas" onMenuClick={onMenuClick} />
      
      <div className="bg-white border-b border-slate-200 px-4 overflow-x-auto">
        <div className="flex gap-0 min-w-max">
          <button
            onClick={() => setActiveTab('catalogo')}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'catalogo' ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <ShoppingBag size={15} /> Catálogo de Usados
          </button>
          {profile?.role === 'admin' && (
            <button
              onClick={() => setActiveTab('controle')}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'controle' ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <DollarSign size={15} /> Controle de Vendas
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {activeTab === 'catalogo' && (
          <div className="p-4 sm:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div className="flex-1 max-w-2xl grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text" placeholder="Buscar item..." 
                value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              />
            </div>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30">
              <option value="">Todas as Categorias</option>
              <option value="Peças Usadas">Peças Usadas</option>
              <option value="Máquinas Usadas">Máquinas Usadas</option>
            </select>
            <select value={filterCondition} onChange={e => setFilterCondition(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30">
              <option value="">Qualquer Estado</option>
              <option value="Novo">Novo</option>
              <option value="Como Novo">Como Novo</option>
              <option value="Bom">Bom</option>
              <option value="Razoável">Razoável</option>
              <option value="Com Defeito">Com Defeito</option>
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30">
              <option value="">Todos (Status)</option>
              <option value="Disponível">Disponível</option>
              <option value="Vendido">Vendido</option>
            </select>
          </div>
          <button 
            onClick={() => { setEditingItem(null); setShowForm(true); }}
            className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
          >
            <Plus size={16} />
            Novo Item
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-amber-500" size={32} /></div>
        ) : filteredItems.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <ShoppingBag className="mx-auto text-slate-300 mb-4" size={48} />
            <h3 className="text-lg font-bold text-slate-700 mb-1">Nenhum item encontrado</h3>
            <p className="text-slate-500 text-sm">Ajuste os filtros ou cadastre um novo item para venda.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredItems.map(item => (
              <div key={item.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
                <div className="aspect-[4/3] bg-slate-100 relative group overflow-hidden">
                  {item.photos && item.photos.length > 0 ? (
                    <img src={item.photos[0]} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
                      <Camera size={32} />
                      <span className="text-xs mt-2 font-medium">Sem foto</span>
                    </div>
                  )}
                  {item.status === 'Vendido' && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <span className="bg-red-500 text-white px-4 py-1.5 rounded-full font-bold text-sm transform -rotate-12 shadow-lg border-2 border-white">
                        VENDIDO
                      </span>
                    </div>
                  )}
                  <div className="absolute top-2 right-2 flex gap-1">
                    <span className="bg-black/60 backdrop-blur-sm text-white text-[10px] px-2 py-1 rounded font-medium">
                      {item.category}
                    </span>
                  </div>
                </div>
                
                <div className="p-4 flex flex-col flex-1">
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-bold text-slate-800 line-clamp-1 flex-1 pr-2" title={item.name}>{item.name}</h3>
                  </div>
                  <p className="text-xs text-slate-500 mb-3">{item.brand_model} {item.year ? `· ${item.year}` : ''} · {item.condition}</p>
                  
                  <div className="mt-auto">
                    {item.promotional_price ? (
                      <div className="mb-3">
                        <span className="text-xs text-slate-400 line-through mr-2">
                          {item.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                        <span className="text-lg font-black text-green-600">
                          {item.promotional_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      </div>
                    ) : (
                      <div className="text-lg font-black text-green-600 mb-3">
                        {item.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </div>
                    )}
                    
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setDetailsItem(item)}
                        className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-lg text-xs font-semibold transition-colors text-center"
                      >
                        Ver Detalhes
                      </button>
                      <button 
                        onClick={() => { setEditingItem(item); setShowForm(true); }}
                        className="p-2 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors border border-transparent hover:border-amber-200"
                        title="Editar item"
                      >
                        <Edit size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
          </div>
        )}
      </div>

      {activeTab === 'controle' && profile?.role === 'admin' && (
        <UsedSalesControlTab />
      )}

      {showForm && (
        <UsedItemFormModal 
          item={editingItem} 
          onClose={() => setShowForm(false)} 
          onSaved={() => { setShowForm(false); loadItems(); }} 
        />
      )}

      {detailsItem && (
        <UsedItemDetailsModal
          item={detailsItem}
          onClose={() => setDetailsItem(null)}
          onUpdate={loadItems}
        />
      )}
    </div>
  );
}
