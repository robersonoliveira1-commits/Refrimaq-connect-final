import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Wrench, Package, Clock, AlertTriangle, Shield, Download, Loader2 } from 'lucide-react';
import { printHtml } from '../utils/print';

interface Props {
  equipmentId: string;
}

export default function PublicEquipmentView({ equipmentId }: Props) {
  const [loading, setLoading] = useState(true);
  const [equipment, setEquipment] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [exportingPDF, setExportingPDF] = useState(false);

  function exportPDF() {
    setExportingPDF(true);
    const eq = equipment;
    const historyList = history;

    const logoHtml = `<img src="${window.location.origin}/Refrimaq_Logomarca_-_modelo03.JPG" alt="Logo" style="height:56px;object-fit:contain;max-width:150px;" />`;

    const rowsHtml = historyList.length > 0
      ? historyList.map(os => `
          <tr>
            <td>#${String(os.order_number ?? 0).padStart(4, '0')}</td>
            <td>${new Date(os.created_at).toLocaleDateString('pt-BR')}</td>
            <td>${os.visit_type || '—'}</td>
            <td>${os.status || '—'}</td>
            <td>${os.diagnosis || 'Sem laudo cadastrado'}</td>
          </tr>
        `).join('')
      : '<tr><td colspan="5" style="text-align:center;color:#94a3b8">Nenhuma ordem de serviço registrada</td></tr>';

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Ficha_Equipamento_${eq.equip_serial || 'S-N'}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #1e293b; padding: 24px; }
    .hdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 14px; border-bottom: 2px solid #f59e0b; }
    .title { font-size: 18px; font-weight: 800; }
    .sec { margin-bottom: 16px; }
    .sec-t { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #94a3b8; margin-bottom: 6px; }
    .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 20px; }
    .item label { font-size: 10px; color: #94a3b8; display: block; margin-bottom: 1px; }
    .item span { font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th { background: #f8fafc; padding: 6px 8px; text-align: left; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; }
    td { padding: 8px 8px; border-bottom: 1px solid #f1f5f9; font-size: 11px; vertical-align: top; }
    .foot { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="hdr">
    <div style="display:flex;align-items:center;gap:12px">
      ${logoHtml}
      <div>
        <div class="title">REFRIMAQ REFRIGERAÇÃO</div>
        <div style="font-size:10px;color:#64748b">Histórico Técnico do Equipamento</div>
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-size:16px;font-weight:800;color:#f59e0b">CPF: ${eq.id.substring(0, 8).toUpperCase()}</div>
      <div style="font-size:10px;color:#64748b;margin-top:2px">Emissão: ${new Date().toLocaleDateString('pt-BR')}</div>
    </div>
  </div>

  <div class="sec">
    <div class="sec-t">Dados do Equipamento</div>
    <div class="card">
      <div class="grid">
        <div class="item"><label>Equipamento / Marca / Modelo</label><span>${eq.equip_type || '—'} · ${eq.equip_brand || '—'} ${eq.equip_model || '—'}</span></div>
        <div class="item"><label>Nº de Série</label><span>${eq.equip_serial || '—'}</span></div>
        <div class="item"><label>Voltagem / Gás</label><span>${eq.equip_voltage || '—'} / ${eq.equip_gas || '—'}</span></div>
        <div class="item"><label>Cliente / Cidade</label><span>${eq.customers?.name || '—'} · ${eq.customers?.city || '—'}</span></div>
      </div>
    </div>
  </div>

  <div class="sec">
    <div class="sec-t">Histórico de Manutenções</div>
    <div class="card" style="padding:0;overflow:hidden">
      <table>
        <thead>
          <tr>
            <th style="width: 10%">OS</th>
            <th style="width: 15%">Data</th>
            <th style="width: 20%">Tipo Serviço</th>
            <th style="width: 15%">Status</th>
            <th style="width: 40%">Laudo / Diagnóstico</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  </div>

  <div class="foot">
    <span>Relatório gerado via QR Code Refrimaq Connect</span>
    <span>Série: ${eq.equip_serial || 'S-N'} · CPF: ${eq.id.substring(0, 8).toUpperCase()}</span>
  </div>
</body>
</html>`;

    printHtml(html, `Historico_Equipamento_${eq.equip_serial || 'S-N'}.pdf`);
    setExportingPDF(false);
  }

  useEffect(() => {
    loadData();
  }, [equipmentId]);

  async function loadData() {
    setLoading(true);
    try {
      // 1. Fetch equipment details (public select policy allows this)
      const { data: eq } = await supabase
        .from('customer_equipments')
        .select('*, customers(name, city)')
        .eq('id', equipmentId)
        .maybeSingle();

      if (eq) {
        setEquipment(eq);
        
        // 2. Fetch service orders linked to this equipment
        const { data: orders } = await supabase
          .from('service_orders')
          .select('id, order_number, visit_type, status, diagnosis, created_at')
          .eq('equipment_id', eq.id)
          .order('created_at', { ascending: false });

        setHistory(orders ?? []);
      }
    } catch (err) {
      console.error("Error loading public equipment data:", err);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-4">
        <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-400 text-sm font-medium">Carregando histórico do equipamento...</p>
      </div>
    );
  }

  if (!equipment) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-6 text-center">
        <AlertTriangle size={48} className="text-red-500 mb-4 animate-bounce" />
        <h1 className="text-xl font-bold text-slate-100">Equipamento não encontrado</h1>
        <p className="text-slate-400 text-sm mt-2 max-w-xs">
          O código deste QR Code não corresponde a nenhum equipamento cadastrado no sistema da Refrimaq.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 text-white font-sans selection:bg-amber-500/30">
      {/* Premium Header */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-10 px-4 py-4 flex items-center justify-between shadow-lg shadow-black/10">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center shadow-md shadow-amber-500/20">
            <Wrench size={18} className="text-white" />
          </div>
          <div>
            <h1 className="font-extrabold text-sm tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500 uppercase">
              Refrimaq Connect
            </h1>
            <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">Ficha Técnica & Histórico</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportPDF}
            disabled={exportingPDF}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-[10px] font-extrabold px-3 py-1.5 rounded-xl uppercase tracking-wider transition-colors shadow-sm"
          >
            {exportingPDF ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
            {exportingPDF ? 'Gerando...' : 'PDF'}
          </button>
          <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1 shadow-inner">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Ativo
          </span>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-6 space-y-6">
        {/* Machine Spec Card */}
        <section className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-5 shadow-2xl relative overflow-hidden backdrop-blur-sm">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-amber-500/10 to-transparent pointer-events-none" />
          
          <span className="text-[9px] font-extrabold px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 uppercase tracking-widest mb-3 inline-block">
            {equipment.equip_type || 'Equipamento'}
          </span>
          <h2 className="text-xl font-black text-slate-100 uppercase tracking-wide leading-tight mb-4">
            {equipment.equip_brand} {equipment.equip_model}
          </h2>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-950/40 rounded-xl p-3 border border-slate-800/40">
              <span className="text-slate-400 block mb-0.5 font-semibold text-[10px] uppercase tracking-wider">Nº de Série</span>
              <code className="text-amber-400 font-mono font-bold text-sm tracking-wider">{equipment.equip_serial || '—'}</code>
            </div>
            <div className="bg-slate-950/40 rounded-xl p-3 border border-slate-800/40">
              <span className="text-slate-400 block mb-0.5 font-semibold text-[10px] uppercase tracking-wider">CPF da Máquina</span>
              <code className="text-slate-200 font-mono font-bold text-sm tracking-wider">{equipment.id.substring(0, 8).toUpperCase()}</code>
            </div>
            <div className="bg-slate-950/40 rounded-xl p-3 border border-slate-800/40">
              <span className="text-slate-400 block mb-0.5 font-semibold text-[10px] uppercase tracking-wider">Gás Refrigerante</span>
              <span className="text-slate-200 font-bold text-sm">{equipment.equip_gas || '—'}</span>
            </div>
            <div className="bg-slate-950/40 rounded-xl p-3 border border-slate-800/40">
              <span className="text-slate-400 block mb-0.5 font-semibold text-[10px] uppercase tracking-wider">Voltagem</span>
              <span className="text-slate-200 font-bold text-sm">{equipment.equip_voltage || '—'}</span>
            </div>
          </div>
          
          <div className="mt-4 pt-3 border-t border-slate-800/60 text-xs flex justify-between items-center text-slate-400">
            <span>Cliente: <strong className="text-slate-200 font-bold uppercase">{equipment.customers?.name || '—'}</strong></span>
            <span>{equipment.customers?.city || ''}</span>
          </div>
        </section>

        {/* Maintenance Timeline Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-amber-500" />
            <h3 className="font-extrabold text-sm text-slate-300 uppercase tracking-widest">Linha do Tempo de Manutenções</h3>
          </div>

          {history.length === 0 ? (
            <div className="bg-slate-900/30 border border-dashed border-slate-800 rounded-3xl p-10 text-center text-slate-500">
              <Package size={36} className="mx-auto mb-3 opacity-30 text-amber-500" />
              <p className="font-medium text-sm">Nenhuma ordem de serviço registrada para esta máquina.</p>
            </div>
          ) : (
            <div className="space-y-4 relative before:absolute before:inset-y-1 before:left-4 before:w-0.5 before:bg-slate-800/60">
              {history.map((os) => {
                const date = new Date(os.created_at).toLocaleDateString('pt-BR');
                const isCompleted = os.status === 'Concluída';
                return (
                  <div key={os.id} className="relative pl-8 animate-fade-in">
                    {/* Timeline dot */}
                    <div className={`absolute left-2.5 top-1.5 w-3.5 h-3.5 rounded-full border-2 bg-slate-950 -translate-x-1/2 flex items-center justify-center ${
                      isCompleted ? 'border-emerald-500 text-emerald-500' : 'border-amber-500 text-amber-500'
                    }`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${isCompleted ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    </div>

                    {/* Timeline card */}
                    <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-4 shadow-lg hover:border-slate-800 transition-colors">
                      <div className="flex items-start justify-between gap-2 mb-2.5">
                        <div>
                          <span className="text-[10px] font-bold text-slate-500">OS #{String(os.order_number).padStart(4, '0')}</span>
                          <h4 className="font-bold text-slate-200 text-sm mt-0.5 uppercase tracking-wide">{os.visit_type}</h4>
                        </div>
                        <span className="text-[10px] bg-slate-800 text-slate-400 font-bold px-2 py-0.5 rounded">{date}</span>
                      </div>

                      {os.diagnosis && (
                        <div className="text-xs text-slate-400 bg-slate-950/40 border border-slate-850 rounded-xl p-3">
                          <span className="font-bold text-slate-300 block mb-1 uppercase tracking-wider text-[9px]">Diagnóstico / Laudo Técnico</span>
                          {os.diagnosis}
                        </div>
                      )}

                      <div className="mt-3 flex items-center justify-between text-[9px] font-extrabold uppercase tracking-wider text-slate-500">
                        <span>Status: <strong className={isCompleted ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>{os.status}</strong></span>
                        <span className="flex items-center gap-0.5 text-emerald-400">
                          <Shield size={9} />
                          Garantia Atendida
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <footer className="py-8 text-center text-[10px] text-slate-600 font-semibold tracking-widest uppercase">
        © {new Date().getFullYear()} Refrimaq Refrigeração • Todos os direitos reservados.
      </footer>
    </div>
  );
}
