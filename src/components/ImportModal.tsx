import { useState, useRef } from 'react';
import { X, Upload, AlertCircle, CheckCircle, Download, MapPin } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { geocodeAddress } from '../lib/geocode';
import { Customer } from '../lib/types';
import {
  coerceCellToString,
  parseSpreadsheetCsv,
  isSameCustomerImportMatch,
  mergeImportNotes,
  hasSchemaColumn,
  isMissingColumnSchemaError,
  extractCustomerSegment,
} from '../lib/customersEngine';
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
  state: 'Estado (UF)',
  zip_code: 'CEP',
  document: 'CPF/CNPJ',
  segment: 'Segmento',
  notes: 'Observações',
};

const FIELD_KEYS = Object.keys(FIELD_LABELS) as Array<keyof ColumnMap>;

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

  if (!num && street) {
    const numberRegex = /(?:,\s*|,\s*nº\s*|\s+nº\s*|\s+)(\d+)\s*$/i;
    const match = street.match(numberRegex);
    if (match) {
      num = match[1];
      street = street.replace(numberRegex, '').trim();
    }
  }

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
  const [enableGeocode, setEnableGeocode] = useState(true);
  const [importing, setImporting] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [createdCount, setCreatedCount] = useState(0);
  const [updatedCount, setUpdatedCount] = useState(0);
  const [cancelled, setCancelled] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError('');

    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = new Uint8Array(ev.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rawParsed = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '' });
          const parsed: string[][] = rawParsed
            .map(row => (Array.isArray(row) ? row.map(coerceCellToString) : []))
            .filter(row => row.some(cell => cell !== ''));
          if (parsed.length < 2) {
            setUploadError('A planilha precisa conter ao menos uma linha de cabeçalho e uma linha de dados.');
            return;
          }
          processParsedData(parsed);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setUploadError('Erro ao ler planilha Excel: ' + msg);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = String(ev.target?.result ?? '');
        const parsed = parseSpreadsheetCsv(text);
        if (parsed.length < 2) {
          setUploadError('O arquivo precisa conter ao menos uma linha de cabeçalho e uma linha de dados.');
          return;
        }
        processParsedData(parsed);
      };
      reader.readAsText(file, 'UTF-8');
    }
  }

  function processParsedData(parsed: string[][]) {
    const headerRow = parsed[0].map(h => coerceCellToString(h));
    const dataRows = parsed.slice(1).map(row => row.map(coerceCellToString));

    setHeaders(headerRow);
    setRows(dataRows);
    setEnableGeocode(dataRows.length <= 30);

    const auto: ColumnMap = {
      name: '', phone: '', whatsapp: '', email: '',
      address: '', number: '', city: '', state: '', zip_code: '', document: '', segment: '', notes: '',
    };
    const mappingRules: Record<keyof ColumnMap, RegExp> = {
      name: /nome|name|raz[aã]o|empresa|cliente/i,
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
          auto[field] = String(idx);
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
    if (Number.isNaN(idx) || idx < 0 || idx >= row.length) return '';
    return coerceCellToString(row[idx]);
  }

  function buildAllRows(): Record<keyof ColumnMap, string>[] {
    return rows
      .map(row => {
        const obj = {} as Record<keyof ColumnMap, string>;
        for (const field of FIELD_KEYS) {
          obj[field] = getColumnValue(row, columnMap[field]);
        }
        return obj;
      })
      .filter(r => r.name.trim().length > 0);
  }

  function buildPreviewRows(): Record<keyof ColumnMap, string>[] {
    return buildAllRows().slice(0, 5);
  }

  async function loadAllExistingCustomers(): Promise<Customer[]> {
    const all: Customer[] = [];
    const PAGE_SIZE = 1000;
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .range(from, from + PAGE_SIZE - 1);
      if (error || !data || data.length === 0) {
        hasMore = false;
      } else {
        all.push(...(data as Customer[]));
        from += PAGE_SIZE;
        if (data.length < PAGE_SIZE) hasMore = false;
      }
    }
    return all;
  }

  async function handleImport() {
    setImporting(true);
    setCancelled(false);
    cancelRef.current = false;
    setProgressMsg('Carregando clientes existentes...');
    const errs: string[] = [];
    let created = 0;
    let updated = 0;

    const knownCustomers = await loadAllExistingCustomers();
    let hasSegmentCol = knownCustomers.length > 0 ? hasSchemaColumn(knownCustomers[0], 'segment') : false;

    const allRows = buildAllRows();
    let geocodeRequests = 0;

    for (let i = 0; i < allRows.length; i++) {
      if (cancelRef.current) {
        setCancelled(true);
        break;
      }

      const r = allRows[i];
      const nameStr = r.name.trim();
      setProgressMsg(`Processando ${i + 1} de ${allRows.length}: ${nameStr}`);

      const zip = r.zip_code.trim();
      const addressStr = r.address.trim();
      const numberStr = r.number.trim();
      const cityStr = r.city.trim();
      const stateStr = r.state.trim().toUpperCase();
      const emailStr = r.email.trim();
      const phoneStr = r.phone.trim();
      const whatsappStr = r.whatsapp.trim();
      const documentStr = r.document.trim();
      const segmentStr = r.segment.trim();
      const notesStr = r.notes.trim();

      const existingIdx = knownCustomers.findIndex(c =>
        isSameCustomerImportMatch(c, { name: nameStr, document: documentStr, email: emailStr })
      );
      const existing = existingIdx >= 0 ? knownCustomers[existingIdx] : undefined;

      const finalPhone = phoneStr || existing?.phone || '';
      const finalWhatsapp = whatsappStr || existing?.whatsapp || '';
      const finalEmail = emailStr || existing?.email || '';
      const finalDoc = documentStr || existing?.document || '';
      const finalSegment = segmentStr || extractCustomerSegment(existing);
      const finalZip = zip || existing?.zip_code || '';
      let finalCity = cityStr || existing?.city || '';
      let finalState = (stateStr || existing?.state || '').toUpperCase();

      let baseAddress = addressStr;
      let baseNumber = numberStr;

      if (existing?.address && !addressStr) {
        const dbParsed = parseAddressAndNumber(existing.address, '');
        baseAddress = dbParsed.street;
        baseNumber = dbParsed.number || numberStr;
      }

      if (finalZip && (!baseAddress || !finalCity || !finalState)) {
        setProgressMsg(`Buscando CEP ${finalZip} (${i + 1}/${allRows.length})...`);
        const cepInfo = await fetchAddressByCep(finalZip);
        if (cepInfo) {
          if (!baseAddress && cepInfo.logradouro) baseAddress = cepInfo.logradouro;
          if (!finalCity && cepInfo.localidade) finalCity = cepInfo.localidade;
          if (!finalState && cepInfo.uf) finalState = cepInfo.uf.toUpperCase();
        }
      }

      const parsedAddress = parseAddressAndNumber(baseAddress, baseNumber);
      const fullAddress = [parsedAddress.street, parsedAddress.number].filter(Boolean).join(', ');

      const mergedNotes = mergeImportNotes(existing?.notes, notesStr, finalSegment, hasSegmentCol);

      const payload: Record<string, unknown> = {
        name: nameStr,
        phone: finalPhone,
        whatsapp: finalWhatsapp,
        email: finalEmail,
        address: fullAddress,
        city: finalCity,
        state: finalState,
        zip_code: finalZip,
        document: finalDoc,
        notes: mergedNotes,
      };
      if (hasSegmentCol && finalSegment) {
        payload.segment = finalSegment;
      }

      const addressChanged =
        !existing ||
        (existing.address || '').trim() !== fullAddress ||
        (existing.city || '').trim() !== finalCity;
      const needsGeocoding =
        enableGeocode &&
        (fullAddress || finalCity) &&
        (!existing || existing.latitude === null || existing.longitude === null || addressChanged);

      if (needsGeocoding) {
        setProgressMsg(`Buscando GPS (${i + 1}/${allRows.length}): ${nameStr}`);
        if (geocodeRequests > 0) await new Promise(res => setTimeout(res, 1100));
        geocodeRequests++;
        const coords = await geocodeAddress(fullAddress, finalCity, finalState);
        if (coords) {
          payload.latitude = coords.lat;
          payload.longitude = coords.lng;
        }
      } else if (existing) {
        if (existing.latitude !== null && existing.latitude !== undefined) payload.latitude = existing.latitude;
        if (existing.longitude !== null && existing.longitude !== undefined) payload.longitude = existing.longitude;
      }

      setProgressMsg(`Salvando (${i + 1}/${allRows.length}): ${nameStr}`);

      const writeOnce = async (body: Record<string, unknown>) => {
        if (existing) {
          return supabase.from('customers').update(body).eq('id', existing.id).select('*').single();
        }
        return supabase.from('customers').insert(body).select('*').single();
      };

      let result = await writeOnce(payload);
      if (result.error && hasSegmentCol && isMissingColumnSchemaError(result.error, 'segment')) {
        hasSegmentCol = false;
        delete payload.segment;
        payload.notes = mergeImportNotes(existing?.notes, notesStr, finalSegment, false);
        result = await writeOnce(payload);
      }

      if (result.error) {
        errs.push(`Linha ${i + 1} (${nameStr}): ${result.error.message}`);
      } else {
        const savedRow = result.data as Customer | null;
        if (existing) {
          updated++;
          if (savedRow) knownCustomers[existingIdx] = savedRow;
        } else {
          created++;
          if (savedRow) knownCustomers.push(savedRow);
        }
      }
    }

    setCreatedCount(created);
    setUpdatedCount(updated);
    setErrors(errs);
    setImporting(false);
    setProgressMsg('');
    setStep('done');
    if (created + updated > 0) onSuccess();
  }

  const maxCols = Math.max(headers.length, ...rows.map(r => r.length), 0);
  const columnOptions = Array.from({ length: maxCols }).map((_, i) => ({
    label: i < headers.length && headers[i] ? headers[i] : `Coluna extra ${i + 1}`,
    value: String(i),
  }));

  const validTotal = buildAllRows().length;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-slate-800">Importar Clientes</h2>
            <p className="text-sm text-slate-500">Importar via arquivo CSV, planilha Excel (.xls, .xlsx) ou TXT</p>
          </div>
          <button
            onClick={onClose}
            disabled={importing}
            className="text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-40"
          >
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
                <p className="text-sm text-slate-400 mt-1">
                  Planilhas Excel (.xlsx, .xls), CSV (ponto-e-vírgula ou vírgula) ou TXT
                </p>
                <input ref={fileRef} type="file" accept=".csv,.txt,.tsv,.xls,.xlsx" onChange={handleFile} className="hidden" />
              </div>
              {uploadError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  {uploadError}
                </div>
              )}
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                  <Download size={12} /> Formato esperado (compatível com Excel PT-BR)
                </p>
                <code className="text-xs text-slate-500 font-mono whitespace-pre block overflow-x-auto">
{`Nome;Telefone;E-mail;Segmento;Cidade;UF;CPF/CNPJ
João Silva;(41) 99999-0001;joao@email.com;Bar;Curitiba;PR;123.456.789-00
Maria Santos;(41) 99999-0002;maria@email.com;Restaurante;Pinhais;PR;12.345.678/0001-90`}
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
                Prévia dos primeiros registros. Total válido para importar/atualizar: <strong>{validTotal}</strong>
              </p>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      {['Nome', 'Telefone', 'Segmento', 'Endereço', 'Cidade'].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-semibold text-slate-600">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {buildPreviewRows().map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-slate-700 font-medium">{row.name || '—'}</td>
                        <td className="px-3 py-2 text-slate-500">{row.phone || '—'}</td>
                        <td className="px-3 py-2 text-slate-500">{row.segment || '—'}</td>
                        <td className="px-3 py-2 text-slate-500" title="Como o endereço será salvo">
                          {[row.address, row.number].filter(Boolean).join(', ') || '—'}
                        </td>
                        <td className="px-3 py-2 text-slate-500">{row.city || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <label className="flex items-start gap-2.5 bg-slate-50 border border-slate-200 rounded-xl p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableGeocode}
                  disabled={importing}
                  onChange={e => setEnableGeocode(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-amber-500 focus:ring-amber-400"
                />
                <div className="text-xs text-slate-600">
                  <span className="font-semibold text-slate-700 flex items-center gap-1">
                    <MapPin size={12} className="text-amber-500" />
                    Buscar geolocalização (GPS) automaticamente durante a importação
                  </span>
                  <p className="text-slate-500 mt-0.5">
                    Usa OpenStreetMap (~1,1s por cliente novo). Para planilhas grandes, desmarque para importar em segundos e sincronize GPS depois.
                  </p>
                </div>
              </label>

              {validTotal === 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-sm text-amber-700">
                    Nenhuma linha válida encontrada. Verifique se a coluna "Nome" está mapeada corretamente.
                  </p>
                </div>
              )}

              {importing && progressMsg && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 font-medium flex items-center justify-between gap-3">
                  <span className="truncate">{progressMsg}</span>
                  <button
                    type="button"
                    onClick={() => { cancelRef.current = true; }}
                    className="px-2.5 py-1 bg-white border border-amber-300 hover:bg-amber-100 text-amber-800 rounded-lg font-semibold shrink-0"
                  >
                    Cancelar
                  </button>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('map')}
                  disabled={importing}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-40"
                >
                  Voltar
                </button>
                <button
                  onClick={handleImport}
                  disabled={importing || validTotal === 0}
                  className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {importing ? 'Importando...' : `Importar ${validTotal} clientes`}
                </button>
              </div>
            </div>
          )}

          {/* step: done */}
          {step === 'done' && (
            <div className="text-center py-6">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                errors.length > 0 || cancelled ? 'bg-amber-100' : 'bg-emerald-100'
              }`}>
                {errors.length > 0 || cancelled
                  ? <AlertCircle size={32} className="text-amber-500" />
                  : <CheckCircle size={32} className="text-emerald-500" />
                }
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-1">
                {cancelled ? 'Importação Interrompida' : 'Importação Concluída'}
              </h3>
              <p className="text-slate-600 text-sm">
                <strong>{createdCount}</strong> novo(s) criado(s) · <strong>{updatedCount}</strong> atualizado(s)
                {errors.length > 0 ? ` · ${errors.length} erro(s)` : ''}
              </p>
              {errors.length > 0 && (
                <div className="mt-4 bg-red-50 border border-red-100 rounded-xl p-4 text-left">
                  <p className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-1.5">
                    <AlertCircle size={14} /> {errors.length} linha(s) com erro
                  </p>
                  <div className="space-y-1 max-h-36 overflow-auto">
                    {errors.map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
                  </div>
                </div>
              )}
              <button
                onClick={onClose}
                className="mt-6 px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Fechar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
