import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Wrench,
  ShieldCheck,
  Compass,
  Search,
  Download,
  RefreshCw,
  MessageCircle,
  ClipboardPlus,
  ExternalLink,
  Trash2,
  Database,
  Copy,
  Check,
  Loader2,
  MapPin,
  Phone,
  Calendar,
  AlertTriangle,
  Building2,
  User,
  FileText,
  Save,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { logOsStageTransition } from '../lib/osStockSync';
import { formatLocalDateTime, getLocalTodayFileStamp } from '../lib/customersEngine';
import {
  CustomerLookupRecord,
  SERVICE_REQUESTS_SETUP_SQL,
  SITE_VISIT_ACTIVITY_LABELS,
  SITE_VISIT_STATUS_META,
  SITE_VISIT_URGENCY_META,
  SiteVisitActivity,
  SiteVisitRequestRow,
  SiteVisitStatus,
  buildClientWhatsAppReplyUrl,
  buildOsDiagnosisFromVisit,
  buildSiteVisitsCsv,
  computeSiteVisitsStats,
  extractEquipmentFromVisit,
  filterSiteVisits,
  findMatchingCustomerByPhone,
  formatPeriodPtBr,
  formatQuestionnaireHighlights,
  formatVisitDateBr,
  isMissingServiceRequestsTableError,
  mapActivityToOsVisitType,
  mapUrgencyToOsPriority,
} from '../lib/siteVisitsEngine';

interface SiteVisitsTabProps {
  onOpenWorkshopOrder: (orderId: string) => void;
  onSelectCustomer: (customerId: string) => void;
  onNewCountChange?: (count: number) => void;
}

const ACTIVITY_ICON: Record<SiteVisitActivity, typeof Wrench> = {
  corretivo: Wrench,
  sanitizacao: ShieldCheck,
  projeto_instalacao: Compass,
};

const ALL_STATUS_OPTIONS: SiteVisitStatus[] = [
  'novo',
  'em_contato',
  'agendado',
  'convertido_os',
  'concluido',
  'cancelado',
];

