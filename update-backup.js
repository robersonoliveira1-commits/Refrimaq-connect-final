const fs = require('fs');
const content = fs.readFileSync('src/components/BackupPage.tsx', 'utf-8');

const newContent = `import { useState, useRef } from 'react';
import { Download, Upload, Loader2, FileJson, CheckCircle, AlertTriangle, Shield, Database } from 'lucide-react';
import { supabase } from '../lib/supabase';

const TABLES = [
  'company_settings',
  'company_config',
  'user_profiles',
  'customers',
  'products',
  'parts',
  'services',
  'cost_centers',
  'routes',
  'stock_audits',
  'used_items',
  'budgets',
  'sales',
  'work_orders',
  'customer_products',
  'contacts',
  'contact_schedules',
  'route_stops',
  'service_orders',
  'service_order_attachments',
  'service_order_parts',
  'stock_movements',
  'stock_audit_items',
  'boletos',
  'os_stage_history',
  'expenses',
  'financial_transactions',
  'financial_audit_logs',
  'used_item_sales',
  'sale_items',
  'sales_budgets',
  'budget_items',
  'work_order_items',
  'work_order_photos'
];

interface BackupData {
  version: string;
  exported_at: string;
  tables?: Record<string, Record<string, unknown>[]>;
  // For old backups
  customers?: Record<string, unknown>[];
  contacts?: Record<string, unknown>[];
  routes?: Record<string, unknown>[];
  route_stops?: Record<string, unknown>[];
}

export default function BackupPage({ onMenuClick }: { onMenuClick: () => void }) {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<BackupData | null>(null);
  const [confirmImport, setConfirmImport] = useState(false);

  async function handleExport() {
    setExporting(true);
    setResult(null);

    try {
      const PAGE_SIZE = 1000;

      async function fetchAll(table: string) {
        const all: Record<string, unknown>[] = [];
        let from = 0;
        let hasMore = true;
        while (hasMore) {
          const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE_SIZE - 1);
          if (error) throw new Error(\`\${table}: \${error.message}\`);
          if (data && data.length > 0) {
            all.push(...data);
            from += PAGE_SIZE;
            if (data.length < PAGE_SIZE) hasMore = false;
          } else {
            hasMore = false;
          }
        }
        return all;
      }

      const backup: BackupData = {
        version: '2.0',
        exported_at: new Date().toISOString(),
        tables: {}
      };

      for (const table of TABLES) {
        const data = await fetchAll(table);
        if (backup.tables) {
          backup.tables[table] = data;
        }
      }

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = \`chopeiraconnect-backup-\${new Date().toISOString().slice(0, 10)}.json\`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setResult({ type: 'success', message: 'Backup exportado com sucesso!' });
    } catch (err: unknown) {
      setResult({ type: 'error', message: err instanceof Error ? err.message : 'Erro ao exportar backup' });
    } finally {
      setExporting(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string) as BackupData;
        if (!json.version) throw new Error('Formato invalido');
        setImportPreview(json);
        setResult(null);
        setConfirmImport(false);
      } catch (err) {
        setResult({ type: 'error', message: 'Arquivo JSON inválido' });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function handleImport() {
    if (!importPreview) return;
    setImporting(true);
    setResult(null);

    try {
      let totalInserted = 0;
      
      const tablesData = importPreview.tables || {
        customers: importPreview.customers || [],
        contacts: importPreview.contacts || [],
        routes: importPreview.routes || [],
        route_stops: importPreview.route_stops || []
      };

      for (const table of TABLES) {
        const rows = tablesData[table];
        if (rows && rows.length > 0) {
          const { error } = await supabase
            .from(table)
            .upsert(rows as never[], { onConflict: 'id', ignoreDuplicates: false });
          if (error) throw new Error(\`\${table}: \${error.message}\`);
          totalInserted += rows.length;
        }
      }

      setResult({
        type: 'success',
        message: \`Importacao concluida! \${totalInserted} registros restaurados em todos os modulos.\`,
      });
      setImportPreview(null);
      setConfirmImport(false);
    } catch (err: unknown) {
      setResult({ type: 'error', message: err instanceof Error ? err.message : 'Erro ao importar' });
    } finally {
      setImporting(false);
    }
  }

  const previewKeys = importPreview?.tables 
    ? Object.keys(importPreview.tables).filter(k => importPreview.tables![k].length > 0)
    : ['customers', 'contacts', 'routes', 'route_stops'].filter(k => (importPreview as any)?.[k]?.length > 0);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 sm:px-6 py-4 bg-white border-b border-slate-200">
        <button className="lg:hidden text-slate-500" onClick={onMenuClick}>
          <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <Database size={20} className="text-slate-600" />
        <h1 className="text-xl font-bold text-slate-800 flex-1">Backup & Dados</h1>
      </div>
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {result && (
            <div className={\`flex items-start gap-3 p-4 rounded-xl border \${
              result.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }\`}>
              {result.type === 'success' ? <CheckCircle size={20} className="flex-shrink-0 mt-0.5" /> : <AlertTriangle size={20} className="flex-shrink-0 mt-0.5" />}
              <p className="text-sm font-medium">{result.message}</p>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center">
                  <Download size={20} className="text-sky-600" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-800">Exportar Backup Completo</h2>
                  <p className="text-sm text-slate-500">Baixe todos os dados em formato JSON</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-slate-600 mb-4">
                Exporta clientes, historico de contatos, pecas, servicos, ordens de servico, financas e todos os modulos.
              </p>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-semibold px-5 py-3 rounded-xl text-sm transition-colors"
              >
                {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                {exporting ? 'Exportando...' : 'Exportar Backup Completo'}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                  <Upload size={20} className="text-amber-600" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-800">Importar Backup Completo</h2>
                  <p className="text-sm text-slate-500">Restaure dados a partir de um arquivo JSON</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-slate-600 mb-4">
                Selecione um arquivo de backup. Dados existentes com o mesmo ID serao atualizados.
              </p>
              <input ref={fileRef} type="file" accept=".json" onChange={handleFileSelect} className="hidden" />
              {!importPreview ? (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 border-2 border-dashed border-slate-300 hover:border-amber-400 text-slate-600 hover:text-amber-700 font-semibold px-5 py-3 rounded-xl text-sm transition-colors"
                >
                  <FileJson size={16} />
                  Selecionar Arquivo JSON
                </button>
              ) : (
                <div className="space-y-4">
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <p className="text-xs text-slate-500 mb-2 font-medium uppercase tracking-wide">Conteudo do Backup</p>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {previewKeys.map(k => {
                        const count = importPreview.tables 
                          ? importPreview.tables[k].length 
                          : ((importPreview as any)[k] || []).length;
                        return (
                          <div key={k} className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-slate-100">
                            <span className="text-slate-600">{k}</span>
                            <span className="font-bold text-slate-800">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-xs text-slate-400 mt-2">
                      Exportado em: {new Date(importPreview.exported_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  {!confirmImport ? (
                    <div className="flex gap-3">
                      <button onClick={() => setImportPreview(null)}
                        className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-600 py-3 rounded-xl text-sm font-medium transition-colors">
                        Cancelar
                      </button>
                      <button onClick={() => setConfirmImport(true)}
                        className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-3 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2">
                        <Upload size={16} /> Importar
                      </button>
                    </div>
                  ) : (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                      <div className="flex items-start gap-2">
                        <Shield size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-amber-800 font-medium">
                          Confirma a importacao? Dados existentes com mesmo ID serao sobrescritos em todos os modulos.
                        </p>
                      </div>
                      <div className="flex gap-3">
                        <button onClick={() => setConfirmImport(false)}
                          className="flex-1 border border-amber-300 hover:bg-amber-100 text-amber-700 py-2.5 rounded-xl text-sm font-medium transition-colors">
                          Voltar
                        </button>
                        <button onClick={handleImport} disabled={importing}
                          className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2">
                          {importing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                          {importing ? 'Importando...' : 'Confirmar'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <p className="text-xs text-slate-500 leading-relaxed">
              O backup completo inclui todos os registros do sistema: clientes, pecas, ordens de servico, financas, e configuracoes de empresa.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
`;

fs.writeFileSync('src/components/BackupPage.tsx', newContent);
