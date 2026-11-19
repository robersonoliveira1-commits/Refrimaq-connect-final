import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Globe,
  Plus,
  Search,
  Edit2,
  Trash2,
  Star,
  Eye,
  EyeOff,
  Upload,
  Download,
  Loader2,
  Copy,
  Check,
  Database,
  AlertTriangle,
  X,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Sparkles,
  Image as ImageIcon,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import Header from './Header';
import {
  SITE_CATEGORIES,
  SITE_PRODUCTS_SETUP_SQL,
  SiteCategoryId,
  SiteProductRow,
  buildSiteCatalogCsv,
  filterSiteProducts,
  formatSitePrice,
  getSiteCategoryLabel,
  isMissingSiteProductsTableError,
  parseSitePriceInput,
  slugifySiteProduct,
  suggestSiteSpecs,
} from '../lib/siteCatalogEngine';
import { SITE_CATALOG_SEED } from '../data/siteCatalogSeed';
import { getLocalTodayFileStamp } from '../lib/customersEngine';

interface SiteCatalogPageProps {
  onMenuClick: () => void;
}

interface ProductFormState {
  id: string;
  title: string;
  slug: string;
  slugTouched: boolean;
  category_id: SiteCategoryId;
  brand: string;
  priceText: string;
  specs: string;
  description: string;
  image_url: string;
  featured: boolean;
  active: boolean;
  sort_order: string;
}

const BLANK_FORM: ProductFormState = {
  id: '',
  title: '',
  slug: '',
  slugTouched: false,
  category_id: 'chopeiras-eletricas',
  brand: 'Memo',
  priceText: '',
  specs: '',
  description: '',
  image_url: '',
  featured: false,
  active: true,
  sort_order: '0',
};

const ITEMS_PER_PAGE = 24;

