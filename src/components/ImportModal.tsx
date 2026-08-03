import { useState, useRef } from 'react';
import { X, Upload, AlertCircle, CheckCircle, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { geocodeAddress } from '../lib/geocode';
import * as XLSX from 'xlsx';

interface ImportModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface ColumnMap {
  name: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  number: string;
  city: string;
  state: string;
  zip_code: string;
  document: string;
  segment: string;
  notes: string;
}

interface ViaCEPResult {
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean | string;
}

const FIELD_LABELS: Record<keyof ColumnMap, string> = {
  name: 'Nome *',
  phone: 'Telefone',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  address: 'Endereço (Rua)',
  number: 'Número',
  city: 'Cidade',
  state: 'Estado',
  zip_code: 'CEP',
  document: 'CPF/CNPJ',
  segment: 'Segmento',
  notes: 'Observações',
};

const FIELD_KEYS = Object.keys(FIELD_LABELS) as Array<keyof ColumnMap>;

function parseCSV(text: string): string[][] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return [];
  
  // Detect delimiter from the first line
  const firstLine = lines[0];
  let delimiter = ',';
  if (firstLine.includes('\t')) delimiter = '\t';
  else if (firstLine.includes(';')) delimiter = ';';

  return lines.map(row => {
    const cols: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '"') {
        if (inQuotes && row[i + 1] === '"') {
          // escaped quote ""
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (ch === delimiter && !inQuotes) {
        cols.push(current.trim());
        current = '';
        continue;
      }
      current += ch;
    }
    cols.push(current.trim());
    return cols;
  }).filter(row => row.some(cell => cell !== ''));
}

async function fetchAddressByCep(cep: string): Promise<ViaCEPResult | null> {
  const cleanCep = cep.replace(/\D/g, '');
  if (cleanCep.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.erro) return null;
    return data;
  } catch (err) {
    console.error('Error fetching CEP:', err);
    return null;
  }
}

function parseAddressAndNumber(addressStr: string, numberStr: string): { street: string; number: string } {
  let street = addressStr.trim();
  let num = numberStr.trim();

  // If number is empty, try to extract it from the street address
  if (!num && street) {
    // Match patterns like "Rua Nome da Rua, 123" or "Av. Nome da Rua 123" or "Rua Nome da Rua nº 123"
    const numberRegex = /(?:,\s*|,\s*nº\s*|\s+nº\s*|\s+)(\d+)\s*$/i;
    const match = street.match(numberRegex);
    if (match) {
      num = match[1];
      street = street.replace(numberRegex, '').trim();
    }
  }

  // Remove any trailing commas or spaces from street
  street = street.replace(/,\s*$/, '').trim();

  return { street, number: num };
}

