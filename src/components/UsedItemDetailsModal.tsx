import { useState } from 'react';
import { X, FileText, Share2, Tag, ChevronLeft, ChevronRight, CheckCircle2, Loader2, DollarSign } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { UsedItem } from '../lib/types';
import { generateUsedItemPDF } from '../utils/usedItemPdf';
import { fetchCompanyConfig } from '../lib/companyConfig';

interface Props {
  item: UsedItem;
  onClose: () => void;
  onUpdate: () => void;
}

export default function UsedItemDetailsModal({ item, onClose, onUpdate }: Props) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const [selling, setSelling] = useState(false);
  const [showSellDialog, setShowSellDialog] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('Dinheiro');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [generatingPDF, setGeneratingPDF] = useState(false);

  const priceToUse = item.promotional_price || item.price;

  const nextPhoto = () => setPhotoIndex(i => (i + 1) % (item.photos?.length || 1));
  const prevPhoto = () => setPhotoIndex(i => (i - 1 + (item.photos?.length || 1)) % (item.photos?.length || 1));

  async function handleSell() {
    if (!customerName.trim()) {
      alert('Informe o nome do comprador.');
      return;
    }
    setSelling(true);
    try {
      // 1. Marcar como vendido
      await supabase.from('used_items').update({ status: 'Vendido' }).eq('id', item.id);
      
      // 2. Integração com módulo de controle de vendas (usados)
      await supabase.from('used_item_sales').insert({
        used_item_id: item.id,
        customer_name: customerName,
        customer_phone: customerPhone,
        payment_method: paymentMethod,
        total: priceToUse,
        status: 'Paga',
      });

      onUpdate();
      setShowSellDialog(false);
    } catch (err) {
      console.error(err);
      alert('Erro ao marcar como vendido.');
    } finally {
      setSelling(false);
    }
  }

  async function handleGeneratePDF() {
    setGeneratingPDF(true);
    try {
      const config = await fetchCompanyConfig();
      await generateUsedItemPDF(item, config);
    } catch (err) {
      console.error(err);
      alert('Erro ao gerar PDF.');
    } finally {
      setGeneratingPDF(false);
    }
  }

  function handleShareWhatsApp() {
    const text = `Confira este item: *${item.name}*\n\n` +
      `Categoria: ${item.category}\n` +
      `Estado: ${item.condition}\n` +
      `Marca/Modelo: ${item.brand_model || '-'}\n\n` +
      `*Valor:* ${priceToUse.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n` +
      `Condições: ${item.payment_conditions || 'A combinar'}\n\n` +
      `_Tem interesse? Responda a esta mensagem!_`;
      
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white">
          <div className="flex items-center gap-3">
            <h2 className="font-bold text-slate-800 text-lg line-clamp-1">{item.name}</h2>
            {item.status === 'Vendido' && (
              <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">VENDIDO</span>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-slate-50 flex flex-col md:flex-row">
          {/* Galeria */}
          <div className="w-full md:w-1/2 bg-black flex flex-col relative min-h-[300px]">
            {item.photos && item.photos.length > 0 ? (
              <>
                <img src={item.photos[photoIndex]} className="w-full h-full object-contain absolute inset-0" alt="Foto principal" />
                {item.photos.length > 1 && (
                  <>
                    <button onClick={prevPhoto} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white p-2 rounded-full hover:bg-black/75">
                      <ChevronLeft size={20} />
                    </button>
                    <button onClick={nextPhoto} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white p-2 rounded-full hover:bg-black/75">
                      <ChevronRight size={20} />
                    </button>
                    <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
                      {item.photos.map((_, i) => (
                        <div key={i} className={`w-2 h-2 rounded-full ${i === photoIndex ? 'bg-white' : 'bg-white/40'}`} />
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
                <Tag size={48} className="mb-4 opacity-50" />
                <p>Sem fotos cadastradas</p>
              </div>
            )}
          </div>

          {/* Informações */}
          <div className="w-full md:w-1/2 p-6 overflow-auto">
            <div className="space-y-6">
              <div>
                <p className="text-xs font-bold text-amber-500 uppercase tracking-wider mb-1">{item.category}</p>
                <div className="flex items-end gap-3 mb-2">
                  <div className="text-3xl font-black text-green-600">
                    {priceToUse.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </div>
                  {item.promotional_price && (
                    <div className="text-sm font-semibold text-slate-400 line-through mb-1">
                      {item.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </div>
                  )}
                </div>
                <p className="text-sm text-slate-600 font-medium bg-slate-100 inline-block px-3 py-1 rounded-full">
                  {item.payment_conditions || 'Condições a combinar'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-sm border-y border-slate-200 py-4">
                <div><span className="text-slate-500 block text-xs">Cód. Interno</span><span className="font-medium text-slate-800">{item.internal_code || '-'}</span></div>
                <div><span className="text-slate-500 block text-xs">Marca / Modelo</span><span className="font-medium text-slate-800">{item.brand_model || '-'}</span></div>
                <div><span className="text-slate-500 block text-xs">Ano</span><span className="font-medium text-slate-800">{item.year || '-'}</span></div>
                <div><span className="text-slate-500 block text-xs">Estado de Conser.</span><span className="font-medium text-slate-800">{item.condition}</span></div>
                {item.voltage && <div><span className="text-slate-500 block text-xs">Voltagem</span><span className="font-medium text-slate-800">{item.voltage}</span></div>}
                {item.weight && <div><span className="text-slate-500 block text-xs">Peso</span><span className="font-medium text-slate-800">{item.weight}</span></div>}
                {item.dimensions && <div><span className="text-slate-500 block text-xs">Dimensões</span><span className="font-medium text-slate-800">{item.dimensions}</span></div>}
              </div>

              <div>
                <h4 className="font-bold text-slate-800 text-sm mb-2">Descrição Comercial</h4>
                <p className="text-slate-600 text-sm whitespace-pre-wrap">{item.description || 'Nenhuma descrição fornecida.'}</p>
              </div>

              {item.specs && (
                <div>
                  <h4 className="font-bold text-slate-800 text-sm mb-2">Especificações Técnicas</h4>
                  <p className="text-slate-600 text-sm whitespace-pre-wrap">{item.specs}</p>
                </div>
              )}
              
              {item.compatibility && (
                <div>
                  <h4 className="font-bold text-slate-800 text-sm mb-2">Compatibilidade</h4>
                  <p className="text-slate-600 text-sm whitespace-pre-wrap">{item.compatibility}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex gap-3 bg-white">
          <button onClick={handleShareWhatsApp}
            className="flex-1 flex justify-center items-center gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-xl text-sm font-semibold transition-colors">
            <Share2 size={16} />
            Compartilhar
          </button>
          
          <button onClick={handleGeneratePDF} disabled={generatingPDF}
            className="flex-1 flex justify-center items-center gap-2 border-2 border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 rounded-xl text-sm font-semibold transition-colors">
            {generatingPDF ? <Loader2 className="animate-spin" size={16} /> : <FileText size={16} />}
            Gerar Folder
          </button>
          
          {item.status === 'Disponível' && (
            <button onClick={() => setShowSellDialog(true)}
              className="flex-1 flex justify-center items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-colors">
              <DollarSign size={16} />
              Vender
            </button>
          )}
        </div>
      </div>

      {showSellDialog && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-lg text-slate-800 text-center">Confirmar Venda</h3>
            <p className="text-sm text-slate-600 text-center mb-4">
              Deseja registrar a venda de <strong>{item.name}</strong> por <strong>{priceToUse.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>?
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Nome do Comprador *</label>
                <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Ex: João da Silva" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500/30" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Telefone (Opcional)</label>
                <input type="text" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="Ex: (11) 99999-9999" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500/30" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Forma de Pagamento</label>
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500/30">
                  <option value="Dinheiro">Dinheiro</option>
                  <option value="Pix">Pix</option>
                  <option value="Cartão de Débito">Cartão de Débito</option>
                  <option value="Cartão de Crédito">Cartão de Crédito</option>
                  <option value="Transferência">Transferência</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowSellDialog(false)} className="flex-1 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={handleSell} disabled={selling} className="flex-1 flex justify-center items-center py-2 text-sm font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700">
                {selling ? <Loader2 size={16} className="animate-spin" /> : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
