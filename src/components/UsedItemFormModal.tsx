import { useState, useRef } from 'react';
import { X, Upload, Trash2, Loader2, Image as ImageIcon } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { supabase } from '../lib/supabase';
import { UsedItem } from '../lib/types';

interface Props {
  item: UsedItem | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function UsedItemFormModal({ item, onClose, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<UsedItem>>(item || {
    internal_code: `used-${Math.random().toString(36).substring(2, 6).toUpperCase()}`, name: '', category: 'Peças Usadas', brand_model: '', year: null,
    condition: 'Bom', description: '', notes: '', photos: [], price: 0, promotional_price: null,
    payment_conditions: '', specs: '', dimensions: '', weight: '', voltage: '', compatibility: '', status: 'Disponível'
  });
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    
    // Check limit
    const totalPhotos = (formData.photos?.length || 0) + newPhotos.length + files.length;
    if (totalPhotos > 10) {
      alert('O limite máximo é de 10 fotos por item.');
      return;
    }

    try {
      const compressedFiles = await Promise.all(
        files.map(file => imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true }))
      );
      setNewPhotos(prev => [...prev, ...compressedFiles]);
    } catch (err) {
      console.error('Erro ao comprimir imagem:', err);
      alert('Erro ao processar imagens.');
    }
    
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeExistingPhoto = (index: number) => {
    setFormData(prev => ({
      ...prev,
      photos: prev.photos?.filter((_, i) => i !== index)
    }));
  };

  const removeNewPhoto = (index: number) => {
    setNewPhotos(prev => prev.filter((_, i) => i !== index));
  };

  async function save() {
    setSaving(true);
    try {
      // 1. Upload new photos
      const uploadedUrls: string[] = [];
      for (const file of newPhotos) {
        const ext = file.name.split('.').pop();
        const path = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
        const { error, data } = await supabase.storage.from('used-items-photos').upload(path, file);
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage.from('used-items-photos').getPublicUrl(data.path);
        uploadedUrls.push(publicUrl);
      }

      const finalPhotos = [...(formData.photos || []), ...uploadedUrls];

      const payload = {
        ...formData,
        photos: finalPhotos,
      };

      if (item?.id) {
        const { error } = await supabase.from('used_items').update(payload).eq('id', item.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('used_items').insert(payload);
        if (error) throw error;
      }

      onSaved();
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar item.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white">
          <h2 className="font-bold text-slate-800 text-lg">
            {item ? 'Editar Item Usado' : 'Cadastrar Item para Venda'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
            <X size={18} />
          </button>
        </div>
        
        <div className="flex-1 overflow-auto p-6 bg-slate-50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="font-semibold text-slate-700 pb-2 border-b border-slate-200">Dados Gerais</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Cód. Interno</label>
                  <input type="text" value={formData.internal_code} onChange={e => setFormData({ ...formData, internal_code: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500/30" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Categoria</label>
                  <select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value as any })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500/30">
                    <option value="Peças Usadas">Peças Usadas</option>
                    <option value="Máquinas Usadas">Máquinas Usadas</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Nome do Item *</label>
                <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500/30" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Marca / Modelo</label>
                  <input type="text" value={formData.brand_model} onChange={e => setFormData({ ...formData, brand_model: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500/30" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Ano</label>
                  <input type="number" value={formData.year || ''} onChange={e => setFormData({ ...formData, year: Number(e.target.value) || null })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500/30" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Estado de Conservação</label>
                <select value={formData.condition} onChange={e => setFormData({ ...formData, condition: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500/30">
                  <option value="Novo">Novo</option>
                  <option value="Como Novo">Como Novo</option>
                  <option value="Bom">Bom</option>
                  <option value="Razoável">Razoável</option>
                  <option value="Com Defeito">Com Defeito</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Descrição Comercial</label>
                <textarea rows={3} value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500/30 resize-none" />
              </div>

              <h3 className="font-semibold text-slate-700 pb-2 border-b border-slate-200 mt-6">Valores</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Preço de Venda (R$) *</label>
                  <input type="number" value={formData.price || ''} onChange={e => setFormData({ ...formData, price: Number(e.target.value) })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500/30" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Preço Promocional (Opcional)</label>
                  <input type="number" value={formData.promotional_price || ''} onChange={e => setFormData({ ...formData, promotional_price: Number(e.target.value) || null })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500/30" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Condições de Pagamento</label>
                <input type="text" value={formData.payment_conditions} onChange={e => setFormData({ ...formData, payment_conditions: e.target.value })}
                  placeholder="Ex: Em até 3x sem juros"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500/30" />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-slate-700 pb-2 border-b border-slate-200">Fotos do Item</h3>
              <div className="bg-white p-4 rounded-xl border border-slate-200">
                <input type="file" multiple accept="image/*" className="hidden" ref={fileInputRef} onChange={handlePhotoSelect} />
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl py-6 flex flex-col items-center justify-center transition-colors">
                  <ImageIcon size={24} className="mb-2" />
                  <span className="font-medium text-sm">Adicionar Fotos (Até 10)</span>
                  <span className="text-xs opacity-70">JPG, PNG ou WebP</span>
                </button>
                
                {((formData.photos?.length || 0) > 0 || newPhotos.length > 0) && (
                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 mt-4">
                    {formData.photos?.map((url, i) => (
                      <div key={url} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 group">
                        <img src={url} className="w-full h-full object-cover" alt="foto" />
                        <button type="button" onClick={() => removeExistingPhoto(i)}
                          className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                    {newPhotos.map((file, i) => (
                      <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 group">
                        <img src={URL.createObjectURL(file)} className="w-full h-full object-cover" alt="foto" />
                        <button type="button" onClick={() => removeNewPhoto(i)}
                          className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <h3 className="font-semibold text-slate-700 pb-2 border-b border-slate-200 mt-6">Informações Técnicas</h3>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Especificações Gerais</label>
                <textarea rows={2} value={formData.specs} onChange={e => setFormData({ ...formData, specs: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500/30 resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Voltagem</label>
                  <input type="text" value={formData.voltage} onChange={e => setFormData({ ...formData, voltage: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500/30" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Peso</label>
                  <input type="text" value={formData.weight} onChange={e => setFormData({ ...formData, weight: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500/30" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Medidas / Dimensões</label>
                <input type="text" value={formData.dimensions} onChange={e => setFormData({ ...formData, dimensions: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500/30" />
              </div>
              {formData.category === 'Peças Usadas' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Compatibilidade</label>
                  <input type="text" value={formData.compatibility} onChange={e => setFormData({ ...formData, compatibility: e.target.value })}
                    placeholder="Quais máquinas esta peça atende?"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500/30" />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex gap-3 bg-white">
          <button onClick={onClose} className="px-6 py-2 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors">
            Cancelar
          </button>
          <button onClick={save} disabled={saving || !formData.name || !formData.price}
            className="flex-1 flex justify-center items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors">
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
            {item ? 'Atualizar Item' : 'Salvar Item'}
          </button>
        </div>
      </div>
    </div>
  );
}
