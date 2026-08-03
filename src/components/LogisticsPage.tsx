import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  MapPin, Search, Check, Plus, X, GripVertical,
  Navigation, Phone, Loader2, Map, ExternalLink,
  CheckSquare, Square, Filter, LogOut, MessageCircle, Send,
} from 'lucide-react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { supabase } from '../lib/supabase';
import { Customer } from '../lib/types';
import { useAuth } from '../lib/auth';
import Header from './Header';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
delete (L.Icon.Default.prototype as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });

const VISITED_ICON = new L.DivIcon({
  className: '',
  html: `<div style="width:28px;height:28px;border-radius:50%;background:#10b981;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.3);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -28],
});

const RS_CENTER: [number, number] = [-30.0331, -51.23];

const formatCityName = (city: string) => {
  return city
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const DAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];
const DAY_FULL = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira'];

interface RouteStop {
  id: string;
  customer: Customer;
  stop_order: number;
  visited: boolean;
  visited_at: string | null;
}

interface RouteData {
  id: string;
  name: string;
  day_index: number;
  stops: RouteStop[];
}

// ── Map auto-fit ────────────────────────────────────────────────────────
function FitBounds({ stops }: { stops: RouteStop[] }) {
  const map = useMap();
  useEffect(() => {
    const withCoords = stops.filter(s => s.customer.latitude != null && s.customer.longitude != null);
    if (withCoords.length === 0) { map.setView(RS_CENTER, 11); return; }
    const bounds = L.latLngBounds(withCoords.map(s => [s.customer.latitude!, s.customer.longitude!] as [number, number]));
    map.fitBounds(bounds, { padding: [50, 50] });
  }, [stops, map]);
  return null;
}

// ── Sortable card ───────────────────────────────────────────────────────
function SortableCard({ stop, index, onVisit, onRemove }: {
  stop: RouteStop; index: number; onVisit: () => void; onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stop.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };
  const c = stop.customer;
  return (
    <div ref={setNodeRef} style={style}
      className={`flex items-center gap-2 p-3 rounded-xl border transition-colors ${
        stop.visited ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200 hover:border-amber-300'
      } ${isDragging ? 'shadow-lg' : ''}`}>
      <button {...attributes} {...listeners} className="touch-none text-slate-300 hover:text-slate-500 cursor-grab">
        <GripVertical size={16} />
      </button>
      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
        stop.visited ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'
      }`}>{index + 1}</span>
      <div className="flex-1 min-w-0">
        <p className={`font-medium text-sm truncate ${stop.visited ? 'text-emerald-700 line-through' : 'text-slate-800'}`}>{c.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {c.phone && <span className="flex items-center gap-1 text-xs text-slate-500"><Phone size={10} /> {c.phone}</span>}
          {c.address && <span className="text-xs text-slate-400 truncate">{c.address}</span>}
        </div>
      </div>
      {!stop.visited && (
        <button onClick={onVisit}
          className="flex items-center gap-1 px-2 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-lg text-xs font-medium transition-colors">
          <Check size={12} /> Visitado
        </button>
      )}
      {stop.visited && (
        <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-emerald-600"><Check size={12} /> Concluído</span>
      )}
      <button onClick={onRemove} className="text-slate-300 hover:text-red-400 transition-colors" title="Remover da rota"><X size={14} /></button>
    </div>
  );
}

// ── Google Maps URL builder ─────────────────────────────────────────────
function buildGoogleMapsUrl(stops: RouteStop[]): string {
  const withCoords = stops.filter(s => s.customer.latitude != null && s.customer.longitude != null);
  if (withCoords.length < 2) return '';
  const origin = `${withCoords[0].customer.latitude},${withCoords[0].customer.longitude}`;
  const destination = `${withCoords[withCoords.length - 1].customer.latitude},${withCoords[withCoords.length - 1].customer.longitude}`;
  const waypoints = withCoords.slice(1, -1).map(s => `${s.customer.latitude},${s.customer.longitude}`).join('|');
  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;
  if (waypoints) url += `&waypoints=${waypoints}`;
  return url;
}