export default function ImportModal({ onClose, onSuccess }: ImportModalProps) {
  const [step, setStep] = useState<'upload' | 'map' | 'preview' | 'done'>('upload');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [columnMap, setColumnMap] = useState<ColumnMap>({
    name: '', phone: '', whatsapp: '', email: '',
    address: '', number: '', city: '', state: '', zip_code: '', document: '', segment: '', notes: '',
  });
  const [importing, setImporting] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [importCount, setImportCount] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = new Uint8Array(ev.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const parsed = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' }) as string[][];
          if (parsed.length < 2) {
            alert('A planilha precisa conter ao menos uma linha de cabeçalho e uma linha de dados.');
            return;
          }
          processParsedData(parsed);
        } catch (err: any) {
          alert('Erro ao ler planilha excel: ' + err.message);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = ev => {
        const text = ev.target?.result as string;
        const parsed = parseCSV(text);
        if (parsed.length < 2) {
          alert('O arquivo precisa conter ao menos uma linha de cabeçalho e uma linha de dados.');
          return;
        }
        processParsedData(parsed);
      };
      reader.readAsText(file);
    }
  }

  function processParsedData(parsed: string[][]) {
    const headerRow = parsed[0].map(h => String(h || '').trim());
    const dataRows = parsed.slice(1);

    setHeaders(headerRow);
    setRows(dataRows);

    // auto-map common column names
    const auto: ColumnMap = { name: '', phone: '', whatsapp: '', email: '', address: '', number: '', city: '', state: '', zip_code: '', document: '', segment: '', notes: '' };
    const mappingRules: Record<keyof ColumnMap, RegExp> = {
      name: /nome|name|razão|razao|empresa|cliente/i,
      phone: /telefone|phone|tel\b|fone|celular|contato/i,
      whatsapp: /whatsapp|wapp|whats/i,
      email: /email|e-mail|correo/i,
      address: /endere[cç]o|address|rua|logradouro|av\b|avenida/i,
      number: /n[uú]mero|num\b/i,
      city: /cidade|city|munic[ií]pio/i,
      state: /estado|state|uf\b|est\b/i,
      zip_code: /cep|zip|postal/i,
      document: /cpf|cnpj|doc|documento/i,
      segment: /segmento|segment|ramo|setor/i,
      notes: /obs|nota|note|observa[cç][aã]|coment/i,
    };

    headerRow.forEach((h, idx) => {
      for (const field of FIELD_KEYS) {
        if (!auto[field] && mappingRules[field].test(h)) {
          auto[field] = String(idx); // store column INDEX, not header name
          break;
        }
      }
    });

    setColumnMap(auto);
    setStep('map');
  }

  function getColumnValue(row: string[], colId: string): string {
    if (!colId) return '';
    const idx = parseInt(colId, 10);
    if (isNaN(idx) || idx < 0 || idx >= row.length) return '';
    return row[idx] ?? '';
  }

  function buildPreviewRows(): Record<string, string>[] {
    return rows.slice(0, 5).map(row => {
      const obj: Record<string, string> = {};
      for (const field of FIELD_KEYS) {
        obj[field] = getColumnValue(row, columnMap[field]);
      }
      return obj;
    }).filter(r => r.name);
  }

  function buildAllRows(): Record<string, string>[] {
    return rows.map(row => {
      const obj: Record<string, string> = {};
      for (const field of FIELD_KEYS) {
        obj[field] = getColumnValue(row, columnMap[field]);
      }
      return obj;
    }).filter(r => r.name.trim());
  }

  async function handleImport() {
    setImporting(true);
    setProgressMsg('Buscando clientes existentes...');
    const errs: string[] = [];
    let count = 0;
    
    const { data: existingCustomers } = await supabase.from('customers').select('*');
    
    const allRows = buildAllRows();
    for (let i = 0; i < allRows.length; i++) {
      const r = allRows[i];
      setProgressMsg(`Processando cliente ${i + 1} de ${allRows.length} (${r.name})...`);
      
      let zip = r.zip_code?.trim() || '';
      let addressStr = r.address?.trim() || '';
      let numberStr = r.number?.trim() || '';
      let cityStr = r.city?.trim() || '';
      let stateStr = r.state?.trim() || '';
      let emailStr = r.email?.trim() || '';
      let phoneStr = r.phone?.trim() || '';
      let whatsappStr = r.whatsapp?.trim() || '';
      let documentStr = r.document?.trim() || '';
      let segmentStr = r.segment?.trim() || '';
      let notesStr = r.notes?.trim() || '';

      const existing = existingCustomers?.find(c => 
        (documentStr && c.document === documentStr) || 
        (r.name && c.name.toLowerCase() === r.name.toLowerCase().trim()) ||
        (emailStr && c.email.toLowerCase() === emailStr.toLowerCase())
      );

      // Merge values: keep existing non-empty DB values unless incoming has data and DB is empty
      let finalName = r.name.trim();
      let finalPhone = phoneStr || existing?.phone || '';
      let finalWhatsapp = whatsappStr || existing?.whatsapp || '';
      let finalEmail = emailStr || existing?.email || '';
      let finalNotes = [existing?.notes, notesStr].filter(Boolean).join('\n') || '';
      let finalSegment = segmentStr || '';
      let combinedNotes = finalNotes;
      if (finalSegment && !combinedNotes.includes(`[Segmento:`)) {
        combinedNotes = `[Segmento: ${finalSegment}]${combinedNotes ? '\n' + combinedNotes : ''}`;
      }
      let finalDoc = documentStr || existing?.document || '';

      let finalZip = zip || existing?.zip_code || '';
      let finalCity = cityStr || existing?.city || '';
      let finalState = stateStr || existing?.state || '';

      let baseAddress = addressStr;
      let baseNumber = numberStr;

      if (existing?.address) {
        const dbParsed = parseAddressAndNumber(existing.address, '');
        baseAddress = dbParsed.street || addressStr;
        baseNumber = dbParsed.number || numberStr;
      }

      // If CEP is available, query ViaCEP to complete details
      if (finalZip && (!baseAddress || !finalCity || !finalState)) {
        setProgressMsg(`Buscando CEP ${finalZip} para ${r.name}...`);
        const cepInfo = await fetchAddressByCep(finalZip);
        if (cepInfo) {
          if (!baseAddress && cepInfo.logradouro) baseAddress = cepInfo.logradouro;
          if (!finalCity && cepInfo.localidade) finalCity = cepInfo.localidade;
          if (!finalState && cepInfo.uf) finalState = cepInfo.uf;
        }
      }

      // Split street name and number correctly
      const parsedAddress = parseAddressAndNumber(baseAddress, baseNumber);
      const fullAddress = [parsedAddress.street, parsedAddress.number].filter(Boolean).join(', ');

      const payload: any = {
        name: finalName,
        phone: finalPhone,
        whatsapp: finalWhatsapp,
        email: finalEmail,
        address: fullAddress,
        city: finalCity,
        state: finalState,
        zip_code: finalZip,
        document: finalDoc,
        notes: combinedNotes,
      };
      
      Object.keys(payload).forEach(k => {
        if (!payload[k]) delete payload[k];
      });

      // Geo lookup if needed
      const needsGeocoding = !existing || !existing.latitude || !existing.longitude || 
                             (existing.address !== payload.address) || (existing.city !== payload.city);

      if (needsGeocoding && (payload.address || payload.city)) {
        setProgressMsg(`Buscando geolocalização para ${r.name}...`);
        if (i > 0) await new Promise(res => setTimeout(res, 1100));
        const coords = await geocodeAddress(payload.address || '', payload.city || '', payload.state || '');
        if (coords) {
          payload.latitude = coords.lat;
          payload.longitude = coords.lng;
        }
      } else if (existing) {
        if (existing.latitude) payload.latitude = existing.latitude;
        if (existing.longitude) payload.longitude = existing.longitude;
      }

      setProgressMsg(`Salvando ${r.name}...`);
      if (existing) {
        const { error } = await supabase.from('customers').update(payload).eq('id', existing.id);
        if (error) errs.push(`Linha ${i + 1} (${r.name}): ${error.message}`);
        else count++;
      } else {
        const { error } = await supabase.from('customers').insert(payload);
        if (error) errs.push(`Linha ${i + 1} (${r.name}): ${error.message}`);
        else count++;
      }
    }

    setImportCount(count);
    setErrors(errs);
    setImporting(false);
    setProgressMsg('');
    setStep('done');
    if (errs.length === 0) onSuccess();
  }

  const maxCols = Math.max(headers.length, ...rows.map(r => r.length));
  const columnOptions = Array.from({ length: maxCols }).map((_, i) => ({
    label: i < headers.length ? headers[i] : `Coluna extra ${i + 1}`,
    value: String(i)
  }));

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-slate-800">Importar Clientes</h2>
            <p className="text-sm text-slate-500">Importar via arquivo CSV, planilha Excel (.xls, .xlsx) ou TXT</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-5">
          {/* step: upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-slate-200 rounded-xl p-10 text-center cursor-pointer hover:border-amber-400 hover:bg-amber-50 transition-colors"
              >
                <Upload size={32} className="text-slate-300 mx-auto mb-3" />
                <p className="font-medium text-slate-600">Clique para selecionar o arquivo</p>
                <p className="text-sm text-slate-400 mt-1">Planilhas Excel (.xlsx, .xls), CSV ou TXT com separador vírgula, ponto-e-vírgula ou tabulação</p>
                <input ref={fileRef} type="file" accept=".csv,.txt,.tsv,.xls,.xlsx" onChange={handleFile} className="hidden" />
              </div>
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                  <Download size={12} /> Formato esperado
                </p>
                <code className="text-xs text-slate-500 font-mono whitespace-pre">
{`nome,telefone,email,cidade
João Silva,(11) 99999-0001,joao@email.com,São Paulo
Maria Santos,(11) 99999-0002,maria@email.com,Campinas`}
                </code>
              </div>
            </div>
          )}

          {/* step: map */}
          {step === 'map' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                <p className="text-sm text-blue-700">
                  Arquivo carregado com <strong>{rows.length}</strong> linhas e <strong>{headers.length}</strong> colunas.
                  Mapeie as colunas para os campos do sistema.
                </p>
              </div>

              {/* show first few rows for reference */}
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      {headers.map((h, i) => (
                        <th key={i} className="px-2 py-1.5 text-left font-semibold text-slate-600 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.slice(0, 3).map((row, ri) => (
                      <tr key={ri} className="hover:bg-slate-50">
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-2 py-1.5 text-slate-500 whitespace-nowrap max-w-[150px] truncate">
                            {cell || '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {FIELD_KEYS.map(field => (
                  <div key={field}>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">{FIELD_LABELS[field]}</label>
                    <select
                      value={columnMap[field]}
                      onChange={e => setColumnMap(prev => ({ ...prev, [field]: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                    >
                      <option value="">— ignorar —</option>
                      {columnOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setStep('preview')}
                disabled={!columnMap.name}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40"
              >
                Ver Prévia
              </button>
            </div>
          )}

          {/* step: preview */}
          {step === 'preview' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Prévia dos primeiros registros. Total a importar: <strong>{buildAllRows().length}</strong>
              </p>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      {['Nome', 'Telefone', 'E-mail', 'Endereço', 'Cidade'].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-semibold text-slate-600">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {buildPreviewRows().map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-slate-700 font-medium">{row.name || '—'}</td>
                        <td className="px-3 py-2 text-slate-500">{row.phone || '—'}</td>
                        <td className="px-3 py-2 text-slate-500">{row.email || '—'}</td>
                        <td className="px-3 py-2 text-slate-500" title="Como o endereço será salvo">
                          {[row.address, row.number].filter(Boolean).join(', ') || '—'}
                        </td>
                        <td className="px-3 py-2 text-slate-500">{row.city || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {buildAllRows().length === 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-sm text-amber-700">
                    Nenhuma linha válida encontrada. Verifique se a coluna "Nome" está mapeada corretamente.
                  </p>
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={() => setStep('map')}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors">
                  Voltar
                </button>
                <button onClick={handleImport} disabled={importing || buildAllRows().length === 0}
                  className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                  {importing ? (progressMsg || 'Importando...') : `Importar ${buildAllRows().length} clientes`}
                </button>
              </div>
            </div>
          )}

          {/* step: done */}
          {step === 'done' && (
            <div className="text-center py-6">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                errors.length > 0 ? 'bg-amber-100' : 'bg-emerald-100'
              }`}>
                {errors.length > 0
                  ? <AlertCircle size={32} className="text-amber-500" />
                  : <CheckCircle size={32} className="text-emerald-500" />
                }
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-1">Importação Concluída</h3>
              <p className="text-slate-500 text-sm">{importCount} clientes importados com sucesso.</p>
              {errors.length > 0 && (
                <div className="mt-4 bg-red-50 border border-red-100 rounded-xl p-4 text-left">
                  <p className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-1.5">
                    <AlertCircle size={14} /> {errors.length} lote(s) com erro
                  </p>
                  <div className="space-y-1 max-h-32 overflow-auto">
                    {errors.map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
                  </div>
                </div>
              )}
              <button onClick={onClose}
                className="mt-6 px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors">
                Fechar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
