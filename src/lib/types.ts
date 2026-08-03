export type ContactStatus = 'green' | 'yellow' | 'red' | 'gray';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  document: string;
  notes: string;
  last_contact_at: string | null;
  latitude: number | null;
  longitude: number | null;
  equipment_types?: string[];
  segment?: string;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  description: string;
  unit_price: number;
  stock_quantity: number;
  photo_url: string;
  created_at: string;
}

export interface CustomerProduct {
  id: string;
  customer_id: string;
  product_id: string | null;
  product_name: string;
  purchase_date: string | null;
  invoice_number: string;
  warranty_start: string | null;
  warranty_end: string | null;
  notes: string;
  created_at: string;
  products?: Product;
}

export interface Contact {
  id: string;
  customer_id: string;
  contact_type: string;
  contacted_by: string;
  subject: string;
  details: string;
  contacted_at: string;
  next_contact_at: string | null;
  next_contact_notes: string;
  comprovante_url: string;
  created_at: string;
}

export interface ContactSchedule {
  id: string;
  customer_id: string;
  contact_id: string | null;
  scheduled_at: string;
  assigned_to: string;
  notes: string;
  completed: boolean;
  created_at: string;
  customers?: Customer;
}

export function getContactStatus(lastContactAt: string | null): ContactStatus {
  if (!lastContactAt) return 'gray';
  const days = Math.floor((Date.now() - new Date(lastContactAt).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 30) return 'green';
  if (days <= 180) return 'yellow';
  return 'red';
}

export function getStatusLabel(status: ContactStatus): string {
  const labels: Record<ContactStatus, string> = {
    green: 'Recente',
    yellow: 'Atenção',
    red: 'Urgente',
    gray: 'Novo',
  };
  return labels[status];
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function daysSince(dateStr: string | null): string {
  if (!dateStr) return 'Nunca';
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Hoje';
  if (days === 1) return 'Ontem';
  return `${days} dias atrás`;
}

export interface UsedItem {
  id: string;
  internal_code: string;
  name: string;
  category: 'Peças Usadas' | 'Máquinas Usadas';
  brand_model: string;
  year: number | null;
  condition: string;
  description: string;
  notes: string;
  photos: string[];
  price: number;
  promotional_price: number | null;
  payment_conditions: string;
  specs: string;
  dimensions: string;
  weight: string;
  voltage: string;
  compatibility: string;
  status: 'Disponível' | 'Vendido';
  created_at: string;
  updated_at: string;
}

export interface UsedItemSale {
  id: string;
  used_item_id: string;
  customer_name: string;
  customer_phone?: string;
  payment_method: string;
  status: string;
  total: number;
  notes?: string;
  seller_name?: string;
  created_at: string;
  // joined fields
  used_item?: UsedItem;
}

export interface SalesBudget {
  id: string;
  customer_id?: string;
  customer_name?: string;
  items: any; // JSONB array of CartItem
  subtotal: number;
  discount: number;
  total: number;
  created_at: string;
}

export interface Sale {
  id: string;
  customer_id?: string;
  customer_name?: string;
  budget_id?: string;
  payment_method: string;
  subtotal: number;
  tax: number;
  total: number;
  paid_amount: number;
  change: number;
  notes: string;
  created_at: string;
}

export interface CostCenter {
  id: string;
  name: string;
  created_at: string;
}

export interface Expense {
  id: string;
  description: string;
  category: string;
  amount: number;
  due_date: string;
  paid_at: string | null;
  status: 'pendente' | 'pago' | 'atrasado';
  recurrence: 'única' | 'mensal' | 'anual';
  attachment_url: string;
  cost_center_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinancialAuditLog {
  id: string;
  action_type: 'insert' | 'update' | 'delete';
  table_name: string;
  record_id: string;
  user_name: string;
  changes: any;
  created_at: string;
}
