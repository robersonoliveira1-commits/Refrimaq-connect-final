import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  Plus,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  Copy,
  Check,
  Database,
  RefreshCw,
  Upload,
  Loader2,
  Image as ImageIcon,
  Calendar,
  Monitor,
  Smartphone,
  AlertTriangle,
  X,
  ArrowRight,
  Layers,
  Files,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SITE_CATEGORIES, resolveSiteMediaUrl, slugifySiteProduct } from '../lib/siteCatalogEngine';
import {
  BANNER_ACTION_LABELS,
  BANNER_QUICK_TEMPLATES,
  BANNER_THEME_PRESETS,
  BLANK_BANNER_DRAFT,
  BannerFormDraft,
  BannerScheduleStatus,
  SITE_BANNERS_SETUP_SQL,
  SiteBannerActionType,
  SiteBannerMode,
  SiteBannerRow,
  SiteBannerThemePreset,
  formatBannerDateBr,
  getBannerScheduleStatus,
  getBannerThemePresetMeta,
  getLocalTodayIso,
  isMissingSiteBannersTableError,
  validateBannerDraft,
} from '../lib/siteBannersEngine';

interface SiteBannersTabProps {
  onLiveCountChange?: (count: number) => void;
}

const STATUS_STYLE: Record<BannerScheduleStatus, { label: string; cls: string }> = {
  live: { label: 'No ar agora', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  scheduled: { label: 'Agendado', cls: 'bg-sky-100 text-sky-800 border-sky-200' },
  expired: { label: 'Encerrado', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  inactive: { label: 'Pausado', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
};

export default function SiteBannersTab({ onLiveCountChange }: SiteBannersTabProps) {
  const [banners, setBanners] = useState<SiteBannerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingTable, setMissingTable] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Modal Editor state
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<BannerFormDraft>(BLANK_BANNER_DRAFT);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [saving, setSaving] = useState(false);
  const [uploadingTarget, setUploadingTarget] = useState<'desktop' | 'mobile' | null>(null);
  const [modalError, setModalError] = useState('');

  const desktopFileRef = useRef<HTMLInputElement>(null);
  const mobileFileRef = useRef<HTMLInputElement>(null);

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState<SiteBannerRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const todayIso = useMemo(() => getLocalTodayIso(), []);

  const loadBanners = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    const { data, error } = await supabase
      .from('site_banners')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      if (isMissingSiteBannersTableError(error)) {
        setMissingTable(true);
        setBanners([]);
        onLiveCountChange?.(0);
      } else {
        setErrorMsg(`Erro ao carregar banners: ${error.message}`);
      }
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as SiteBannerRow[];
    setMissingTable(false);
    setBanners(rows);
    const liveNow = rows.filter(b => getBannerScheduleStatus(b, getLocalTodayIso()) === 'live').length;
    onLiveCountChange?.(liveNow);
    setLoading(false);
  }, [onLiveCountChange]);

  useEffect(() => {
    loadBanners();
  }, [loadBanners]);

  function openNewWithTemplate(partial?: Partial<BannerFormDraft>) {
    setForm({
      ...BLANK_BANNER_DRAFT,
      ...partial,
      id: '',
      sort_order: String(banners.length + 1),
    });
    setPreviewMode('desktop');
    setModalError('');
    setModalOpen(true);
  }

  function openEdit(row: SiteBannerRow) {
    setForm({
      id: row.id,
      name: row.name || '',
      mode: row.mode || 'editorial',
      theme_preset: row.theme_preset || 'default',
      eyebrow: row.eyebrow || '',
      headline: row.headline || '',
      subtitle: row.subtitle || '',
      badge_text: row.badge_text || '',
      announcement_bar: row.announcement_bar || '',
      cta_label: row.cta_label || '',
      secondary_cta_label: row.secondary_cta_label || '',
      action_type: row.action_type || 'catalog',
      action_value: row.action_value || '',
      desktop_image_url: row.desktop_image_url || '',
      mobile_image_url: row.mobile_image_url || '',
      image_alt: row.image_alt || '',
      starts_on: row.starts_on || '',
      ends_on: row.ends_on || '',
      sort_order: String(row.sort_order ?? 0),
      active: Boolean(row.active),
    });
    setPreviewMode('desktop');
    setModalError('');
    setModalOpen(true);
  }

  function openDuplicate(row: SiteBannerRow) {
    openEdit({
      ...row,
      id: '',
      name: `${row.name} (Cópia)`,
      active: false,
      sort_order: banners.length + 1,
    });
  }

  async function handleCopySql() {
    try {
      await navigator.clipboard.writeText(SITE_BANNERS_SETUP_SQL);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2500);
    } catch {
      setErrorMsg('Não foi possível copiar automaticamente. Selecione o bloco SQL manualmente.');
    }
  }

  async function handleImageUpload(
    target: 'desktop' | 'mobile',
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingTarget(target);
    setModalError('');

    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const safeName = slugifySiteProduct(form.name || 'campanha');
      const path = `site-banners/${safeName}-${target}-${Date.now()}.${ext}`;

      let publicUrl = '';
      const primary = await supabase.storage
        .from('used-items-photos')
        .upload(path, file, { upsert: true });

      if (!primary.error && primary.data) {
        publicUrl = supabase.storage
          .from('used-items-photos')
          .getPublicUrl(primary.data.path).data.publicUrl;
      } else {
        const fallback = await supabase.storage
          .from('product-photos')
          .upload(path, file, { upsert: true });
        if (fallback.error || !fallback.data) {
          throw new Error(fallback.error?.message || primary.error?.message || 'Falha no upload');
        }
        publicUrl = supabase.storage
          .from('product-photos')
          .getPublicUrl(fallback.data.path).data.publicUrl;
      }

      setForm(prev =>
        target === 'desktop'
          ? { ...prev, desktop_image_url: publicUrl }
          : { ...prev, mobile_image_url: publicUrl }
      );
    } catch (err) {
      setModalError(
        `Erro ao enviar imagem: ${err instanceof Error ? err.message : 'erro inesperado'}`
      );
    } finally {
      setUploadingTarget(null);
      if (target === 'desktop' && desktopFileRef.current) desktopFileRef.current.value = '';
      if (target === 'mobile' && mobileFileRef.current) mobileFileRef.current.value = '';
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const validationErr = validateBannerDraft(form);
    if (validationErr) {
      setModalError(validationErr);
      return;
    }

    setSaving(true);
    setModalError('');

    const payload = {
      name: form.name.trim(),
      mode: form.mode,
      theme_preset: form.theme_preset,
      eyebrow: form.eyebrow.trim(),
      headline: form.headline.trim(),
      subtitle: form.subtitle.trim(),
      badge_text: form.badge_text.trim(),
      announcement_bar: form.announcement_bar.trim(),
      cta_label: form.cta_label.trim(),
      secondary_cta_label: form.secondary_cta_label.trim(),
      action_type: form.action_type,
      action_value: form.action_value.trim(),
      desktop_image_url: form.desktop_image_url.trim(),
      mobile_image_url: form.mobile_image_url.trim(),
      image_alt: form.image_alt.trim() || form.headline.trim() || form.name.trim(),
      starts_on: form.starts_on || null,
      ends_on: form.ends_on || null,
      sort_order: Math.max(0, parseInt(form.sort_order, 10) || 0),
      active: form.active,
      updated_at: new Date().toISOString(),
    };

    const res = form.id
      ? await supabase.from('site_banners').update(payload).eq('id', form.id)
      : await supabase.from('site_banners').insert(payload);

    setSaving(false);
    if (res.error) {
      setModalError(`Erro ao salvar campanha: ${res.error.message}`);
      return;
    }

    setModalOpen(false);
    await loadBanners();
  }

  async function handleToggleActive(row: SiteBannerRow) {
    setErrorMsg('');
    const next = !row.active;
    const { error } = await supabase
      .from('site_banners')
      .update({ active: next, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (error) {
      setErrorMsg(`Erro ao alterar status da campanha: ${error.message}`);
      return;
    }
    const nextRows = banners.map(b => (b.id === row.id ? { ...b, active: next } : b));
    setBanners(nextRows);
    onLiveCountChange?.(
      nextRows.filter(b => getBannerScheduleStatus(b, getLocalTodayIso()) === 'live').length
    );
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setErrorMsg('');
    const { error } = await supabase.from('site_banners').delete().eq('id', deleteTarget.id);
    setDeleting(false);
    if (error) {
      setErrorMsg(`Erro ao excluir campanha: ${error.message}`);
      setDeleteTarget(null);
      return;
    }
    const nextRows = banners.filter(b => b.id !== deleteTarget.id);
    setBanners(nextRows);
    onLiveCountChange?.(
      nextRows.filter(b => getBannerScheduleStatus(b, getLocalTodayIso()) === 'live').length
    );
    setDeleteTarget(null);
  }

  const previewTheme = getBannerThemePresetMeta(form.theme_preset);
  const liveCount = useMemo(
    () => banners.filter(b => getBannerScheduleStatus(b, todayIso) === 'live').length,
    [banners, todayIso]
  );

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
              Ativar tabela de Banners / Hero no Supabase (1 clique)
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              A tabela <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">public.site_banners</code>{' '}
              ainda não foi criada no Supabase. Copie o SQL abaixo, execute no{' '}
              <strong>SQL Editor</strong> do Supabase e clique em <strong>Recarregar</strong>.
              Enquanto isso, o site continua exibindo o Hero institucional padrão sem erro.
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
            onClick={loadBanners}
            className="flex items-center gap-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <RefreshCw size={15} />
            Já executei — Recarregar
          </button>
        </div>

        <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 text-xs overflow-x-auto max-h-80 leading-relaxed">
          {SITE_BANNERS_SETUP_SQL}
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

      {/* Quick Seasonal Templates Strip */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Sparkles size={16} className="text-amber-500" />
              Criar campanha ou trocar arte do topo do site
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {liveCount === 0
                ? 'Nenhuma campanha ativa agora — o site está exibindo o Hero institucional padrão.'
                : liveCount === 1
                ? '1 campanha ativa no ar agora substituindo o topo padrão.'
                : `${liveCount} campanhas ativas no ar em carrossel automático (ordenadas por prioridade).`}
            </p>
          </div>
          <button
            onClick={() => openNewWithTemplate()}
            className="inline-flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3.5 py-2 rounded-lg text-sm font-medium transition-colors shrink-0"
          >
            <Plus size={16} />
            Nova Campanha
          </button>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {BANNER_QUICK_TEMPLATES.map(tpl => (
            <button
              key={tpl.key}
              type="button"
              onClick={() => openNewWithTemplate(tpl.draft)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-amber-50 hover:border-amber-300 text-slate-700 hover:text-amber-900 text-xs font-semibold transition-colors"
            >
              {tpl.label}
            </button>
          ))}
        </div>
      </div>

      {/* Campaigns List */}
      {banners.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-2">
          <Layers size={34} className="mx-auto text-slate-300" />
          <p className="text-slate-800 font-semibold">Nenhuma campanha cadastrada ainda</p>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Use um dos modelos prontos acima (<strong>Black Friday</strong>, <strong>Natal</strong>,{' '}
            <strong>Promoção</strong> ou <strong>Arte Pronta Canva</strong>) para personalizar o
            Hero do site. Quando nenhuma campanha estiver ativa, o site mostra automaticamente o
            Hero institucional padrão.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {banners.map(row => {
            const schedStatus = getBannerScheduleStatus(row, todayIso);
            const statusStyle = STATUS_STYLE[schedStatus];
            const themeMeta = getBannerThemePresetMeta(row.theme_preset);
            return (
              <div
                key={row.id}
                className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col justify-between"
              >
                {/* Compact Visual Thumbnail */}
                <div
                  className="relative p-4 text-white min-h-[126px] flex items-center justify-between gap-4"
                  style={{ backgroundColor: themeMeta.sectionBg }}
                >
                  {row.mode === 'artwork' && row.desktop_image_url ? (
                    <img
                      src={resolveSiteMediaUrl(row.desktop_image_url)}
                      alt={row.image_alt || row.name}
                      className="w-full h-32 object-cover rounded-lg border border-white/10"
                    />
                  ) : (
                    <>
                      <div className="space-y-1.5 min-w-0 flex-1">
                        {row.badge_text && (
                          <span
                            className="inline-block font-mono text-[10px] px-2 py-0.5 rounded"
                            style={{
                              backgroundColor: themeMeta.badgeBg,
                              color: themeMeta.badgeText,
                            }}
                          >
                            {row.badge_text}
                          </span>
                        )}
                        <p className="font-semibold text-base leading-snug line-clamp-2">
                          {row.headline || row.name}
                        </p>
                        {row.subtitle && (
                          <p className="text-xs text-slate-300 line-clamp-2">{row.subtitle}</p>
                        )}
                      </div>
                      {row.desktop_image_url && (
                        <img
                          src={resolveSiteMediaUrl(row.desktop_image_url)}
                          alt={row.image_alt || row.name}
                          className="w-24 h-20 object-cover rounded-lg border border-white/15 shrink-0"
                        />
                      )}
                    </>
                  )}
                </div>

                {/* Metadata & Controls */}
                <div className="p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 text-sm truncate">{row.name}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusStyle.cls}`}
                        >
                          {statusStyle.label}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                          {row.mode === 'artwork' ? 'Arte Pronta' : 'Editorial'}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                          Ordem #{row.sort_order}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleActive(row)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        row.active
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {row.active ? <Eye size={14} /> : <EyeOff size={14} />}
                      {row.active ? 'Ativa' : 'Pausada'}
                    </button>
                  </div>

                  <div className="text-xs text-slate-500 space-y-1 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <Calendar size={13} className="text-slate-400 shrink-0" />
                      <span>
                        Vigência:{' '}
                        <strong>
                          {row.starts_on || row.ends_on
                            ? `${formatBannerDateBr(row.starts_on)} até ${formatBannerDateBr(row.ends_on)}`
                            : 'Contínua (enquanto estiver ativa)'}
                        </strong>
                      </span>
                    </div>
                    <p className="truncate">
                      Ação ao clicar: <strong>{BANNER_ACTION_LABELS[row.action_type]}</strong>
                      {row.action_value ? ` (${row.action_value})` : ''}
                    </p>
                    {row.announcement_bar && (
                      <p className="truncate text-amber-800">
                        Faixa topo: &ldquo;{row.announcement_bar}&rdquo;
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="inline-flex items-center gap-1 bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg text-xs font-medium"
                      >
                        <Edit2 size={13} />
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => openDuplicate(row)}
                        className="inline-flex items-center gap-1 border border-slate-200 hover:bg-slate-50 text-slate-700 px-2.5 py-1.5 rounded-lg text-xs font-medium"
                        title="Clonar campanha"
                      >
                        <Files size={13} />
                        Duplicar
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(row)}
                      className="inline-flex items-center gap-1 text-slate-400 hover:text-red-600 px-2 py-1.5 rounded-lg text-xs"
                    >
                      <Trash2 size={14} />
                      Excluir
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Campaign Modal with Live Preview */}
      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4"
          onClick={() => !saving && setModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-4xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <h2 className="font-bold text-slate-900">
                  {form.id ? 'Editar Campanha / Banner do Hero' : 'Nova Campanha / Banner do Hero'}
                </h2>
                <p className="text-xs text-slate-500">
                  As alterações refletem em tempo real no topo de refrimaqrs.com.br
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <form
              id="site-banner-form"
              onSubmit={handleSave}
              className="flex-1 overflow-y-auto px-6 py-5 space-y-5"
            >
              {modalError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3.5 py-2.5 flex items-center gap-2">
                  <AlertTriangle size={16} className="shrink-0" />
                  {modalError}
                </div>
              )}

              {/* Live Preview Box */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Pré-visualização ao vivo
                  </span>
                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setPreviewMode('desktop')}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium ${
                        previewMode === 'desktop'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-500'
                      }`}
                    >
                      <Monitor size={13} />
                      Desktop
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewMode('mobile')}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium ${
                        previewMode === 'mobile'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-500'
                      }`}
                    >
                      <Smartphone size={13} />
                      Mobile
                    </button>
                  </div>
                </div>

                <div
                  className={`mx-auto rounded-xl overflow-hidden border border-slate-200 transition-all ${
                    previewMode === 'mobile' ? 'max-w-[320px]' : 'w-full'
                  }`}
                >
                  {form.announcement_bar.trim() && (
                    <div
                      className="px-3 py-1.5 text-center text-[11px] font-medium text-white"
                      style={{ backgroundColor: previewTheme.accentBg }}
                    >
                      {form.announcement_bar}
                    </div>
                  )}

                  {form.mode === 'artwork' ? (
                    <div
                      className="relative flex items-center justify-center overflow-hidden"
                      style={{
                        backgroundColor: previewTheme.sectionBg,
                        aspectRatio: previewMode === 'mobile' ? '15 / 16' : '1440 / 520',
                      }}
                    >
                      {(previewMode === 'mobile' && form.mobile_image_url) ||
                      form.desktop_image_url ? (
                        <img
                          src={resolveSiteMediaUrl(
                            previewMode === 'mobile' && form.mobile_image_url
                              ? form.mobile_image_url
                              : form.desktop_image_url
                          )}
                          alt="Preview arte"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-center text-slate-400 p-6 space-y-1">
                          <ImageIcon size={28} className="mx-auto opacity-60" />
                          <p className="text-xs">
                            Envie a arte {previewMode === 'mobile' ? 'Mobile (750×820)' : 'Desktop (1440×520)'} abaixo
                          </p>
                        </div>
                      )}
                      {form.cta_label.trim() && (
                        <span
                          className="absolute bottom-3 right-3 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white inline-flex items-center gap-1 shadow-md"
                          style={{ backgroundColor: previewTheme.accentBg }}
                        >
                          {form.cta_label}
                          <ArrowRight size={12} />
                        </span>
                      )}
                    </div>
                  ) : (
                    <div
                      className={`p-5 text-white grid gap-4 items-center ${
                        previewMode === 'mobile' ? 'grid-cols-1' : 'grid-cols-12'
                      }`}
                      style={{ backgroundColor: previewTheme.sectionBg }}
                    >
                      <div className={previewMode === 'mobile' ? 'space-y-2.5' : 'col-span-7 space-y-2.5'}>
                        {form.badge_text.trim() && (
                          <span
                            className="inline-block font-mono text-[10px] px-2 py-0.5 rounded"
                            style={{
                              backgroundColor: previewTheme.badgeBg,
                              color: previewTheme.badgeText,
                            }}
                          >
                            {form.badge_text}
                          </span>
                        )}
                        {form.eyebrow.trim() && (
                          <p className="font-mono text-[10px] text-slate-400">{form.eyebrow}</p>
                        )}
                        <p className="font-semibold text-lg sm:text-xl leading-tight">
                          {form.headline.trim() || 'Digite o título principal da campanha'}
                        </p>
                        {form.subtitle.trim() && (
                          <p className="text-xs text-slate-300 leading-relaxed line-clamp-3">
                            {form.subtitle}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2 pt-1">
                          <span
                            className="px-3 py-1.5 rounded-lg text-xs font-medium text-white inline-flex items-center gap-1"
                            style={{ backgroundColor: previewTheme.accentBg }}
                          >
                            {form.cta_label.trim() || 'Explorar catálogo'}
                            <ArrowRight size={12} />
                          </span>
                          {form.secondary_cta_label.trim() && (
                            <span className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-white border border-white/15">
                              {form.secondary_cta_label}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className={previewMode === 'mobile' ? '' : 'col-span-5'}>
                        <div className="bg-slate-900/90 border border-white/10 rounded-xl p-2 aspect-[4/3] flex items-center justify-center overflow-hidden">
                          {form.desktop_image_url ? (
                            <img
                              src={resolveSiteMediaUrl(form.desktop_image_url)}
                              alt="Preview lateral"
                              className="w-full h-full object-cover rounded-lg"
                            />
                          ) : (
                            <p className="text-[11px] text-slate-400 text-center px-3">
                              Sem foto customizada: exibe automaticamente o palco dos 3 produtos em destaque
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Mode + Campaign Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Formato da Campanha *
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { id: 'editorial', label: 'Editorial Editável', hint: 'Texto + tema + foto/produtos' },
                        { id: 'artwork', label: 'Arte Pronta (Canva)', hint: 'Banner gráfico completo' },
                      ] as { id: SiteBannerMode; label: string; hint: string }[]
                    ).map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setForm(prev => ({ ...prev, mode: m.id }))}
                        className={`p-2.5 rounded-xl border text-left transition-colors ${
                          form.mode === m.id
                            ? 'border-amber-500 bg-amber-50/70 text-slate-900'
                            : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                        }`}
                      >
                        <p className="text-xs font-bold">{m.label}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">{m.hint}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Nome Interno da Campanha *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Ex.: Black Friday 2026 ou Natal Memo"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <div className="flex items-center gap-4 mt-2">
                    <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.active}
                        onChange={e => setForm(prev => ({ ...prev, active: e.target.checked }))}
                        className="rounded border-slate-300 text-amber-500 focus:ring-amber-400"
                      />
                      Campanha ativa (publicada)
                    </label>
                    <div className="flex items-center gap-1.5 text-xs text-slate-600">
                      <span>Ordem:</span>
                      <input
                        type="number"
                        min={0}
                        value={form.sort_order}
                        onChange={e => setForm(prev => ({ ...prev, sort_order: e.target.value }))}
                        className="w-16 px-2 py-1 border border-slate-200 rounded text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Theme Preset Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Tema de Cores (contraste garantido)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {BANNER_THEME_PRESETS.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() =>
                        setForm(prev => ({ ...prev, theme_preset: t.id as SiteBannerThemePreset }))
                      }
                      className={`p-2 rounded-xl border text-left transition-colors ${
                        form.theme_preset === t.id
                          ? 'border-amber-500 ring-2 ring-amber-300/60 bg-amber-50/40'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span
                          className="w-4 h-4 rounded-full border border-black/15"
                          style={{ backgroundColor: t.sectionBg }}
                        />
                        <span
                          className="w-4 h-4 rounded-full border border-black/15"
                          style={{ backgroundColor: t.accentBg }}
                        />
                      </div>
                      <p className="text-xs font-semibold text-slate-800 truncate">{t.label}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Editorial Copy Fields */}
              {form.mode === 'editorial' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 border border-slate-200/80 rounded-xl p-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Selo / Etiqueta de Destaque
                    </label>
                    <input
                      type="text"
                      value={form.badge_text}
                      onChange={e => setForm(prev => ({ ...prev, badge_text: e.target.value }))}
                      placeholder="Ex.: BLACK FRIDAY · ATÉ 20% OFF"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Linha auxiliar acima do título
                    </label>
                    <input
                      type="text"
                      value={form.eyebrow}
                      onChange={e => setForm(prev => ({ ...prev, eyebrow: e.target.value }))}
                      placeholder="Ex.: Representante exclusiva Memo no RS"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Título Principal do Hero *
                    </label>
                    <input
                      type="text"
                      value={form.headline}
                      onChange={e => setForm(prev => ({ ...prev, headline: e.target.value }))}
                      placeholder="Ex.: Black Friday em chopeiras elétricas e torres Memo"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Subtítulo / Descrição
                    </label>
                    <textarea
                      rows={2}
                      value={form.subtitle}
                      onChange={e => setForm(prev => ({ ...prev, subtitle: e.target.value }))}
                      placeholder="Ex.: Condições exclusivas à vista e parcelamento em até 10x sem juros..."
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm resize-none"
                    />
                  </div>
                </div>
              )}

              {/* Image Uploads (Desktop + Optional Mobile) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 border border-slate-200/80 rounded-xl p-4">
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    {form.mode === 'artwork'
                      ? 'Arte Principal Desktop * (recomendado 1440×520 px)'
                      : 'Imagem/Arte Lateral Opcional (recomendado 960×720 px)'}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={form.desktop_image_url}
                      onChange={e =>
                        setForm(prev => ({ ...prev, desktop_image_url: e.target.value }))
                      }
                      placeholder="https://... ou clique em Enviar"
                      className="flex-1 min-w-0 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                    <input
                      ref={desktopFileRef}
                      type="file"
                      accept="image/*"
                      onChange={e => handleImageUpload('desktop', e)}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => desktopFileRef.current?.click()}
                      disabled={uploadingTarget !== null}
                      className="inline-flex items-center gap-1 bg-slate-900 hover:bg-slate-800 text-white px-3 py-2 rounded-lg text-xs font-medium shrink-0 disabled:opacity-50"
                    >
                      {uploadingTarget === 'desktop' ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Upload size={14} />
                      )}
                      Enviar
                    </button>
                  </div>
                  {form.mode === 'editorial' && (
                    <p className="text-[11px] text-slate-500">
                      Deixe em branco para exibir automaticamente o palco interativo dos 3 produtos em destaque.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Arte Mobile Opcional (recomendado 750×820 px)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={form.mobile_image_url}
                      onChange={e =>
                        setForm(prev => ({ ...prev, mobile_image_url: e.target.value }))
                      }
                      placeholder="Opcional: se vazio, usa a imagem Desktop"
                      className="flex-1 min-w-0 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                    <input
                      ref={mobileFileRef}
                      type="file"
                      accept="image/*"
                      onChange={e => handleImageUpload('mobile', e)}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => mobileFileRef.current?.click()}
                      disabled={uploadingTarget !== null}
                      className="inline-flex items-center gap-1 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 px-3 py-2 rounded-lg text-xs font-medium shrink-0 disabled:opacity-50"
                    >
                      {uploadingTarget === 'mobile' ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Upload size={14} />
                      )}
                      Enviar
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Evita texto cortado no celular quando usar arte gráfica do Canva.
                  </p>
                </div>
              </div>

              {/* CTA & Click Destination */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Texto do Botão Principal
                  </label>
                  <input
                    type="text"
                    value={form.cta_label}
                    onChange={e => setForm(prev => ({ ...prev, cta_label: e.target.value }))}
                    placeholder="Ex.: Ver ofertas (ou vazio no modo Arte Pronta)"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                {form.mode === 'editorial' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Botão Secundário (WhatsApp)
                    </label>
                    <input
                      type="text"
                      value={form.secondary_cta_label}
                      onChange={e =>
                        setForm(prev => ({ ...prev, secondary_cta_label: e.target.value }))
                      }
                      placeholder="Ex.: Falar no WhatsApp (vazio oculta)"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    O que acontece ao clicar no banner/botão?
                  </label>
                  <select
                    value={form.action_type}
                    onChange={e =>
                      setForm(prev => ({
                        ...prev,
                        action_type: e.target.value as SiteBannerActionType,
                        action_value: '',
                      }))
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                  >
                    {(Object.keys(BANNER_ACTION_LABELS) as SiteBannerActionType[]).map(k => (
                      <option key={k} value={k}>
                        {BANNER_ACTION_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </div>

                {form.action_type === 'category' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Categoria de destino
                    </label>
                    <select
                      value={form.action_value}
                      onChange={e => setForm(prev => ({ ...prev, action_value: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                    >
                      <option value="">Selecione...</option>
                      {SITE_CATEGORIES.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {form.action_type === 'service_visit' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Atividade pré-selecionada
                    </label>
                    <select
                      value={form.action_value}
                      onChange={e => setForm(prev => ({ ...prev, action_value: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                    >
                      <option value="">Escolher na etapa 1</option>
                      <option value="corretivo">Chamado Corretivo</option>
                      <option value="sanitizacao">Chamado de Sanitização</option>
                      <option value="projeto_instalacao">Projeto e Instalação</option>
                    </select>
                  </div>
                )}

                {(form.action_type === 'product' ||
                  form.action_type === 'whatsapp' ||
                  form.action_type === 'url') && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      {form.action_type === 'product'
                        ? 'Slug do produto (copie na aba Catálogo)'
                        : form.action_type === 'whatsapp'
                        ? 'Mensagem pré-preenchida no WhatsApp'
                        : 'URL ou âncora (ex.: https://... ou #servicos)'}
                    </label>
                    <input
                      type="text"
                      value={form.action_value}
                      onChange={e => setForm(prev => ({ ...prev, action_value: e.target.value }))}
                      placeholder={
                        form.action_type === 'product'
                          ? 'ex.: chopeira-eletrica-small-50-litros-hora-2-torneiras-mundi'
                          : form.action_type === 'whatsapp'
                          ? 'Ex.: Olá, quero aproveitar a oferta de Black Friday!'
                          : 'https://...'
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    />
                  </div>
                )}
              </div>

              {/* Optional Schedule + Top Announcement Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Data de início (opcional)
                  </label>
                  <input
                    type="date"
                    value={form.starts_on}
                    onChange={e => setForm(prev => ({ ...prev, starts_on: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Data de término (opcional)
                  </label>
                  <input
                    type="date"
                    value={form.ends_on}
                    onChange={e => setForm(prev => ({ ...prev, ends_on: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Faixa fina de aviso no topo (opcional)
                  </label>
                  <input
                    type="text"
                    value={form.announcement_bar}
                    onChange={e =>
                      setForm(prev => ({ ...prev, announcement_bar: e.target.value }))
                    }
                    placeholder="Ex.: Black Friday até 30/11 · 10x sem juros"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
              </div>
            </form>

            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 shrink-0 bg-slate-50/70">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200/70 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="site-banner-form"
                disabled={saving || uploadingTarget !== null}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
              >
                {saving ? 'Salvando...' : form.id ? 'Salvar Campanha' : 'Publicar Campanha'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl text-center"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-900">Excluir Campanha</h3>
            <p className="text-sm text-slate-500">
              Excluir permanentemente <strong>{deleteTarget.name}</strong>? Se quiser reutilizá-la
              no próximo ano, clique em Pausar em vez de excluir.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {deleting ? 'Excluindo...' : 'Sim, excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