export default function SiteCatalogPage({ onMenuClick }: SiteCatalogPageProps) {
  const [items, setItems] = useState<SiteProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingTable, setMissingTable] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedSql, setCopiedSql] = useState(false);

  // Seed import state
  const [seeding, setSeeding] = useState(false);
  const [seedProgress, setSeedProgress] = useState('');

  // Filters & pagination
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<SiteCategoryId | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'hidden' | 'featured' | 'priced'>('all');
  const [page, setPage] = useState(1);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<ProductFormState>(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [modalError, setModalError] = useState('');
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<SiteProductRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadCatalog();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, categoryFilter, statusFilter]);

  async function loadCatalog() {
    setLoading(true);
    setErrorMsg('');
    setMissingTable(false);

    const all: SiteProductRow[] = [];
    const PAGE_SIZE = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('site_products')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('title', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        if (isMissingSiteProductsTableError(error)) {
          setMissingTable(true);
        } else {
          setErrorMsg(`Erro ao carregar catálogo do site: ${error.message}`);
        }
        setLoading(false);
        return;
      }

      if (data && data.length > 0) {
        all.push(
          ...(data as Array<Record<string, unknown>>).map(r => ({
            id: String(r.id),
            slug: String(r.slug ?? ''),
            title: String(r.title ?? ''),
            category_id: (r.category_id as SiteCategoryId) ?? 'acessorios',
            category_label: String(r.category_label ?? getSiteCategoryLabel(String(r.category_id ?? ''))),
            brand: String(r.brand ?? 'Memo'),
            price: r.price !== null && r.price !== undefined ? Number(r.price) : null,
            specs: String(r.specs ?? ''),
            description: String(r.description ?? ''),
            image_url: String(r.image_url ?? ''),
            featured: Boolean(r.featured),
            active: r.active !== false,
            sort_order: Number(r.sort_order ?? 0),
            created_at: r.created_at ? String(r.created_at) : undefined,
            updated_at: r.updated_at ? String(r.updated_at) : undefined,
          }))
        );
        from += PAGE_SIZE;
        if (data.length < PAGE_SIZE) hasMore = false;
      } else {
        hasMore = false;
      }
    }

    setItems(all);
    setLoading(false);
  }

  async function handleCopySql() {
    try {
      await navigator.clipboard.writeText(SITE_PRODUCTS_SETUP_SQL);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2500);
    } catch {
      setErrorMsg('Não foi possível copiar automaticamente. Selecione o SQL abaixo e copie manualmente.');
    }
  }

  async function handleSeedInitialCatalog() {
    setSeeding(true);
    setErrorMsg('');
    const BATCH = 50;
    try {
      for (let i = 0; i < SITE_CATALOG_SEED.length; i += BATCH) {
        const slice = SITE_CATALOG_SEED.slice(i, i + BATCH);
        setSeedProgress(`Importando ${Math.min(i + BATCH, SITE_CATALOG_SEED.length)} de ${SITE_CATALOG_SEED.length} produtos...`);
        const { error } = await supabase
          .from('site_products')
          .upsert(slice, { onConflict: 'slug' });
        if (error) {
          setErrorMsg(`Erro ao importar catálogo inicial: ${error.message}`);
          setSeeding(false);
          setSeedProgress('');
          return;
        }
      }
      setSeeding(false);
      setSeedProgress('');
      await loadCatalog();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Falha ao importar catálogo inicial: ${msg}`);
      setSeeding(false);
      setSeedProgress('');
    }
  }

  function openNewModal() {
    setForm({
      ...BLANK_FORM,
      sort_order: String(items.length + 1),
    });
    setModalError('');
    setModalOpen(true);
  }

  function openEditModal(item: SiteProductRow) {
    setForm({
      id: item.id,
      title: item.title,
      slug: item.slug,
      slugTouched: true,
      category_id: item.category_id,
      brand: item.brand,
      priceText: item.price !== null ? item.price.toFixed(2).replace('.', ',') : '',
      specs: item.specs,
      description: item.description,
      image_url: item.image_url,
      featured: item.featured,
      active: item.active,
      sort_order: String(item.sort_order ?? 0),
    });
    setModalError('');
    setModalOpen(true);
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    setModalError('');

    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const safeSlug = slugifySiteProduct(form.title || 'produto');
      const path = `site-catalog/${safeSlug}-${Date.now()}.${ext}`;

      let publicUrl = '';
      const primary = await supabase.storage
        .from('used-items-photos')
        .upload(path, file, { upsert: true });

      if (!primary.error && primary.data) {
        publicUrl = supabase.storage.from('used-items-photos').getPublicUrl(primary.data.path).data.publicUrl;
      } else {
        const fallback = await supabase.storage
          .from('product-photos')
          .upload(path, file, { upsert: true });
        if (fallback.error || !fallback.data) {
          throw new Error(fallback.error?.message || primary.error?.message || 'Erro no upload da foto.');
        }
        publicUrl = supabase.storage.from('product-photos').getPublicUrl(fallback.data.path).data.publicUrl;
      }

      setForm(prev => ({ ...prev, image_url: publicUrl }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setModalError(`Erro ao enviar imagem: ${msg}`);
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  }

  async function handleSaveModal(e: React.FormEvent) {
    e.preventDefault();
    const title = form.title.trim();
    if (!title) {
      setModalError('Informe o nome do produto.');
      return;
    }

    const finalSlug = slugifySiteProduct(form.slug.trim() || title);
    const parsedPrice = parseSitePriceInput(form.priceText);
    if (form.priceText.trim() && parsedPrice === null) {
      setModalError('Preço inválido. Use formato como 4490,00 ou deixe vazio para "Valor sob consulta".');
      return;
    }

    setSaving(true);
    setModalError('');

    const payload = {
      title,
      slug: finalSlug,
      category_id: form.category_id,
      category_label: getSiteCategoryLabel(form.category_id),
      brand: form.brand.trim() || 'Memo',
      price: parsedPrice,
      specs: form.specs.trim() || suggestSiteSpecs(title, form.description),
      description: form.description.trim(),
      image_url: form.image_url.trim(),
      featured: form.featured,
      active: form.active,
      sort_order: Math.max(0, parseInt(form.sort_order, 10) || 0),
      updated_at: new Date().toISOString(),
    };

    const res = form.id
      ? await supabase.from('site_products').update(payload).eq('id', form.id)
      : await supabase.from('site_products').insert(payload);

    setSaving(false);
    if (res.error) {
      setModalError(`Erro ao salvar item: ${res.error.message}`);
      return;
    }

    setModalOpen(false);
    loadCatalog();
  }

  async function handleToggleFeatured(item: SiteProductRow) {
    setErrorMsg('');
    const next = !item.featured;
    const { error } = await supabase
      .from('site_products')
      .update({ featured: next, updated_at: new Date().toISOString() })
      .eq('id', item.id);
    if (error) {
      setErrorMsg(`Erro ao atualizar destaque: ${error.message}`);
      return;
    }
    setItems(prev => prev.map(p => (p.id === item.id ? { ...p, featured: next } : p)));
  }

  async function handleToggleActive(item: SiteProductRow) {
    setErrorMsg('');
    const next = !item.active;
    const { error } = await supabase
      .from('site_products')
      .update({ active: next, updated_at: new Date().toISOString() })
      .eq('id', item.id);
    if (error) {
      setErrorMsg(`Erro ao atualizar visibilidade: ${error.message}`);
      return;
    }
    setItems(prev => prev.map(p => (p.id === item.id ? { ...p, active: next } : p)));
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setErrorMsg('');
    const { error } = await supabase.from('site_products').delete().eq('id', deleteTarget.id);
    setDeleting(false);
    if (error) {
      setErrorMsg(`Erro ao excluir item: ${error.message}`);
      setDeleteTarget(null);
      return;
    }
    setItems(prev => prev.filter(p => p.id !== deleteTarget.id));
    setDeleteTarget(null);
  }

  function handleExportCsv() {
    const csv = buildSiteCatalogCsv(filtered);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `refrimaq_catalogo_site_${getLocalTodayFileStamp()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const metrics = useMemo(() => {
    let active = 0;
    let hidden = 0;
    let featured = 0;
    let priced = 0;
    for (const item of items) {
      if (item.active) active++;
      else hidden++;
      if (item.featured) featured++;
      if (item.price !== null && item.price > 0) priced++;
    }
    return { total: items.length, active, hidden, featured, priced };
  }, [items]);

  const filtered = useMemo(
    () =>
      filterSiteProducts(items, {
        search,
        category: categoryFilter,
        status: statusFilter,
      }),
    [items, search, categoryFilter, statusFilter]
  );

  const hasFilters =
    search.trim().length > 0 || categoryFilter !== 'all' || statusFilter !== 'all';
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Catálogo do Site"
        subtitle="Gerencie os produtos exibidos no site público refrimaqrs.com.br em tempo real"
        onMenuClick={onMenuClick}
        actions={
          !missingTable && (
            <div className="flex items-center gap-2">
              {items.length > 0 && (
                <button
                  onClick={handleExportCsv}
                  className="flex items-center gap-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-2 rounded-lg text-sm transition-colors"
                >
                  <Download size={15} />
                  <span className="hidden sm:inline">Exportar CSV</span>
                </button>
              )}
              <button
                onClick={openNewModal}
                className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3.5 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <Plus size={16} />
                <span className="hidden sm:inline">Novo Produto</span>
              </button>
            </div>
          )
        }
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-6">
        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg('')} className="text-xs font-semibold hover:underline">
              Fechar
            </button>
          </div>
        )}

        {/* Guided setup when site_products table has not been created in Supabase yet */}
        {missingTable ? (
          <div className="bg-white border border-amber-200 rounded-2xl p-6 max-w-3xl mx-auto space-y-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                <Database size={20} className="text-amber-600" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-800">
                  Ativar tabela <code className="font-mono text-amber-700">site_products</code> no Supabase
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  Para editar o catálogo do novo site direto pelo Refrimaq Connect, execute o SQL abaixo uma única vez no <strong>SQL Editor</strong> do seu projeto Supabase e depois clique em <strong>Verificar novamente</strong>.
                </p>
              </div>
            </div>

            <div className="relative bg-slate-900 text-slate-100 rounded-xl p-4 text-xs font-mono overflow-x-auto max-h-64">
              <pre>{SITE_PRODUCTS_SETUP_SQL}</pre>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleCopySql}
                className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {copiedSql ? <Check size={15} /> : <Copy size={15} />}
                {copiedSql ? 'SQL Copiado!' : 'Copiar SQL'}
              </button>
              <button
                onClick={loadCatalog}
                className="flex items-center gap-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <RotateCcw size={15} />
                Verificar novamente
              </button>
            </div>
          </div>
        ) : loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-500">
            <Loader2 size={28} className="text-amber-500 animate-spin" />
            <p className="text-sm">Carregando catálogo do site...</p>
          </div>
        ) : (
          <>
            {/* One-click initial seed banner when table is empty */}
            {items.length === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="font-bold text-amber-900 flex items-center gap-2">
                    <Globe size={18} className="text-amber-600" />
                    Tabela pronta — importe os {SITE_CATALOG_SEED.length} produtos iniciais
                  </h2>
                  <p className="text-sm text-amber-800">
                    Carregue automaticamente todo o catálogo atual da Refrimaq (chopeiras, torres, pré-resfriadores, barris Kegsbrasil e peças) com 1 clique para começar a editar.
                  </p>
                  {seedProgress && <p className="text-xs font-semibold text-amber-700 pt-1">{seedProgress}</p>}
                </div>
                <button
                  onClick={handleSeedInitialCatalog}
                  disabled={seeding}
                  className="shrink-0 flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {seeding ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                  {seeding ? 'Importando...' : `Importar ${SITE_CATALOG_SEED.length} produtos`}
                </button>
              </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {[
                { key: 'all', label: 'Total no Catálogo', value: metrics.total, color: 'text-blue-600', bg: 'bg-blue-50' },
                { key: 'active', label: 'Publicados no Site', value: metrics.active, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { key: 'hidden', label: 'Ocultos', value: metrics.hidden, color: 'text-slate-600', bg: 'bg-slate-100' },
                { key: 'featured', label: 'Destaques na Home', value: metrics.featured, color: 'text-amber-600', bg: 'bg-amber-50' },
                { key: 'priced', label: 'Com Preço Definido', value: metrics.priced, color: 'text-indigo-600', bg: 'bg-indigo-50' },
              ].map(card => {
                const isSelected = statusFilter === card.key;
                return (
                  <button
                    key={card.key}
                    onClick={() =>
                      setStatusFilter(prev =>
                        prev === card.key && card.key !== 'all'
                          ? 'all'
                          : (card.key as typeof statusFilter)
                      )
                    }
                    className={`bg-white rounded-xl p-4 border text-left transition-all ${
                      isSelected
                        ? 'border-amber-500 ring-2 ring-amber-400/30 shadow-sm'
                        : 'border-slate-200 hover:border-amber-300'
                    }`}
                  >
                    <p className={`text-2xl font-bold tabular-nums ${card.color}`}>{card.value}</p>
                    <p className="text-xs text-slate-500 mt-1">{card.label}</p>
                  </button>
                );
              })}
            </div>

            {/* Filters + Product List */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[220px]">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar por nome, marca, especificação ou categoria..."
                    className="w-full pl-9 pr-8 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                <select
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value as SiteCategoryId | 'all')}
                  className="border border-slate-200 rounded-lg text-sm px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <option value="all">Todas as categorias</option>
                  {SITE_CATEGORIES.map(c => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>

                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
                  className="border border-slate-200 rounded-lg text-sm px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <option value="all">Todos os status</option>
                  <option value="active">Somente publicados</option>
                  <option value="hidden">Somente ocultos</option>
                  <option value="featured">Destaques na Home</option>
                  <option value="priced">Com preço definido</option>
                </select>

                {hasFilters && (
                  <button
                    onClick={() => {
                      setSearch('');
                      setCategoryFilter('all');
                      setStatusFilter('all');
                    }}
                    className="flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg hover:bg-amber-100"
                  >
                    <RotateCcw size={12} /> Limpar
                  </button>
                )}

                <span className="ml-auto text-xs text-slate-400 tabular-nums">
                  {filtered.length} item(ns)
                </span>
              </div>

              {paginated.length === 0 ? (
                <div className="p-12 text-center text-slate-500">
                  <Globe size={36} className="mx-auto text-slate-300 mb-3" />
                  <p className="font-medium">Nenhum produto encontrado</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {hasFilters ? 'Ajuste os filtros acima.' : 'Adicione um produto ou importe o catálogo inicial.'}
                  </p>
                </div>
              ) : (
                <>
                  <div className="divide-y divide-slate-100">
                    {paginated.map(item => (
                      <div
                        key={item.id}
                        className={`px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors ${
                          !item.active ? 'opacity-60 bg-slate-50/50' : ''
                        }`}
                      >
                        {/* Thumbnail */}
                        <div className="w-12 h-12 rounded-lg bg-white border border-slate-200 p-1 flex items-center justify-center shrink-0 overflow-hidden">
                          {item.image_url ? (
                            <img
                              src={item.image_url}
                              alt={item.title}
                              className="max-w-full max-h-full object-contain"
                              onError={e => {
                                (e.currentTarget as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <ImageIcon size={18} className="text-slate-300" />
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-slate-800 text-sm truncate">{item.title}</p>
                            {item.specs && (
                              <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                                {item.specs}
                              </span>
                            )}
                            {!item.active && (
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
                                Oculto
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500 flex-wrap">
                            <span>{item.category_label}</span>
                            <span>·</span>
                            <span>{item.brand}</span>
                            <span>·</span>
                            <span className={`font-semibold tabular-nums ${item.price ? 'text-emerald-700' : 'text-slate-500'}`}>
                              {formatSitePrice(item.price)}
                            </span>
                          </div>
                        </div>

                        {/* Quick Controls */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleToggleFeatured(item)}
                            title={item.featured ? 'Remover dos destaques da Home' : 'Marcar como destaque na Home'}
                            className={`p-2 rounded-lg transition-colors ${
                              item.featured
                                ? 'text-amber-500 bg-amber-50 hover:bg-amber-100'
                                : 'text-slate-300 hover:text-amber-500 hover:bg-slate-100'
                            }`}
                          >
                            <Star size={16} fill={item.featured ? 'currentColor' : 'none'} />
                          </button>

                          <button
                            onClick={() => handleToggleActive(item)}
                            title={item.active ? 'Ocultar do site público' : 'Publicar no site público'}
                            className={`p-2 rounded-lg transition-colors ${
                              item.active
                                ? 'text-emerald-600 hover:bg-emerald-50'
                                : 'text-slate-400 hover:text-emerald-600 hover:bg-slate-100'
                            }`}
                          >
                            {item.active ? <Eye size={16} /> : <EyeOff size={16} />}
                          </button>

                          <button
                            onClick={() => openEditModal(item)}
                            title="Editar produto"
                            className="p-2 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                          >
                            <Edit2 size={15} />
                          </button>

                          <button
                            onClick={() => setDeleteTarget(item)}
                            title="Excluir produto"
                            className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {filtered.length > ITEMS_PER_PAGE && (
                    <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-600">
                      <span className="tabular-nums">
                        Exibindo {(safePage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(safePage * ITEMS_PER_PAGE, filtered.length)} de {filtered.length}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setPage(p => Math.max(1, p - 1))}
                          disabled={safePage <= 1}
                          className="p-1.5 border border-slate-200 bg-white rounded-lg disabled:opacity-40"
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <span className="font-semibold tabular-nums">{safePage} / {totalPages}</span>
                        <button
                          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                          disabled={safePage >= totalPages}
                          className="p-1.5 border border-slate-200 bg-white rounded-lg disabled:opacity-40"
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold text-slate-800">
                {form.id ? 'Editar Produto do Site' : 'Novo Produto do Site'}
              </h2>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <form id="site-product-form" onSubmit={handleSaveModal} className="flex-1 overflow-auto px-6 py-5 space-y-4">
              {modalError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-center gap-2">
                  <AlertTriangle size={15} className="shrink-0" />
                  {modalError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Nome do Produto *</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={e => {
                      const val = e.target.value;
                      setForm(prev => ({
                        ...prev,
                        title: val,
                        slug: prev.slugTouched ? prev.slug : slugifySiteProduct(val),
                      }));
                    }}
                    placeholder="Ex: Chopeira Elétrica Small 50L/h - 2 Torneiras"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Categoria *</label>
                  <select
                    value={form.category_id}
                    onChange={e => setForm(prev => ({ ...prev, category_id: e.target.value as SiteCategoryId }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    {SITE_CATEGORIES.map(c => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Marca / Linha</label>
                  <input
                    type="text"
                    value={form.brand}
                    onChange={e => setForm(prev => ({ ...prev, brand: e.target.value }))}
                    placeholder="Memo, Kegsbrasil, Celli..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Preço (R$) <span className="font-normal text-slate-400">— vazio = Sob consulta</span>
                  </label>
                  <input
                    type="text"
                    value={form.priceText}
                    onChange={e => setForm(prev => ({ ...prev, priceText: e.target.value }))}
                    placeholder="Ex: 4.490,00"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-600">Etiqueta Técnica</label>
                    <button
                      type="button"
                      onClick={() =>
                        setForm(prev => ({ ...prev, specs: suggestSiteSpecs(prev.title, prev.description) }))
                      }
                      className="text-[11px] font-semibold text-amber-600 hover:text-amber-700 inline-flex items-center gap-1"
                    >
                      <Sparkles size={11} /> Sugerir
                    </button>
                  </div>
                  <input
                    type="text"
                    value={form.specs}
                    onChange={e => setForm(prev => ({ ...prev, specs: e.target.value }))}
                    placeholder="Ex: 50 L/h · 2 vias"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Slug (identificador único)</label>
                  <input
                    type="text"
                    value={form.slug}
                    onChange={e => setForm(prev => ({ ...prev, slug: e.target.value, slugTouched: true }))}
                    placeholder="chopeira-eletrica-small-50l"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Ordem de exibição</label>
                  <input
                    type="number"
                    min={0}
                    value={form.sort_order}
                    onChange={e => setForm(prev => ({ ...prev, sort_order: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Descrição técnica</label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Detalhes de vazão, aplicação, acabamento em inox, voltagem..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                />
              </div>

              {/* Photo upload + URL */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-600 uppercase">Foto do Produto</span>
                  <div>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={uploadingPhoto}
                      onClick={() => photoInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-700 disabled:opacity-50"
                    >
                      {uploadingPhoto ? <Loader2 size={13} className="animate-spin text-amber-500" /> : <Upload size={13} />}
                      {uploadingPhoto ? 'Enviando...' : 'Subir nova foto'}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-lg bg-white border border-slate-200 p-1.5 flex items-center justify-center shrink-0">
                    {form.image_url ? (
                      <img src={form.image_url} alt="Prévia" className="max-w-full max-h-full object-contain" />
                    ) : (
                      <ImageIcon size={20} className="text-slate-300" />
                    )}
                  </div>
                  <div className="flex-1">
                    <input
                      type="text"
                      value={form.image_url}
                      onChange={e => setForm(prev => ({ ...prev, image_url: e.target.value }))}
                      placeholder="https://... ou /media/products/..."
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Suba uma imagem acima ou informe a URL pública da foto.
                    </p>
                  </div>
                </div>
              </div>

              {/* Toggles */}
              <div className="flex flex-wrap gap-6 pt-1">
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={e => setForm(prev => ({ ...prev, active: e.target.checked }))}
                    className="rounded border-slate-300 text-amber-500 focus:ring-amber-400"
                  />
                  Publicado no site público
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.featured}
                    onChange={e => setForm(prev => ({ ...prev, featured: e.target.checked }))}
                    className="rounded border-slate-300 text-amber-500 focus:ring-amber-400"
                  />
                  Exibir nos Destaques da Home
                </label>
              </div>
            </form>

            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="site-product-form"
                disabled={saving || uploadingPhoto}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
              >
                {saving ? 'Salvando...' : form.id ? 'Salvar Alterações' : 'Publicar Produto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm space-y-4 text-center">
            <h3 className="text-lg font-bold text-slate-800">Excluir Produto do Site</h3>
            <p className="text-sm text-slate-500">
              Excluir permanentemente <strong>{deleteTarget.title}</strong> do catálogo do site? Se preferir apenas tirar do ar temporariamente, use o ícone de olho para ocultar.
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
                className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
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