// ── WhatsApp send component ─────────────────────────────────────────────
function WhatsAppSend({ gmapsUrl, technicians, selectedTechId, onSelectTech, routeName }: {
  gmapsUrl: string;
  technicians: Array<{ id: string; full_name: string; phone: string }>;
  selectedTechId: string;
  onSelectTech: (id: string) => void;
  routeName: string;
}) {
  function cleanPhone(phone: string): string {
    return phone.replace(/[^0-9]/g, '').replace(/^0+/, '');
  }

  function sendWhatsApp() {
    const tech = technicians.find(t => t.id === selectedTechId);
    if (!tech || !tech.phone) return;
    const phone = cleanPhone(tech.phone);
    const formattedPhone = phone.startsWith('55') ? phone : `55${phone}`;
    const msg = `Olá ${tech.full_name}, sua rota "${routeName}" está pronta! Acesse aqui para iniciar a navegação:\n${gmapsUrl}`;
    const url = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  }

  return (
    <div className="hidden sm:flex items-center gap-1.5">
      <select value={selectedTechId} onChange={e => onSelectTech(e.target.value)}
        className="border border-slate-200 rounded-lg text-xs px-2 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white max-w-[120px]">
        <option value="">Técnico...</option>
        {technicians.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
      </select>
      <button onClick={sendWhatsApp} disabled={!selectedTechId}
        className="flex items-center gap-1.5 bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
        title="Enviar rota via WhatsApp">
        <MessageCircle size={15} /> <Send size={13} />
      </button>
    </div>
  );
}

// ── Main LogisticsPage ──────────────────────────────────────────────────
interface LogisticsPageProps {
  onMenuClick: () => void;
  onSelectCustomer: (id: string) => void;
  refresh: number;
}

export default function LogisticsPage({ onMenuClick, refresh }: LogisticsPageProps) {
  const { signOut, profile } = useAuth();
  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [activeDay, setActiveDay] = useState(1);
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showMobileMap, setShowMobileMap] = useState(false);

  // search / filter state
  const [search, setSearch] = useState('');
  const [cityFilter, setCityFilter] = useState<string>('');
  const [cities, setCities] = useState<string[]>([]);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [showSearchPanel, setShowSearchPanel] = useState(true);

  // technicians for WhatsApp
  const [technicians, setTechnicians] = useState<Array<{ id: string; full_name: string; phone: string }>>([]);
  const [selectedTechId, setSelectedTechId] = useState<string>('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const currentRoute = useMemo(() => routes.find(r => r.day_index === activeDay), [routes, activeDay]);
  const currentStops = currentRoute?.stops ?? [];
  const pendingCount = currentStops.filter(s => !s.visited).length;
  const visitedCount = currentStops.filter(s => s.visited).length;
  const gmapsUrl = useMemo(() => buildGoogleMapsUrl(currentStops), [currentStops]);

  // ── Load data ──────────────────────────────────────────────────────────
  useEffect(() => {
    loadAll();

    // Realtime: when a technician marks a stop as visited on mobile, reload route data
    const channel = supabase
      .channel('admin-route-stops')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'route_stops' }, () => {
        loadAll();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [refresh]);

  async function loadAll() {
    setLoading(true);
    const [routesRes, techRes] = await Promise.all([
      supabase.from('routes').select('*, route_stops(*, customers(*))').order('day_index'),
      supabase.from('user_profiles').select('id, full_name, phone').eq('role', 'technician').eq('active', true),
    ]);

    // Paginate customers
    const allCust: Customer[] = [];
    const PAGE_SIZE = 1000;
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const { data } = await supabase.from('customers').select('*').order('name').range(from, from + PAGE_SIZE - 1);
      if (data && data.length > 0) {
        allCust.push(...data);
        from += PAGE_SIZE;
        if (data.length < PAGE_SIZE) hasMore = false;
      } else {
        hasMore = false;
      }
    }

    setAllCustomers(allCust);
    const uniqueCities = [...new Set(allCust.map(c => c.city ? formatCityName(c.city) : '').filter(Boolean))].sort();
    setCities(uniqueCities);

    if (techRes.data) setTechnicians(techRes.data);

    if (routesRes.data) {
      const mapped: RouteData[] = routesRes.data.map(r => ({
        id: r.id,
        name: r.name,
        day_index: r.day_index,
        stops: (r.route_stops as unknown as Array<Record<string, unknown>>)
          ?.map((rs: Record<string, unknown>) => ({
            id: rs.id as string,
            customer: rs.customers as unknown as Customer,
            stop_order: rs.stop_order as number,
            visited: rs.visited as boolean,
            visited_at: rs.visited_at as string | null,
          }))
          .sort((a: RouteStop, b: RouteStop) => a.stop_order - b.stop_order) ?? [],
      }));
      setRoutes(mapped);
    }
    setLoading(false);
  }

  // ── Persist stops ─────────────────────────────────────────────────────
  async function persistStops(routeId: string, stops: RouteStop[]) {
    setSaving(true);
    await supabase.from('route_stops').delete().eq('route_id', routeId);
    if (stops.length > 0) {
      const rows = stops.map((s, idx) => ({
        route_id: routeId,
        customer_id: s.customer.id,
        stop_order: idx,
        visited: s.visited,
        visited_at: s.visited_at,
      }));
      const { data } = await supabase.from('route_stops').insert(rows).select('id, customer_id');
      if (data) {
        const idMap = new Map(data.map(d => [d.customer_id, d.id]));
        setRoutes(prev => prev.map(r =>
          r.id === routeId ? { ...r, stops: r.stops.map(s => ({ ...s, id: idMap.get(s.customer.id) ?? s.id })) } : r
        ));
      }
    } else {
      setRoutes(prev => prev.map(r => r.id === routeId ? { ...r, stops: [] } : r));
    }
    setSaving(false);
  }

  // ── Ensure route exists for active day ───────────────────────────────────
  async function ensureRoute(): Promise<RouteData> {
    if (currentRoute) return currentRoute;
    const name = DAY_FULL[activeDay - 1];
    const { data, error } = await supabase
      .from('routes')
      .insert({ name, day_index: activeDay })
      .select('id, name, day_index')
      .single();
    if (error || !data) throw new Error('Erro ao criar rota');
    const newRoute: RouteData = { id: data.id, name: data.name, day_index: data.day_index, stops: [] };
    setRoutes(prev => [...prev, newRoute]);
    return newRoute;
  }

  // ── Add single customer ────────────────────────────────────────────────
  const addOneToRoute = useCallback(async (customer: Customer) => {
    const route = await ensureRoute();
    if (route.stops.some(s => s.customer.id === customer.id)) return;
    const newStop: RouteStop = {
      id: `temp-${Date.now()}-${customer.id}`,
      customer,
      stop_order: route.stops.length,
      visited: false,
      visited_at: null,
    };
    const updatedStops = [...route.stops, newStop];
    setRoutes(prev => prev.map(r => r.id === route.id ? { ...r, stops: updatedStops } : r));
    await persistStops(route.id, updatedStops);
  }, [currentRoute, activeDay]);

  // ── Add selected (mass) ────────────────────────────────────────────────
  const addSelectedToRoute = useCallback(async () => {
    if (checkedIds.size === 0) return;
    const route = await ensureRoute();
    const existingIds = new Set(route.stops.map(s => s.customer.id));
    const toAdd = allCustomers.filter(c => checkedIds.has(c.id) && !existingIds.has(c.id));
    if (toAdd.length === 0) { setCheckedIds(new Set()); return; }

    const newStops: RouteStop[] = toAdd.map((c, i) => ({
      id: `temp-${Date.now()}-${c.id}`,
      customer: c,
      stop_order: route.stops.length + i,
      visited: false,
      visited_at: null,
    }));
    const updatedStops = [...route.stops, ...newStops];
    setRoutes(prev => prev.map(r => r.id === route.id ? { ...r, stops: updatedStops } : r));
    setCheckedIds(new Set());
    await persistStops(route.id, updatedStops);
  }, [currentRoute, checkedIds, allCustomers, activeDay]);

  // ── Remove from route ──────────────────────────────────────────────────
  const removeFromRoute = useCallback(async (stopId: string) => {
    if (!currentRoute) return;
    const updatedStops = currentRoute.stops.filter(s => s.id !== stopId).map((s, i) => ({ ...s, stop_order: i }));
    setRoutes(prev => prev.map(r => r.id === currentRoute.id ? { ...r, stops: updatedStops } : r));
    await persistStops(currentRoute.id, updatedStops);
  }, [currentRoute]);

  // ── Mark visited ──────────────────────────────────────────────────────
  const markVisited = useCallback(async (stopId: string) => {
    if (!currentRoute) return;
    const stop = currentRoute.stops.find(s => s.id === stopId);
    if (!stop || stop.visited) return;
    const now = new Date().toISOString();
    await supabase.from('contacts').insert({
      customer_id: stop.customer.id,
      contact_type: 'Visita',
      contacted_by: 'Roteirização',
      subject: `Visita — ${currentRoute.name}`,
      details: 'Marcado como visitado via módulo de logística',
      contacted_at: now,
    });
    await supabase.from('customers').update({ last_contact_at: now }).eq('id', stop.customer.id);
    await supabase.from('route_stops').update({ visited: true, visited_at: now }).eq('id', stopId);
    setRoutes(prev => prev.map(r =>
      r.id === currentRoute.id
        ? { ...r, stops: r.stops.map(s => s.id === stopId ? { ...s, visited: true, visited_at: now } : s) }
        : r
    ));
  }, [currentRoute]);

  // ── DnD ────────────────────────────────────────────────────────────────
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !currentRoute) return;
    const oldIdx = currentRoute.stops.findIndex(s => s.id === active.id);
    const newIdx = currentRoute.stops.findIndex(s => s.id === over.id);
    const reordered = arrayMove(currentRoute.stops, oldIdx, newIdx).map((s, i) => ({ ...s, stop_order: i }));
    setRoutes(prev => prev.map(r => r.id === currentRoute.id ? { ...r, stops: reordered } : r));
    await persistStops(currentRoute.id, reordered);
  }

  // ── Search + city filter results ───────────────────────────────────────
  const routeIds = useMemo(() => new Set(currentStops.map(s => s.customer.id)), [currentStops]);
  const filteredCustomers = useMemo(() => {
    let list = allCustomers.filter(c => !routeIds.has(c.id));
    if (cityFilter) list = list.filter(c => c.city && c.city.toLowerCase() === cityFilter.toLowerCase());
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q)));
    }
    return list;
  }, [allCustomers, cityFilter, search, routeIds]);

  const allFilteredChecked = filteredCustomers.length > 0 && filteredCustomers.every(c => checkedIds.has(c.id));

  function toggleCheck(id: string) {
    setCheckedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  function toggleAllFiltered() {
    if (allFilteredChecked) {
      setCheckedIds(prev => { const n = new Set(prev); filteredCustomers.forEach(c => n.delete(c.id)); return n; });
    } else {
      setCheckedIds(prev => { const n = new Set(prev); filteredCustomers.forEach(c => n.add(c.id)); return n; });
    }
  }

  // ── Map data ──────────────────────────────────────────────────────────
  const mapStops = currentStops.filter(s => s.customer.latitude != null && s.customer.longitude != null);
  const fullPolyline: [number, number][] = mapStops.map(s => [s.customer.latitude!, s.customer.longitude!]);
  const pendingPolyline: [number, number][] = mapStops.filter(s => !s.visited).map(s => [s.customer.latitude!, s.customer.longitude!]);

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Logística"
        subtitle="Roteirização semanal de visitas"
        onMenuClick={onMenuClick}
        actions={
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 hidden sm:inline">
              {pendingCount} pendente{pendingCount !== 1 ? 's' : ''} · {visitedCount} concluído{visitedCount !== 1 ? 's' : ''}
            </span>
            <button onClick={() => setShowMobileMap(!showMobileMap)}
              className="lg:hidden flex items-center gap-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-2 rounded-lg text-sm transition-colors">
              <Map size={15} /> {showMobileMap ? 'Lista' : 'Mapa'}
            </button>
            {gmapsUrl && (
              <a href={gmapsUrl} target="_blank" rel="noopener noreferrer"
                className="hidden sm:flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
                <Navigation size={15} /> Iniciar Navegação <ExternalLink size={12} className="opacity-70" />
              </a>
            )}
            {gmapsUrl && technicians.length > 0 && (
              <WhatsAppSend
                gmapsUrl={gmapsUrl}
                technicians={technicians}
                selectedTechId={selectedTechId}
                onSelectTech={setSelectedTechId}
                routeName={currentRoute?.name ?? ''}
              />
            )}
            <button onClick={signOut} title={`Sair (${profile?.full_name || 'Admin'})`}
              className="flex items-center gap-1.5 border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-700 px-3 py-2 rounded-lg text-sm transition-colors">
              <LogOut size={15} />
            </button>
          </div>
        }
      />

      <div className="flex-1 flex overflow-hidden">
        {/* ── Left Panel ─────────────────────────────────────────────────── */}
        <div className={`flex-1 lg:w-[480px] lg:flex-none flex flex-col overflow-hidden ${
          showMobileMap ? 'hidden lg:flex' : 'flex'
        }`}>
          {/* Day tabs */}
          <div className="bg-white border-b border-slate-200">
            <div className="flex">
              {DAY_LABELS.map((label, i) => {
                const dayIdx = i + 1;
                const r = routes.find(r => r.day_index === dayIdx);
                const count = r?.stops.filter(s => !s.visited).length ?? 0;
                return (
                  <button key={dayIdx} onClick={() => setActiveDay(dayIdx)}
                    className={`flex-1 py-3 text-center text-xs font-semibold border-b-2 transition-colors ${
                      activeDay === dayIdx
                        ? 'border-amber-500 text-amber-600 bg-amber-50'
                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                    }`}>
                    <span className="block">{label}</span>
                    {count > 0 && (
                      <span className={`inline-block mt-0.5 w-5 h-5 rounded-full text-[10px] font-bold leading-5 ${
                        activeDay === dayIdx ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-600'
                      }`}>{count}</span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="px-4 py-2 flex items-center justify-between">
              <p className="text-sm font-bold text-slate-700">{DAY_FULL[activeDay - 1]}</p>
              <div className="flex items-center gap-2">
                {saving && <Loader2 size={14} className="text-amber-500 animate-spin" />}
                <button onClick={() => setShowSearchPanel(!showSearchPanel)}
                  className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg transition-colors ${
                    showSearchPanel ? 'bg-amber-100 text-amber-700' : 'text-slate-500 hover:bg-slate-100'
                  }`}>
                  <Plus size={13} /> {showSearchPanel ? 'Ocultar busca' : 'Adicionar clientes'}
                </button>
              </div>
            </div>
          </div>

          {/* ── Search / Filter panel ───────────────────────────────────── */}
          {showSearchPanel && (
            <div className="border-b border-slate-200 bg-white">
              {/* search + city filter */}
              <div className="p-3 space-y-2">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" placeholder="Buscar por nome ou telefone..."
                      value={search} onChange={e => setSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent" />
                  </div>
                  <div className="flex items-center gap-1">
                    <Filter size={14} className="text-slate-400 flex-shrink-0" />
                    <select value={cityFilter} onChange={e => setCityFilter(e.target.value)}
                      className="border border-slate-200 rounded-lg text-sm px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent bg-white max-w-[140px]">
                      <option value="">Todas cidades</option>
                      {cities.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                {/* results with checkboxes */}
                {filteredCustomers.length > 0 && (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    {/* select-all header */}
                    <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
                      <button onClick={toggleAllFiltered} className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                        {allFilteredChecked
                          ? <CheckSquare size={14} className="text-amber-500" />
                          : <Square size={14} className="text-slate-400" />
                        }
                        {allFilteredChecked ? 'Desmarcar todos' : 'Selecionar todos'}
                      </button>
                      <span className="text-xs text-slate-400">{filteredCustomers.length} cliente{filteredCustomers.length !== 1 ? 's' : ''}</span>
                      {checkedIds.size > 0 && (
                        <button onClick={addSelectedToRoute}
                          className="ml-auto flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1 rounded-lg text-xs font-medium transition-colors">
                          <Plus size={12} /> Adicionar {checkedIds.size} à rota
                        </button>
                      )}
                    </div>

                    {/* customer list */}
                    <div className="max-h-44 overflow-auto divide-y divide-slate-100">
                      {filteredCustomers.map(c => {
                        const isChecked = checkedIds.has(c.id);
                        return (
                          <button key={c.id} onClick={() => toggleCheck(c.id)}
                            className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-amber-50 transition-colors text-left ${
                              isChecked ? 'bg-amber-50' : ''
                            }`}>
                            {isChecked
                              ? <CheckSquare size={15} className="text-amber-500 flex-shrink-0" />
                              : <Square size={15} className="text-slate-300 flex-shrink-0" />
                            }
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-800 truncate">{c.name}</p>
                              <div className="flex items-center gap-2 text-xs text-slate-400">
                                {c.city && <span>{c.city}</span>}
                                {c.phone && <span>{c.phone}</span>}
                              </div>
                            </div>
                            {c.latitude != null
                              ? <MapPin size={12} className="text-emerald-400 flex-shrink-0" />
                              : <span className="text-[10px] text-amber-400 flex-shrink-0">sem coords</span>
                            }
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {filteredCustomers.length === 0 && (search || cityFilter) && (
                  <p className="text-xs text-slate-400 text-center py-2">Nenhum cliente encontrado com esses filtros</p>
                )}
              </div>
            </div>
          )}

          {/* ── Route list (DnD) ─────────────────────────────────────────── */}
          <div className="flex-1 overflow-auto p-4 space-y-2 bg-slate-50">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="text-amber-500 animate-spin" />
              </div>
            ) : currentStops.length === 0 ? (
              <div className="text-center py-12">
                <Navigation size={40} className="text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">Nenhuma parada nesta rota</p>
                <p className="text-slate-400 text-sm mt-1">Use a busca acima para adicionar clientes</p>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={currentStops.map(s => s.id)} strategy={verticalListSortingStrategy}>
                  {currentStops.map((stop, idx) => (
                    <SortableCard key={stop.id} stop={stop} index={idx}
                      onVisit={() => markVisited(stop.id)}
                      onRemove={() => removeFromRoute(stop.id)} />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>

        {/* ── Right Panel: Map ───────────────────────────────────────────── */}
        <div className={`flex-1 overflow-hidden ${showMobileMap ? 'flex' : 'hidden lg:flex'}`}>
          <div className="w-full h-full relative">
            <MapContainer center={RS_CENTER} zoom={11} className="w-full h-full z-0" zoomControl={true}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <FitBounds stops={currentStops} />

              {mapStops.map((stop, idx) => (
                <Marker key={stop.id}
                  position={[stop.customer.latitude!, stop.customer.longitude!]}
                  icon={stop.visited ? VISITED_ICON : new L.Icon.Default()}>
                  <Popup>
                    <div className="text-sm min-w-[160px]">
                      <p className="font-bold">{stop.customer.name}</p>
                      {stop.customer.address && <p className="text-slate-600 text-xs">{stop.customer.address}</p>}
                      {stop.customer.phone && <p className="text-slate-500 text-xs">{stop.customer.phone}</p>}
                      <p className="text-xs mt-1 text-slate-400">Parada #{idx + 1} {stop.visited ? '(Concluída)' : ''}</p>
                    </div>
                  </Popup>
                </Marker>
              ))}

              {fullPolyline.length >= 2 && (
                <Polyline positions={fullPolyline} pathOptions={{ color: '#f59e0b', weight: 3, opacity: 0.5, dashArray: '10 6' }} />
              )}
              {pendingPolyline.length >= 2 && (
                <Polyline positions={pendingPolyline} pathOptions={{ color: '#f59e0b', weight: 4, opacity: 0.9 }} />
              )}
            </MapContainer>

            {/* Floating Google Maps button */}
            {gmapsUrl && (
              <a href={gmapsUrl} target="_blank" rel="noopener noreferrer"
                className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-3 rounded-xl text-sm font-semibold transition-colors shadow-lg z-[1000]">
                <Navigation size={16} /> Iniciar Navegação no Google Maps <ExternalLink size={14} className="opacity-70" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