export default function SiteVisitsTab({
  onOpenWorkshopOrder,
  onSelectCustomer,
  onNewCountChange,
}: SiteVisitsTabProps) {
  const { profile, user } = useAuth();
  const [visits, setVisits] = useState<SiteVisitRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingTable, setMissingTable] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  const [search, setSearch] = useState('');
  const [activityFilter, setActivityFilter] = useState<'all' | SiteVisitActivity>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | SiteVisitStatus>('all');

  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<SiteVisitRequestRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadVisits = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    const { data, error } = await supabase
      .from('service_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      if (isMissingServiceRequestsTableError(error)) {
        setMissingTable(true);
        setVisits([]);
        onNewCountChange?.(0);
      } else {
        setErrorMsg(`Erro ao carregar visitas técnicas: ${error.message}`);
      }
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as SiteVisitRequestRow[];
    setMissingTable(false);
    setVisits(rows);
    onNewCountChange?.(rows.filter(r => r.status === 'novo').length);
    setLoading(false);
  }, [onNewCountChange]);

  useEffect(() => {
    loadVisits();
  }, [loadVisits]);

  const stats = useMemo(() => computeSiteVisitsStats(visits), [visits]);
  const filtered = useMemo(
    () =>
      filterSiteVisits(visits, {
        search,
        activity: activityFilter,
        status: statusFilter,
      }),
    [visits, search, activityFilter, statusFilter]
  );

  async function handleCopySql() {
    try {
      await navigator.clipboard.writeText(SERVICE_REQUESTS_SETUP_SQL);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2500);
    } catch {
      setErrorMsg('Não foi possível copiar automaticamente. Selecione o bloco SQL manualmente.');
    }
  }

  async function handleStatusChange(visit: SiteVisitRequestRow, nextStatus: SiteVisitStatus) {
    setUpdatingId(visit.id);
    setErrorMsg('');
    const { error } = await supabase
      .from('service_requests')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', visit.id);

    setUpdatingId(null);
    if (error) {
      setErrorMsg(`Erro ao atualizar status: ${error.message}`);
      return;
    }
    const nextRows = visits.map(v => (v.id === visit.id ? { ...v, status: nextStatus } : v));
    setVisits(nextRows);
    onNewCountChange?.(nextRows.filter(r => r.status === 'novo').length);
  }

  async function handleSaveNotes(visit: SiteVisitRequestRow) {
    setUpdatingId(visit.id);
    setErrorMsg('');
    const clean = notesDraft.trim();
    const { error } = await supabase
      .from('service_requests')
      .update({ internal_notes: clean, updated_at: new Date().toISOString() })
      .eq('id', visit.id);
    setUpdatingId(null);
    if (error) {
      setErrorMsg(`Erro ao salvar observação interna: ${error.message}`);
      return;
    }
    setVisits(prev => prev.map(v => (v.id === visit.id ? { ...v, internal_notes: clean } : v)));
    setEditingNotesId(null);
  }

  async function loadAllCustomersForDedup(): Promise<CustomerLookupRecord[]> {
    const all: CustomerLookupRecord[] = [];
    const PAGE_SIZE = 1000;
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, phone, whatsapp, city')
        .range(from, from + PAGE_SIZE - 1);
      if (error || !data || data.length === 0) {
        hasMore = false;
      } else {
        all.push(...(data as CustomerLookupRecord[]));
        from += PAGE_SIZE;
        if (data.length < PAGE_SIZE) hasMore = false;
      }
    }
    return all;
  }

  async function handleConvertToOrder(visit: SiteVisitRequestRow) {
    if (visit.converted_order_id) {
      onOpenWorkshopOrder(visit.converted_order_id);
      return;
    }

    setConvertingId(visit.id);
    setErrorMsg('');
    setInfoMsg('');

    try {
      // 1. Deduplicate customer by normalized phone/whatsapp digits (paginated >1000)
      let customerId = visit.converted_customer_id;
      let reusedCustomer = false;

      if (!customerId) {
        const allCustomers = await loadAllCustomersForDedup();
        const existing = findMatchingCustomerByPhone(allCustomers, visit.phone_digits || visit.phone);
        if (existing) {
          customerId = existing.id;
          reusedCustomer = true;
        }
      }

      // 2. Create customer if no match found (schema-safe core columns)
      if (!customerId) {
        const displayName = visit.company_name.trim()
          ? `${visit.company_name.trim()} (${visit.customer_name.trim()})`
          : visit.customer_name.trim();

        const cityParts = visit.city.split('-').map(p => p.trim());
        const cityOnly = cityParts[0] || visit.city.trim();
        const stateOnly = cityParts[1] && cityParts[1].length <= 2 ? cityParts[1].toUpperCase() : 'RS';

        const { data: createdCust, error: custErr } = await supabase
          .from('customers')
          .insert({
            name: displayName,
            phone: visit.phone,
            whatsapp: visit.phone,
            email: '',
            address: visit.address || '',
            city: cityOnly,
            state: stateOnly,
            zip_code: '',
            document: '',
            notes: `Origem: Agendamento pelo site (${visit.protocol_code})`,
          })
          .select('id')
          .single();

        if (custErr || !createdCust) {
          throw new Error(custErr?.message || 'Não foi possível cadastrar o cliente.');
        }
        customerId = (createdCust as { id: string }).id;
      }

      // 3. Create OS in Workshop strictly in initial stage 'Triagem'
      const equip = extractEquipmentFromVisit(visit);
      const operatorName = profile?.full_name || user?.email || 'Admin';
      const nowIso = new Date().toISOString();

      const { data: createdOs, error: osErr } = await supabase
        .from('service_orders')
        .insert({
          customer_id: customerId,
          visit_type: mapActivityToOsVisitType(visit.activity_type),
          priority: mapUrgencyToOsPriority(visit.urgency),
          status: 'Triagem',
          diagnosis: buildOsDiagnosisFromVisit(visit),
          labor_cost: 0,
          created_by: operatorName,
          equip_type: equip.equip_type,
          equip_brand: equip.equip_brand,
          equip_model: '',
          equip_serial: '',
          equip_gas: '',
          equip_voltage: equip.equip_voltage,
          equip_accessories: '',
          equip_condition: '',
          is_rework: false,
          updated_at: nowIso,
        })
        .select('id, order_number')
        .single();

      if (osErr || !createdOs) {
        throw new Error(osErr?.message || 'Não foi possível abrir a OS na Oficina.');
      }

      const newOrderId = (createdOs as { id: string; order_number?: number }).id;

      await logOsStageTransition({
        orderId: newOrderId,
        fromStatus: '',
        toStatus: 'Triagem',
        userName: operatorName,
        userId: profile?.id,
        notes: `OS gerada a partir de agendamento no site (${visit.protocol_code})`,
      });

      // 4. Link service_request to customer & OS
      await supabase
        .from('service_requests')
        .update({
          status: 'convertido_os',
          converted_customer_id: customerId,
          converted_order_id: newOrderId,
          updated_at: nowIso,
        })
        .eq('id', visit.id);

      const nextRows = visits.map(v =>
        v.id === visit.id
          ? {
              ...v,
              status: 'convertido_os' as SiteVisitStatus,
              converted_customer_id: customerId,
              converted_order_id: newOrderId,
            }
          : v
      );
      setVisits(nextRows);
      onNewCountChange?.(nextRows.filter(r => r.status === 'novo').length);
      setInfoMsg(
        `OS aberta em Triagem (${reusedCustomer ? 'cliente existente reutilizado' : 'novo cliente cadastrado'}). Abrindo na Oficina...`
      );
      onOpenWorkshopOrder(newOrderId);
    } catch (err) {
      setErrorMsg(
        `Erro ao converter em OS: ${err instanceof Error ? err.message : 'erro inesperado'}`
      );
    } finally {
      setConvertingId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setErrorMsg('');
    const { error } = await supabase
      .from('service_requests')
      .delete()
      .eq('id', deleteTarget.id);
    setDeleting(false);
    if (error) {
      setErrorMsg(`Erro ao excluir solicitação: ${error.message}`);
      setDeleteTarget(null);
      return;
    }
    const nextRows = visits.filter(v => v.id !== deleteTarget.id);
    setVisits(nextRows);
    onNewCountChange?.(nextRows.filter(r => r.status === 'novo').length);
    setDeleteTarget(null);
  }

  function handleExportCsv() {
    const csv = buildSiteVisitsCsv(filtered);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `refrimaq_visitas_site_${getLocalTodayFileStamp()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 size={28} className="animate-spin text-amber-500" />
      </div>
    );
  }

  if (missingTable) {
    return (
      <div className="bg-white border border-amber-200 rounded-2xl p-6 max-w-4xl space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <Database size={22} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Ativar tabela de Visitas Técnicas no Supabase (1 clique)
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              A tabela <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">public.service_requests</code>{' '}
              ainda não foi criada no Supabase. Copie o SQL abaixo, execute no{' '}
              <strong>SQL Editor</strong> do Supabase e clique em <strong>Recarregar</strong>.
              Enquanto isso, os agendamentos do site já funcionam normalmente via WhatsApp.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleCopySql}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {copiedSql ? <Check size={15} /> : <Copy size={15} />}
            {copiedSql ? 'SQL Copiado!' : 'Copiar SQL'}
          </button>
          <button
            onClick={loadVisits}
            className="flex items-center gap-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <RefreshCw size={15} />
            Já executei — Recarregar
          </button>
        </div>

        <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 text-xs overflow-x-auto max-h-80 leading-relaxed">
          {SERVICE_REQUESTS_SETUP_SQL}
        </pre>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg('')} className="text-xs font-semibold hover:underline">
            Fechar
          </button>
        </div>
      )}

      {infoMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3">
          <span>{infoMsg}</span>
          <button onClick={() => setInfoMsg('')} className="text-xs font-semibold hover:underline">
            Fechar
          </button>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500 font-medium">Novos chamados</p>
          <p className="text-2xl font-bold text-sky-600 mt-1 tabular-nums">{stats.novos}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500 font-medium">Urgentes abertos</p>
          <p className="text-2xl font-bold text-red-600 mt-1 tabular-nums">{stats.urgentes}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500 font-medium">Corretivo</p>
          <p className="text-2xl font-bold text-slate-800 mt-1 tabular-nums">{stats.corretivos}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500 font-medium">Sanitização</p>
          <p className="text-2xl font-bold text-slate-800 mt-1 tabular-nums">{stats.sanitizacoes}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 col-span-2 sm:col-span-1">
          <p className="text-xs text-slate-500 font-medium">Projeto / Instalação</p>
          <p className="text-2xl font-bold text-slate-800 mt-1 tabular-nums">{stats.projetos}</p>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row gap-3 lg:items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por protocolo, nome, empresa, cidade ou telefone..."
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={activityFilter}
            onChange={e => setActivityFilter(e.target.value as 'all' | SiteVisitActivity)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="all">Todas as atividades</option>
            <option value="corretivo">Chamado Corretivo</option>
            <option value="sanitizacao">Sanitização / Assepsia</option>
            <option value="projeto_instalacao">Projeto e Instalação</option>
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as 'all' | SiteVisitStatus)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="all">Todos os status</option>
            {ALL_STATUS_OPTIONS.map(st => (
              <option key={st} value={st}>
                {SITE_VISIT_STATUS_META[st].label}
              </option>
            ))}
          </select>

          <button
            onClick={loadVisits}
            className="flex items-center gap-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-2 rounded-lg text-sm transition-colors"
            title="Recarregar solicitações"
          >
            <RefreshCw size={15} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>

          {filtered.length > 0 && (
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-2 rounded-lg text-sm transition-colors"
            >
              <Download size={15} />
              <span className="hidden sm:inline">CSV</span>
            </button>
          )}
        </div>
      </div>

      {/* Visits List */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-2">
          <Wrench size={32} className="mx-auto text-slate-300" />
          <p className="text-slate-700 font-semibold">Nenhuma visita técnica encontrada</p>
          <p className="text-sm text-slate-500">
            {visits.length === 0
              ? 'Assim que um cliente agendar uma visita pelo botão Serviços no site refrimaqrs.com.br, ela aparecerá aqui automaticamente.'
              : 'Tente limpar os filtros de busca, atividade ou status.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(visit => {
            const ActivityIcon = ACTIVITY_ICON[visit.activity_type] ?? Wrench;
            const statusMeta = SITE_VISIT_STATUS_META[visit.status];
            const urgencyMeta = SITE_VISIT_URGENCY_META[visit.urgency];
            const highlights = formatQuestionnaireHighlights(visit);
            const isConverting = convertingId === visit.id;
            const isUpdating = updatingId === visit.id;
            const isEditingNotes = editingNotesId === visit.id;

            return (
              <div
                key={visit.id}
                className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4 hover:border-slate-300 transition-colors"
              >
                {/* Card Header */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
                      <ActivityIcon size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                          {visit.protocol_code}
                        </span>
                        <span className="text-sm font-bold text-slate-900">
                          {SITE_VISIT_ACTIVITY_LABELS[visit.activity_type]}
                        </span>
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${urgencyMeta.badgeClass}`}
                        >
                          {urgencyMeta.label}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Recebido em {formatLocalDateTime(visit.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      disabled={isUpdating}
                      value={visit.status}
                      onChange={e => handleStatusChange(visit, e.target.value as SiteVisitStatus)}
                      className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border cursor-pointer focus:outline-none ${statusMeta.badgeClass}`}
                    >
                      {ALL_STATUS_OPTIONS.map(st => (
                        <option key={st} value={st} className="bg-white text-slate-800">
                          {SITE_VISIT_STATUS_META[st].label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Customer Info Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-sm bg-slate-50 border border-slate-100 rounded-xl p-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <User size={15} className="text-slate-400 shrink-0" />
                    <span className="font-medium text-slate-900 truncate">{visit.customer_name}</span>
                  </div>
                  {visit.company_name && (
                    <div className="flex items-center gap-2 min-w-0">
                      <Building2 size={15} className="text-slate-400 shrink-0" />
                      <span className="text-slate-700 truncate">{visit.company_name}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 min-w-0">
                    <Phone size={15} className="text-slate-400 shrink-0" />
                    <span className="text-slate-800 font-mono text-xs tabular-nums">{visit.phone}</span>
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <MapPin size={15} className="text-slate-400 shrink-0" />
                    <span className="text-slate-700 truncate">
                      {visit.city}
                      {visit.address ? ` · ${visit.address}` : ''}
                    </span>
                  </div>
                  {(visit.preferred_date || visit.preferred_period !== 'qualquer') && (
                    <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-4 text-xs text-slate-600 pt-1 border-t border-slate-200/70">
                      <Calendar size={14} className="text-amber-600 shrink-0" />
                      <span>
                        Preferência: <strong>{formatVisitDateBr(visit.preferred_date)}</strong> ·{' '}
                        {formatPeriodPtBr(visit.preferred_period)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Questionnaire Highlights */}
                {highlights.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {highlights.map((h, idx) => (
                      <span
                        key={`${visit.id}-hl-${idx}`}
                        className="text-xs px-2.5 py-1 rounded-lg bg-amber-50 text-amber-900 border border-amber-200/70 font-medium"
                      >
                        {h}
                      </span>
                    ))}
                  </div>
                )}

                {Boolean(visit.questionnaire?.notes) && (
                  <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                    <strong>Detalhes do cliente:</strong> {String(visit.questionnaire.notes)}
                  </p>
                )}

                {/* Internal Notes */}
                {isEditingNotes ? (
                  <div className="space-y-2">
                    <textarea
                      rows={2}
                      value={notesDraft}
                      onChange={e => setNotesDraft(e.target.value)}
                      placeholder="Anotações internas da equipe (ex.: técnico alocado, horário confirmado)..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleSaveNotes(visit)}
                        disabled={isUpdating}
                        className="inline-flex items-center gap-1 bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg text-xs font-medium"
                      >
                        <Save size={13} />
                        Salvar nota
                      </button>
                      <button
                        onClick={() => setEditingNotesId(null)}
                        className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1.5"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  visit.internal_notes && (
                    <p className="text-xs text-indigo-900 bg-indigo-50/70 border border-indigo-100 rounded-lg px-3 py-2">
                      <strong>Nota interna:</strong> {visit.internal_notes}
                    </p>
                  )
                )}

                {/* Action Footer */}
                <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={buildClientWhatsAppReplyUrl(visit)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    >
                      <MessageCircle size={14} />
                      WhatsApp do Cliente
                    </a>

                    {visit.converted_order_id ? (
                      <button
                        onClick={() => onOpenWorkshopOrder(visit.converted_order_id!)}
                        className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      >
                        <ExternalLink size={14} />
                        Abrir OS na Oficina
                      </button>
                    ) : (
                      <button
                        onClick={() => handleConvertToOrder(visit)}
                        disabled={isConverting}
                        className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      >
                        {isConverting ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <ClipboardPlus size={14} />
                        )}
                        Converter em Cliente + OS
                      </button>
                    )}

                    {visit.converted_customer_id && (
                      <button
                        onClick={() => onSelectCustomer(visit.converted_customer_id!)}
                        className="inline-flex items-center gap-1 border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      >
                        <User size={13} />
                        Ver Cliente
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setEditingNotesId(visit.id);
                        setNotesDraft(visit.internal_notes || '');
                      }}
                      className="inline-flex items-center gap-1 border border-slate-200 hover:bg-slate-50 text-slate-600 px-2.5 py-1.5 rounded-lg text-xs transition-colors"
                    >
                      <FileText size={13} />
                      {visit.internal_notes ? 'Editar nota' : 'Adicionar nota'}
                    </button>
                  </div>

                  <button
                    onClick={() => setDeleteTarget(visit)}
                    className="inline-flex items-center gap-1 text-slate-400 hover:text-red-600 px-2 py-1.5 rounded-lg text-xs transition-colors"
                    title="Excluir solicitação"
                  >
                    <Trash2 size={14} />
                    Excluir
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 text-red-600">
                <AlertTriangle size={20} />
                <h3 className="font-bold text-slate-900">Excluir solicitação?</h3>
              </div>
              <button
                onClick={() => setDeleteTarget(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-slate-600">
              Tem certeza que deseja excluir o protocolo{' '}
              <strong>{deleteTarget.protocol_code}</strong> ({deleteTarget.customer_name})?
              {deleteTarget.converted_order_id &&
                ' A OS já gerada na Oficina não será excluída.'}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium inline-flex items-center gap-1.5"
              >
                {deleting && <Loader2 size={14} className="animate-spin" />}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
