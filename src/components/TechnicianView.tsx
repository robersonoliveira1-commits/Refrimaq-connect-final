import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  MapPin, CheckCircle, Navigation, ChevronDown, ChevronUp,
  Loader2, LogOut, Clock, Phone, Home, XCircle,
  RotateCcw, GripVertical, Camera, WifiOff, Wifi, X, Image, Wand2,
} from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Customer } from '../lib/types';
import { enqueue, flushQueue, isOnline, attachOnlineListener, getQueueLength } from '../lib/offlineQueue';

interface TechStop {
  id: string;
  customer: Customer;
  stop_order: number;
  visited: boolean;
  visited_at: string | null;
  status: 'pending' | 'ok' | 'absent' | 'postponed';
}

interface TechRoute {
  id: string;
  name: string;
  day_index: number;
  stops: TechStop[];
}

const DAY_LABELS = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
const DAY_SHORT = ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex'];

// Formula de Haversine para calcular distancia em KM entre duas coordenadas
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function googleMapsNavUrl(stops: TechStop[]): string {
  const pending = stops.filter(s => s.status === 'pending' && s.customer.latitude != null && s.customer.longitude != null);
  if (pending.length === 0) return '';
  if (pending.length === 1) {
    return `https://www.google.com/maps/dir/?api=1&destination=${pending[0].customer.latitude},${pending[0].customer.longitude}&travelmode=driving`;
  }
  
  const dest = `${pending[pending.length - 1].customer.latitude},${pending[pending.length - 1].customer.longitude}`;
  const waypoints = pending.slice(0, -1).map(s => `${s.customer.latitude},${s.customer.longitude}`).join('|');
  
  let url = `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
  if (waypoints) url += `&waypoints=${waypoints}`;
  return url;
}

function singleNavUrl(customer: Customer): string {
  if (customer.latitude != null && customer.longitude != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${customer.latitude},${customer.longitude}&travelmode=driving`;
  }
  const addr = [customer.address, customer.city, customer.state].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
}

