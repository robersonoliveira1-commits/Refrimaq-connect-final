import { supabase } from './supabase';

interface QueuedAction {
  id: string;
  timestamp: string;
  type: 'update_route_stop' | 'insert_contact' | 'update_customer';
  payload: Record<string, unknown>;
}

const QUEUE_KEY = 'refrimaq_offline_queue';

function getQueue(): QueuedAction[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveQueue(queue: QueuedAction[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function enqueue(action: Omit<QueuedAction, 'id' | 'timestamp'>) {
  const queue = getQueue();
  queue.push({ ...action, id: crypto.randomUUID(), timestamp: new Date().toISOString() });
  saveQueue(queue);
}

export function getQueueLength(): number {
  return getQueue().length;
}

export async function flushQueue(): Promise<number> {
  const queue = getQueue();
  if (queue.length === 0) return 0;

  let flushed = 0;
  const remaining: QueuedAction[] = [];

  for (const action of queue) {
    try {
      let success = false;
      if (action.type === 'update_route_stop') {
        const { id, ...data } = action.payload as { id: string } & Record<string, unknown>;
        const { error } = await supabase.from('route_stops').update(data).eq('id', id);
        success = !error;
      } else if (action.type === 'insert_contact') {
        const { error } = await supabase.from('contacts').insert(action.payload);
        success = !error;
      } else if (action.type === 'update_customer') {
        const { id, ...data } = action.payload as { id: string } & Record<string, unknown>;
        const { error } = await supabase.from('customers').update(data).eq('id', id);
        success = !error;
      }
      if (success) flushed++;
      else remaining.push(action);
    } catch {
      remaining.push(action);
    }
  }

  saveQueue(remaining);
  return flushed;
}

export function isOnline(): boolean {
  return navigator.onLine;
}

let listenerAttached = false;

export function attachOnlineListener(onSync: (count: number) => void) {
  if (listenerAttached) return;
  listenerAttached = true;

  window.addEventListener('online', async () => {
    const flushed = await flushQueue();
    if (flushed > 0) onSync(flushed);
  });
}
