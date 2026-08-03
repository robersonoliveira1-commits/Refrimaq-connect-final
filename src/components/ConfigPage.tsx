import { useState, useEffect, useRef } from 'react';
import {
  Building2, CreditCard, Settings2, Save, Loader2, Upload, X, CheckCircle2, AlertTriangle,
  Eye, EyeOff, Camera,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { CompanyConfig, EMPTY_CONFIG, fetchCompanyConfig, saveCompanyConfig } from '../lib/companyConfig';
import Header from './Header';

type Section = 'company' | 'payment' | 'general';

const PIX_KEY_TYPES = ['CPF', 'CNPJ', 'E-mail', 'Telefone', 'Chave aleatória'];
const ACCOUNT_TYPES = ['Corrente', 'Poupança'];

interface Props { onMenuClick: () => void }

export default function ConfigPage({ onMenuClick }: Props) {
  const [section, setSection] = useState<Section>('company');
  const [config, setConfig] = useState<CompanyConfig>(EMPTY_CONFIG);
  const [original, setOriginal] = useState<CompanyConfig>(EMPTY_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [showPixKey, setShowPixKey] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const cfg = await fetchCompanyConfig();
    setConfig(cfg);
    setOriginal(cfg);
    setLoading(false);
  }

  const isDirty = JSON.stringify(config) !== JSON.stringify(original);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    await saveCompanyConfig(config);
    const fresh = await fetchCompanyConfig();
    setConfig(fresh);
    setOriginal(fresh);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const valid = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
    if (!valid.includes(file.type)) { alert('Formato inválido. Use PNG, JPG, WEBP ou SVG.'); return; }
    if (file.size > 2 * 1024 * 1024) { alert('Imagem muito grande. Máximo 2 MB.'); return; }

    setUploadingLogo(true);
    
    // For SVG, we can just save it directly as base64 without resizing
    if (file.type === 'image/svg+xml') {
      const reader = new FileReader();
      reader.onloadend = () => {
        setConfig(c => ({ ...c, logo_url: reader.result as string }));
        setUploadingLogo(false);
        if (logoInputRef.current) logoInputRef.current.value = '';
      };
      reader.readAsDataURL(file);
      return;
    }

    // For other images, resize to a sensible max width/height to avoid huge base64 strings
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      const MAX_SIZE = 400;

      if (width > height && width > MAX_SIZE) {
        height *= MAX_SIZE / width;
        width = MAX_SIZE;
      } else if (height > MAX_SIZE) {
        width *= MAX_SIZE / height;
        height = MAX_SIZE;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        const base64String = canvas.toDataURL('image/png', 0.9);
        setConfig(c => ({ ...c, logo_url: base64String }));
      }
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    };
    img.onerror = () => {
      alert('Erro ao processar a imagem.');
      setUploadingLogo(false);
    };
    img.src = objectUrl;
  }

  function set(field: keyof CompanyConfig, value: string) {
    setConfig(c => ({ ...c, [field]: value }));
  }

  const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 transition-colors bg-white';
  const textareaCls = inputCls + ' resize-none';
  const labelCls = 'text-xs font-semibold text-slate-600 block mb-1';

  const sections: { id: Section; label: string; icon: typeof Building2 }[] = [
    { id: 'company', label: 'Dados da Empresa', icon: Building2 },
    { id: 'payment', label: 'Dados de Pagamento', icon: CreditCard },
    { id: 'general', label: 'Configurações Gerais', icon: Settings2 },
  ];

  // Validation: required fields for PDF/boleto generation
  const missingFields: string[] = [];
  if (!config.company_name.trim()) missingFields.push('Nome da empresa');
  if (!config.cnpj.trim()) missingFields.push('CNPJ');

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Configurações"
        subtitle="Dados da empresa, pagamentos e documentos"
        onMenuClick={onMenuClick}
        actions={
          <div className="flex items-center gap-2">
            {saved && (
              <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                <CheckCircle2 size={13} /> Salvo
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !isDirty}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Salvar
            </button>
          </div>
        }
      />

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={28} className="text-amber-500 animate-spin" />
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="flex flex-col lg:flex-row h-full">
            {/* Sidebar nav */}
            <nav className="lg:w-56 flex-shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 p-3 flex lg:flex-col gap-1">
              {sections.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setSection(id)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors w-full text-left ${
                    section === id
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Icon size={16} />
                  <span className="truncate">{label}</span>
                </button>
              ))}

              {missingFields.length > 0 && (
                <div className="hidden lg:block mt-auto pt-3 border-t border-slate-200">
                  <div className="flex items-start gap-2 text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-xl p-3">
                    <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold mb-0.5">Campos obrigatórios</p>
                      {missingFields.map(f => <p key={f}>• {f}</p>)}
                    </div>
                  </div>
                </div>
              )}
            </nav>

            {/* Content */}
            <div className="flex-1 p-4 sm:p-6 overflow-auto">
              {section === 'company' && (
                <div className="max-w-2xl space-y-6">
                  <div>
                    <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                      <Building2 size={16} className="text-amber-500" />
                      Dados da Empresa
                    </h2>

                    {/* Logo upload */}
                    <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
                      <label className="text-sm font-semibold text-slate-700 block mb-3">Logo da Empresa</label>
                      <div className="flex items-center gap-4">
                        <div className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center bg-slate-50 flex-shrink-0 overflow-hidden">
                          {config.logo_url ? (
                            <img src={config.logo_url} alt="Logo" className="w-full h-full object-contain p-1" />
                          ) : (
                            <Camera size={24} className="text-slate-300" />
                          )}
                        </div>
                        <div className="flex-1 space-y-2">
                          <button
                            onClick={() => logoInputRef.current?.click()}
                            disabled={uploadingLogo}
                            className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                          >
                            {uploadingLogo ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                            {uploadingLogo ? 'Enviando...' : 'Enviar Logo'}
                          </button>
                          <p className="text-xs text-slate-400">PNG, JPG, WEBP ou SVG. Máx. 2 MB.</p>
                          {config.logo_url && (
                            <button onClick={() => set('logo_url', '')} className="text-xs text-red-500 hover:underline flex items-center gap-1">
                              <X size={11} /> Remover logo
                            </button>
                          )}
                        </div>
                      </div>
                      <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                    </div>

                    {/* Company fields */}
                    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                          <label className={labelCls}>
                            Nome da Empresa <span className="text-red-400">*</span>
                          </label>
                          <input type="text" value={config.company_name} onChange={e => set('company_name', e.target.value)}
                            placeholder="Ex: Refrimaq" className={inputCls} />
                        </div>
                        <div className="sm:col-span-2">
                          <label className={labelCls}>Razão Social</label>
                          <input type="text" value={config.razao_social} onChange={e => set('razao_social', e.target.value)}
                            placeholder="Ex: Refrimaq Serviços de Refrigeração LTDA" className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>
                            CNPJ <span className="text-red-400">*</span>
                          </label>
                          <input type="text" value={config.cnpj} onChange={e => set('cnpj', e.target.value)}
                            placeholder="00.000.000/0001-00" className={inputCls} maxLength={18} />
                        </div>
                        <div>
                          <label className={labelCls}>Telefone</label>
                          <input type="text" value={config.phone} onChange={e => set('phone', e.target.value)}
                            placeholder="(00) 00000-0000" className={inputCls} />
                        </div>
                        <div className="sm:col-span-2">
                          <label className={labelCls}>E-mail</label>
                          <input type="email" value={config.email} onChange={e => set('email', e.target.value)}
                            placeholder="contato@empresa.com.br" className={inputCls} />
                        </div>
                        <div className="sm:col-span-2">
                          <label className={labelCls}>Endereço Completo</label>
                          <input type="text" value={config.address} onChange={e => set('address', e.target.value)}
                            placeholder="Rua, número, bairro, cidade — UF" className={inputCls} />
                        </div>
                        <div className="sm:col-span-2">
                          <label className={labelCls}>Responsável Técnico</label>
                          <input type="text" value={config.responsible} onChange={e => set('responsible', e.target.value)}
                            placeholder="Nome do responsável técnico" className={inputCls} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {section === 'payment' && (
                <div className="max-w-2xl space-y-4">
                  <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <CreditCard size={16} className="text-amber-500" />
                    Dados de Pagamento
                  </h2>

                  {/* PIX */}
                  <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                    <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                      <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">PIX</span>
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className={labelCls}>Tipo de Chave PIX</label>
                        <select value={config.pix_key_type} onChange={e => set('pix_key_type', e.target.value)} className={inputCls}>
                          <option value="">Selecionar...</option>
                          {PIX_KEY_TYPES.map(t => <option key={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Chave PIX</label>
                        <div className="relative">
                          <input
                            type={showPixKey ? 'text' : 'password'}
                            value={config.pix_key}
                            onChange={e => set('pix_key', e.target.value)}
                            placeholder="Digite a chave PIX"
                            className={inputCls + ' pr-9'}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPixKey(v => !v)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            {showPixKey ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className={labelCls}>Nome do Titular</label>
                        <input type="text" value={config.account_holder} onChange={e => set('account_holder', e.target.value)}
                          placeholder="Nome completo ou razão social" className={inputCls} />
                      </div>
                    </div>
                  </div>

                  {/* Bank account */}
                  <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                    <h3 className="text-sm font-semibold text-slate-700">Dados Bancários</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="sm:col-span-2">
                        <label className={labelCls}>Banco</label>
                        <input type="text" value={config.bank_name} onChange={e => set('bank_name', e.target.value)}
                          placeholder="Ex: Banco do Brasil, Itaú, Bradesco..." className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Agência</label>
                        <input type="text" value={config.agency} onChange={e => set('agency', e.target.value)}
                          placeholder="0000-0" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Conta</label>
                        <input type="text" value={config.account_number} onChange={e => set('account_number', e.target.value)}
                          placeholder="00000-0" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Tipo de Conta</label>
                        <select value={config.account_type} onChange={e => set('account_type', e.target.value)} className={inputCls}>
                          {ACCOUNT_TYPES.map(t => <option key={t} value={t.toLowerCase()}>{t}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Financial notes */}
                  <div className="bg-white rounded-xl border border-slate-200 p-5">
                    <label className={labelCls}>Observações Financeiras</label>
                    <textarea
                      rows={4}
                      value={config.financial_notes}
                      onChange={e => set('financial_notes', e.target.value)}
                      placeholder="Ex: Pagamento à vista com 5% de desconto. Parcelamento em até 3x sem juros no cartão..."
                      className={textareaCls}
                    />
                    <p className="text-xs text-slate-400 mt-1.5">Aparece nos boletos e documentos financeiros.</p>
                  </div>
                </div>
              )}

              {section === 'general' && (
                <div className="max-w-2xl space-y-4">
                  <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Settings2 size={16} className="text-amber-500" />
                    Configurações Gerais
                  </h2>

                  <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                    <div>
                      <label className={labelCls}>Mensagem padrão para rodapé dos PDFs de OS</label>
                      <textarea rows={3} value={config.pdf_footer} onChange={e => set('pdf_footer', e.target.value)}
                        placeholder="Ex: Obrigado pela preferência! Em caso de dúvidas entre em contato..."
                        className={textareaCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Mensagem padrão para boletos</label>
                      <textarea rows={3} value={config.boleto_message} onChange={e => set('boleto_message', e.target.value)}
                        placeholder="Ex: Após vencimento cobrar multa de 2% a.m. e juros de 0,033% a.d..."
                        className={textareaCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Política de Garantia</label>
                      <textarea rows={3} value={config.warranty_policy} onChange={e => set('warranty_policy', e.target.value)}
                        placeholder="Ex: Garantia de 90 dias para peças e mão de obra..."
                        className={textareaCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Política de Devolução</label>
                      <textarea rows={3} value={config.return_policy} onChange={e => set('return_policy', e.target.value)}
                        placeholder="Ex: Peças substituídas não são devolvidas após a conclusão do serviço..."
                        className={textareaCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Observações Gerais das OS</label>
                      <textarea rows={3} value={config.os_notes} onChange={e => set('os_notes', e.target.value)}
                        placeholder="Ex: Orçamento válido por 30 dias. Serviços realizados com peças originais..."
                        className={textareaCls} />
                    </div>
                  </div>

                  {/* Preview card */}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <p className="text-xs font-semibold text-amber-700 mb-2">Pré-visualização do cabeçalho PDF</p>
                    <div className="bg-white rounded-lg border border-amber-200 p-3 flex items-start gap-3">
                      {config.logo_url ? (
                        <img src={config.logo_url} alt="Logo" className="w-12 h-12 object-contain rounded flex-shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded bg-slate-100 flex items-center justify-center flex-shrink-0">
                          <Building2 size={20} className="text-slate-300" />
                        </div>
                      )}
                      <div>
                        <p className="font-bold text-sm text-slate-800">{config.company_name || 'Nome da Empresa'}</p>
                        {config.cnpj && <p className="text-xs text-slate-500">CNPJ: {config.cnpj}</p>}
                        {config.address && <p className="text-xs text-slate-500">{config.address}</p>}
                        {(config.phone || config.email) && (
                          <p className="text-xs text-slate-500">{[config.phone, config.email].filter(Boolean).join(' · ')}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