function timeLabel(ts: string | null): string {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function getTodayDayIndex(): number {
  const dow = new Date().getDay();
  if (dow >= 1 && dow <= 5) return dow;
  return 1;
}

// ── Sortable tech card ──────────────────────────────────────────────────
function SortableTechCard({ stop, actioningId, onVisitOk, onPostpone, onAbsent }: {
  stop: TechStop;
  actioningId: string | null;
  onVisitOk: () => void;
  onPostpone: () => void;
  onAbsent: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stop.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.9 : 1,
  };
  const c = stop.customer;
  const isActioning = actioningId === stop.id;
  const mapsUrl = singleNavUrl(c);

  return (
    <div ref={setNodeRef} style={style}
      className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden ${isDragging ? 'shadow-xl' : ''}`}>
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start gap-3">
          <button {...attributes} {...listeners}
            className="touch-none mt-1 text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing">
            <GripVertical size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-800 text-lg leading-tight">{c.name}</p>
            {c.address && (
              <p className="text-slate-500 text-sm mt-0.5 flex items-start gap-1.5">
                <MapPin size={13} className="mt-0.5 flex-shrink-0 text-slate-400" />
                <span>{c.address}{c.city ? `, ${c.city}` : ''}</span>
              </p>
            )}
            {c.phone && (
              <p className="text-slate-500 text-sm mt-1 flex items-center gap-1.5">
                <Phone size={13} className="flex-shrink-0 text-slate-400" />
                <a href={`tel:${c.phone}`} className="text-blue-600 underline">{c.phone}</a>
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 pb-2">
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
          className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-3 rounded-xl text-base transition-colors active:scale-[0.98]">
          <Navigation size={18} /> Navegar
        </a>
      </div>

      <div className="px-4 pb-4 grid grid-cols-3 gap-2">
        <button onClick={onVisitOk} disabled={!!actioningId}
          className="flex flex-col items-center justify-center gap-1 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl text-xs transition-colors active:scale-[0.97]">
          {isActioning ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
          <span>Visita OK</span>
        </button>

        <button onClick={onPostpone} disabled={!!actioningId}
          className="flex flex-col items-center justify-center gap-1 bg-amber-400 hover:bg-amber-500 active:bg-amber-600 disabled:opacity-60 text-white font-semibold py-3 rounded-xl text-xs transition-colors active:scale-[0.97]">
          <RotateCcw size={18} />
          <span>Voltar</span>
        </button>

        <button onClick={onAbsent} disabled={!!actioningId}
          className="flex flex-col items-center justify-center gap-1 bg-red-400 hover:bg-red-500 active:bg-red-600 disabled:opacity-60 text-white font-semibold py-3 rounded-xl text-xs transition-colors active:scale-[0.97]">
          <XCircle size={18} />
          <span>Ausente</span>
        </button>
      </div>
    </div>
  );
}

// ── Photo capture modal ─────────────────────────────────────────────────
function PhotoModal({ onCapture, onSkip }: { onCapture: (file: File) => void; onSkip: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Camera size={18} className="text-amber-500" />
            <h3 className="font-bold text-slate-800">Comprovante Fotografico</h3>
          </div>
          <button onClick={onSkip} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          {preview ? (
            <div className="relative">
              <img src={preview} alt="Preview" className="w-full rounded-xl object-cover max-h-64" />
              <button onClick={() => { setPreview(null); setFile(null); }}
                className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1.5">
                <X size={14} />
              </button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed border-slate-300 rounded-xl py-12 flex flex-col items-center gap-3 text-slate-500 hover:border-amber-400 hover:text-amber-600 transition-colors active:scale-[0.98]">
              <Camera size={32} />
              <span className="font-medium">Tirar Foto ou Selecionar</span>
              <span className="text-xs text-slate-400">Toque para abrir a camera</span>
            </button>
          )}

          <input ref={fileRef} type="file" accept="image/*" capture="environment"
            onChange={handleFile} className="hidden" />

          <div className="flex gap-3">
            <button onClick={onSkip}
              className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-600 py-3 rounded-xl text-sm font-medium transition-colors">
              Pular
            </button>
            <button onClick={() => { if (file) onCapture(file); else onSkip(); }}
              disabled={!file}
              className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white py-3 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2">
              <Image size={16} /> Confirmar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main view ───────────────────────────────────────────────────────────
export default function TechnicianView() {
  const { profile, signOut } = useAuth();
  const [routes, setRoutes] = useState<Record<number, TechRoute | null>>({});
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(getTodayDayIndex());
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [syncToast, setSyncToast] = useState<string | null>(null);
  const [offlineBadge, setOfflineBadge] = useState(getQueueLength());
  const [optimizingRoutes, setOptimizingRoutes] = useState(false);
  const [photoStop, setPhotoStop] = useState<TechStop | null>(null);
  const [uploading, setUploading] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  useEffect(() => {
    loadAllRoutes();
    const channel = supabase
      .channel('tech-route-stops')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'route_stops' }, () => { loadAllRoutes(); })
      .subscribe();

    function handleOnline() { setOnline(true); }
    function handleOffline() { setOnline(false); setOfflineBadge(getQueueLength()); }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    attachOnlineListener((count) => {
      setSyncToast(`${count} acao${count > 1 ? 'es' : ''} sincronizada${count > 1 ? 's' : ''} com sucesso!`);
      setOfflineBadge(0);
      setTimeout(() => setSyncToast(null), 4000);
      loadAllRoutes();
    });

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  async function loadAllRoutes() {
    const { data: allRoutes } = await supabase
      .from('routes')
      .select('*, route_stops(*, customers(*))')
      .gte('day_index', 1)
      .lte('day_index', 5);

    const routeMap: Record<number, TechRoute | null> = {};
    for (let i = 1; i <= 5; i++) routeMap[i] = null;

    if (allRoutes) {
      for (const rd of allRoutes) {
        const stops: TechStop[] = (rd.route_stops as unknown as Array<Record<string, unknown>>)
          ?.map((rs: Record<string, unknown>) => ({
            id: rs.id as string,
            customer: rs.customers as unknown as Customer,
            stop_order: rs.stop_order as number,
            visited: rs.visited as boolean,
            visited_at: rs.visited_at as string | null,
            status: (rs.status as string) || (rs.visited ? 'ok' : 'pending'),
          }))
          .sort((a, b) => a.stop_order - b.stop_order) ?? [];

        routeMap[rd.day_index] = { id: rd.id, name: rd.name, day_index: rd.day_index, stops };
      }
    }

    setRoutes(routeMap);
    setLoading(false);
  }

  const route = routes[selectedDay] ?? null;
  const pendingStops = useMemo(() => route?.stops.filter(s => s.status === 'pending') ?? [], [route]);
  const finishedStops = useMemo(() => route?.stops.filter(s => s.status !== 'pending') ?? [], [route]);
  const routeNavUrl = useMemo(() => googleMapsNavUrl(pendingStops), [pendingStops]);
  const todayIndex = getTodayDayIndex();

  async function persistOrder(stops: TechStop[]) {
    if (!route) return;
    if (isOnline()) {
      const updates = stops.map((s, idx) => supabase.from('route_stops').update({ stop_order: idx }).eq('id', s.id));
      await Promise.all(updates);
    } else {
      stops.forEach((s, idx) => {
        enqueue({ type: 'update_route_stop', payload: { id: s.id, stop_order: idx } });
      });
      setOfflineBadge(getQueueLength());
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !route) return;
    const allStops = [...route.stops];
    const oldIdx = allStops.findIndex(s => s.id === active.id);
    const newIdx = allStops.findIndex(s => s.id === over.id);
    const reordered = arrayMove(allStops, oldIdx, newIdx).map((s, i) => ({ ...s, stop_order: i }));
    setRoutes(prev => ({ ...prev, [selectedDay]: { ...route, stops: reordered } }));
    await persistOrder(reordered);
  }

  async function handleOptimizeRoute() {
    if (!route || route.stops.length < 2) return;
    
    setOptimizingRoutes(true);
    
    const tryOptimize = (startLat: number, startLon: number) => {
      const withCoords = route.stops.filter(s => s.customer.latitude != null && s.customer.longitude != null);
      const withoutCoords = route.stops.filter(s => s.customer.latitude == null || s.customer.longitude == null);
      
      const unvisited = [...withCoords];
      const optimized: TechStop[] = [];
      
      let currLat = startLat;
      let currLon = startLon;
      
      while (unvisited.length > 0) {
        let nearestIdx = 0;
        let minDistance = Infinity;
        for (let i = 0; i < unvisited.length; i++) {
          const s = unvisited[i];
          const dist = haversineDistance(currLat, currLon, s.customer.latitude!, s.customer.longitude!);
          if (dist < minDistance) {
            minDistance = dist;
            nearestIdx = i;
          }
        }
        const next = unvisited.splice(nearestIdx, 1)[0];
        optimized.push(next);
        currLat = next.customer.latitude!;
        currLon = next.customer.longitude!;
      }
      
      const finalOrder = [...optimized, ...withoutCoords].map((s, i) => ({ ...s, stop_order: i }));
      
      setRoutes(prev => ({ ...prev, [selectedDay]: { ...route, stops: finalOrder } }));
      persistOrder(finalOrder);
      setOptimizingRoutes(false);
    };

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => tryOptimize(pos.coords.latitude, pos.coords.longitude),
        (err) => {
          console.warn('GPS falhou, usando primeira parada', err);
          alert('Não foi possível obter sua localização atual pelo GPS. A rota será otimizada a partir do primeiro cliente da lista.');
          if (route.stops[0]?.customer.latitude != null && route.stops[0]?.customer.longitude != null) {
             tryOptimize(route.stops[0].customer.latitude, route.stops[0].customer.longitude);
          } else {
             tryOptimize(0, 0);
          }
        },
        { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 }
      );
    } else {
      alert('Seu dispositivo não suporta GPS. A rota será otimizada a partir do primeiro cliente da lista.');
      if (route.stops[0]?.customer.latitude != null && route.stops[0]?.customer.longitude != null) {
         tryOptimize(route.stops[0].customer.latitude, route.stops[0].customer.longitude);
      } else {
         tryOptimize(0, 0);
      }
    }
  }

  function handleVisitOkStart(stop: TechStop) {
    setPhotoStop(stop);
  }

  async function completeVisitOk(file: File | null) {
    if (!route || !photoStop) return;
    setUploading(true);
    const stop = photoStop;
    setPhotoStop(null);
    setActioningId(stop.id);

    const now = new Date().toISOString();
    let comprovanteUrl = '';

    if (file) {
      if (isOnline()) {
        const ext = file.name.split('.').pop() || 'jpg';
        const path = `${stop.customer.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('comprovantes').upload(path, file);
        if (!upErr) {
          const { data: urlData } = supabase.storage.from('comprovantes').getPublicUrl(path);
          comprovanteUrl = urlData.publicUrl;
        }
      }
    }

    setRoutes(prev => ({
      ...prev,
      [selectedDay]: prev[selectedDay] ? {
        ...prev[selectedDay]!,
        stops: prev[selectedDay]!.stops.map(s => s.id === stop.id ? { ...s, status: 'ok' as const, visited: true, visited_at: now } : s),
      } : null,
    }));

    if (isOnline()) {
      await Promise.all([
        supabase.from('route_stops').update({ visited: true, visited_at: now, status: 'ok' }).eq('id', stop.id),
        supabase.from('contacts').insert({
          customer_id: stop.customer.id,
          contact_type: 'Visita',
          contacted_by: profile?.full_name || 'Tecnico',
          subject: `Visita OK — ${route.name}`,
          details: 'Visita finalizada com sucesso pelo tecnico',
          contacted_at: now,
          comprovante_url: comprovanteUrl,
        }),
        supabase.from('customers').update({ last_contact_at: now }).eq('id', stop.customer.id),
      ]);
    } else {
      enqueue({ type: 'update_route_stop', payload: { id: stop.id, visited: true, visited_at: now, status: 'ok' } });
      enqueue({ type: 'insert_contact', payload: {
        customer_id: stop.customer.id,
        contact_type: 'Visita',
        contacted_by: profile?.full_name || 'Tecnico',
        subject: `Visita OK — ${route.name}`,
        details: 'Visita finalizada com sucesso pelo tecnico',
        contacted_at: now,
        comprovante_url: comprovanteUrl,
      }});
      enqueue({ type: 'update_customer', payload: { id: stop.customer.id, last_contact_at: now } });
      setOfflineBadge(getQueueLength());
      setSyncToast('Salvo offline. Sincronizando quando houver conexao.');
      setTimeout(() => setSyncToast(null), 4000);
    }

    setActioningId(null);
    setUploading(false);
  }

  const handleAction = useCallback(async (stopId: string, action: 'absent' | 'postponed') => {
    if (!route || actioningId) return;
    setActioningId(stopId);
    const stop = route.stops.find(s => s.id === stopId);
    if (!stop) { setActioningId(null); return; }

    const now = new Date().toISOString();

    if (action === 'postponed') {
      const others = route.stops.filter(s => s.id !== stopId);
      const reordered = [...others, { ...stop, stop_order: others.length }].map((s, i) => ({ ...s, stop_order: i }));
      setRoutes(prev => ({ ...prev, [selectedDay]: { ...route, stops: reordered } }));
      await persistOrder(reordered);
      setActioningId(null);
      return;
    }

    setRoutes(prev => ({
      ...prev,
      [selectedDay]: prev[selectedDay] ? {
        ...prev[selectedDay]!,
        stops: prev[selectedDay]!.stops.map(s => s.id === stopId ? { ...s, status: 'absent' as const, visited: true, visited_at: now } : s),
      } : null,
    }));

    if (isOnline()) {
      await Promise.all([
        supabase.from('route_stops').update({ visited: true, visited_at: now, status: 'absent' }).eq('id', stopId),
        supabase.from('contacts').insert({
          customer_id: stop.customer.id,
          contact_type: 'Visita',
          contacted_by: profile?.full_name || 'Tecnico',
          subject: `Cliente Ausente — ${route.name}`,
          details: 'Cliente ausente no momento da visita',
          contacted_at: now,
        }),
        supabase.from('customers').update({ last_contact_at: now }).eq('id', stop.customer.id),
      ]);
    } else {
      enqueue({ type: 'update_route_stop', payload: { id: stopId, visited: true, visited_at: now, status: 'absent' } });
      enqueue({ type: 'insert_contact', payload: {
        customer_id: stop.customer.id,
        contact_type: 'Visita',
        contacted_by: profile?.full_name || 'Tecnico',
        subject: `Cliente Ausente — ${route.name}`,
        details: 'Cliente ausente no momento da visita',
        contacted_at: now,
      }});
      enqueue({ type: 'update_customer', payload: { id: stop.customer.id, last_contact_at: now } });
      setOfflineBadge(getQueueLength());
      setSyncToast('Salvo offline. Sincronizando quando houver conexao.');
      setTimeout(() => setSyncToast(null), 4000);
    }

    setActioningId(null);
  }, [route, actioningId, profile, selectedDay]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 size={32} className="text-amber-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Offline / Sync toast */}
      {syncToast && (
        <div className="fixed top-4 left-4 right-4 z-[60] bg-slate-800 text-white text-sm font-medium px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-in">
          {online ? <Wifi size={16} className="text-emerald-400" /> : <WifiOff size={16} className="text-amber-400" />}
          {syncToast}
        </div>
      )}

      {/* Header */}
      <div className="bg-gradient-to-r from-sky-600 to-sky-700 px-4 py-4 shadow-md sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/Refrimaq_Logomarca_-_modelo03.JPG" alt="Refrimaq" className="w-9 h-9 rounded-xl object-cover" />
            <div>
              <p className="font-bold text-white text-sm leading-tight">Refrimaq Connect</p>
              <p className="text-sky-100 text-xs">{profile?.full_name || 'Tecnico'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${
              online ? 'bg-emerald-500/30 text-emerald-100' : 'bg-red-500/30 text-red-100'
            }`}>
              {online ? <Wifi size={12} /> : <WifiOff size={12} />}
              {online ? 'Online' : 'Offline'}
              {!online && offlineBadge > 0 && (
                <span className="ml-1 bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">{offlineBadge}</span>
              )}
            </div>
            <button onClick={signOut}
              className="flex items-center gap-1.5 text-white/80 hover:text-white text-sm transition-colors">
              <LogOut size={16} />
            </button>
          </div>
        </div>

        {/* Day tabs */}
        <div className="mt-3 flex gap-1 bg-white/10 rounded-xl p-1">
          {[1, 2, 3, 4, 5].map(day => {
            const isToday = day === todayIndex;
            const isSelected = day === selectedDay;
            const dayRoute = routes[day];
            const dayPending = dayRoute?.stops.filter(s => s.status === 'pending').length ?? 0;

            return (
              <button
                key={day}
                onClick={() => { setSelectedDay(day); setShowCompleted(false); }}
                className={`flex-1 relative flex flex-col items-center py-2 px-1 rounded-lg text-xs font-semibold transition-all ${
                  isSelected
                    ? 'bg-white text-sky-700 shadow-sm'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                <span className={isToday && !isSelected ? 'underline decoration-2 underline-offset-2' : ''}>
                  {DAY_SHORT[day]}
                </span>
                {dayRoute && dayPending > 0 && (
                  <span className={`mt-0.5 text-[10px] leading-none ${
                    isSelected ? 'text-sky-500' : 'text-sky-200'
                  }`}>
                    {dayPending}
                  </span>
                )}
                {isToday && (
                  <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${
                    isSelected ? 'bg-sky-500' : 'bg-white/70'
                  }`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Route summary bar */}
      {route && (
        <div className="bg-white border-b border-slate-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-800 text-sm">{route.name}</p>
              <p className="text-slate-500 text-xs mt-0.5">
                {DAY_LABELS[selectedDay]} — {pendingStops.length} pendente{pendingStops.length !== 1 ? 's' : ''}
                {finishedStops.length > 0 && ` / ${finishedStops.length} finalizado${finishedStops.length !== 1 ? 's' : ''}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {route.stops.length > 1 && (
                <button
                  onClick={handleOptimizeRoute}
                  disabled={optimizingRoutes}
                  className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold px-3 py-2 rounded-xl text-xs transition-colors active:scale-[0.98] disabled:opacity-50"
                >
                  {optimizingRoutes ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                  Otimizar
                </button>
              )}
              {routeNavUrl && (
                <a href={routeNavUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-700 text-white font-semibold px-3 py-2 rounded-xl text-xs transition-colors active:scale-[0.98]">
                  <Navigation size={14} /> Rota
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4 pb-24">
        {!route || route.stops.length === 0 ? (
          <div className="text-center py-16">
            <Home size={48} className="text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600 font-semibold text-lg">Nenhuma visita programada</p>
            <p className="text-slate-400 text-sm mt-1">
              Nao ha clientes na rota de {DAY_LABELS[selectedDay]}
            </p>
          </div>
        ) : (
          <>
            {pendingStops.length > 0 && (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={pendingStops.map(s => s.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-4">
                    {pendingStops.map(stop => (
                      <SortableTechCard
                        key={stop.id}
                        stop={stop}
                        actioningId={actioningId}
                        onVisitOk={() => handleVisitOkStart(stop)}
                        onPostpone={() => handleAction(stop.id, 'postponed')}
                        onAbsent={() => handleAction(stop.id, 'absent')}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}

            {pendingStops.length === 0 && (
              <div className="text-center py-8 bg-white rounded-2xl border border-emerald-200">
                <CheckCircle size={40} className="text-emerald-500 mx-auto mb-2" />
                <p className="text-emerald-700 font-semibold text-lg">Rota concluida!</p>
                <p className="text-slate-400 text-sm">Todas as visitas de {DAY_LABELS[selectedDay]} foram finalizadas</p>
              </div>
            )}

            {finishedStops.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <button onClick={() => setShowCompleted(!showCompleted)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-2">
                    <CheckCircle size={16} className="text-emerald-500" />
                    <span className="text-sm font-semibold text-slate-700">Finalizados ({finishedStops.length})</span>
                  </div>
                  {showCompleted ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                </button>
                {showCompleted && (
                  <div className="divide-y divide-slate-100">
                    {finishedStops.map(stop => (
                      <div key={stop.id} className="px-4 py-3 flex items-center gap-3 opacity-60">
                        <span className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                          stop.status === 'ok' ? 'bg-emerald-500' : 'bg-red-400'
                        }`}>
                          {stop.status === 'ok'
                            ? <CheckCircle size={14} className="text-white" />
                            : <XCircle size={14} className="text-white" />
                          }
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700 line-through truncate">{stop.customer.name}</p>
                          <p className="text-xs text-slate-500 flex items-center gap-1">
                            <Clock size={10} />
                            {stop.status === 'ok' ? 'Visita OK' : 'Cliente Ausente'}
                            {stop.visited_at && ` — ${timeLabel(stop.visited_at)}`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Photo modal */}
      {photoStop && (
        <PhotoModal
          onCapture={(file) => completeVisitOk(file)}
          onSkip={() => completeVisitOk(null)}
        />
      )}
    </div>
  );
}
