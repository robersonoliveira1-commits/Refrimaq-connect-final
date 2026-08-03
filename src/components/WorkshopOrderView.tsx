import { printHtml } from '../utils/print';
import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Save, Loader2, Plus, Trash2, CheckCircle2, Package, FileText, History, CreditCard, Search, Camera, X, Download, AlertCircle, Wrench, QrCode } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatDateTime } from '../lib/types';
import { fetchCompanyConfig, CompanyConfig, EMPTY_CONFIG } from '../lib/companyConfig';

interface Customer { id: string; name: string; city: string; phone: string }
interface Technician { id: string; full_name: string }
interface StockProduct { id: string; name: string; unit_price: number; stock_quantity: number }
interface StockService  { id: string; name: string; category: string; price: number; estimated_time: string }

interface OSPart {
  id?: string;
  product_id: string | null;
  part_name: string;
  quantity: number;
  unit_price: number;
}

interface Attachment {
  id: string;
  photo_url: string;
}

interface ServiceOrder {
  id: string;
  order_number: number;
  warranty_type?: string | null;
  customer_id: string;
  technician_id: string | null;
  equipment_id?: string | null;
  visit_type: string;
  priority: string;
  status: string;
  diagnosis: string;
  labor_cost: number;
  payment_method: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  equip_type: string;
  equip_brand: string;
  equip_model: string;
  equip_serial: string;
  equip_gas: string;
  equip_voltage: string;
  equip_accessories: string;
  equip_condition: string;
  is_rework: boolean;
}

interface HistoryContact {
  id: string;
  subject: string;
  details: string;
  contacted_at: string;
  contact_type: string;
}

const VISIT_TYPES = ['Corretiva', 'Instalação', 'Assepsia', 'Preventiva'];
const PRIORITIES = ['Baixa', 'Média', 'Alta', 'Urgente'];
const STATUSES = ['Triagem', 'Aguardando Orçamento', 'Aguardando Peças', 'Em Manutenção', 'Concluída', 'Cancelada'];
const PAYMENT_METHODS = ['Dinheiro', 'Pix', 'Cartão de Débito', 'Cartão de Crédito', 'Boleto', 'Transferência'];
const MAX_PHOTOS = 5;

interface Props {
  orderId: string;
  onBack: () => void;
  onMenuClick: () => void;
  onSelectCustomer: (id: string) => void;
}

type Tab = 'details' | 'parts' | 'pdv' | 'history';

export default function WorkshopOrderView({ orderId, onBack, onMenuClick, onSelectCustomer }: Props) {
  const isNew = orderId === 'new';

  const [tab, setTab] = useState<Tab>('details');
  const [showQRModal, setShowQRModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [finalizing, setFinalizing] = useState(false);

  // Machine Search States
  const [equipSearchQuery, setEquipSearchQuery] = useState('');
  const [foundEquipments, setFoundEquipments] = useState<any[]>([]);
  const [searchingEquip, setSearchingEquip] = useState(false);

  async function searchEquipments(query: string) {
    setEquipSearchQuery(query);
    if (query.trim().length < 3) {
      setFoundEquipments([]);
      return;
    }
    setSearchingEquip(true);
    
    // Fetch all customer equipments to perform local client filtering for partial UUID/CPF and Serials
    const { data: allEq } = await supabase
      .from('customer_equipments')
      .select('*, customers(name)');
      
    if (allEq) {
      const filtered = allEq.filter(eq => 
        (eq.equip_serial || '').toLowerCase().includes(query.toLowerCase()) || 
        eq.id.toLowerCase().substring(0, 8).includes(query.toLowerCase()) ||
        eq.id.toLowerCase().includes(query.toLowerCase())
      );
      setFoundEquipments(filtered.slice(0, 5));
    } else {
      setFoundEquipments([]);
    }
    setSearchingEquip(false);
  }

  const [order, setOrder] = useState<Partial<ServiceOrder>>({
    visit_type: 'Corretiva',
    priority: 'Média',
    status: 'Triagem',
    diagnosis: '',
    labor_cost: 0,
    payment_method: null,
    technician_id: null,
    customer_id: '',
    equip_type: '',
    equip_brand: '',
    equip_model: '',
    equip_serial: '',
    equip_gas: '',
    equip_voltage: '',
    equip_accessories: '',
    equip_condition: '',
    is_rework: false,
    warranty_type: null,
  });

  const [parts, setParts] = useState<OSPart[]>([]);
  const [history, setHistory] = useState<HistoryContact[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [stockProducts, setStockProducts] = useState<StockProduct[]>([]);
  const [stockServices, setStockServices] = useState<StockService[]>([]);
  const [stockSearch, setStockSearch] = useState('');
  const [stockTab, setStockTab] = useState<'parts' | 'services'>('parts');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Attachments
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [deletingPhoto, setDeletingPhoto] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Company config (for PDF)
  const [companyConfig, setCompanyConfig] = useState<CompanyConfig>(EMPTY_CONFIG);

  useEffect(() => {
    loadMeta();
    if (!isNew) loadOrder();
  }, [orderId]);

  async function loadMeta() {
    const allCustomers: Customer[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data } = await supabase
        .from('customers')
        .select('id,name,city,phone')
        .order('name')
        .range(from, from + pageSize - 1);
      if (!data || data.length === 0) break;
      allCustomers.push(...(data as unknown as Customer[]));
      if (data.length < pageSize) break;
      from += pageSize;
    }

    const [{ data: tech }, { data: stock }, { data: svc }, cfg] = await Promise.all([
      supabase.from('user_profiles').select('id,full_name').eq('active', true),
      supabase.from('products').select('id,name,unit_price,stock_quantity').eq('active', true).order('name'),
      supabase.from('services').select('id,name,category,price,estimated_time').eq('active', true).order('name'),
      fetchCompanyConfig(),
    ]);
    setCustomers(allCustomers);
    setTechnicians((tech as unknown as Technician[]) ?? []);
    setStockProducts((stock as unknown as StockProduct[]) ?? []);
    setStockServices((svc as unknown as StockService[]) ?? []);
    setCompanyConfig(cfg);
  }

  async function loadOrder() {
    setLoading(true);
    const { data: o } = await supabase
      .from('service_orders')
      .select('*')
      .eq('id', orderId)
      .single();
    if (o) {
      setOrder(o as ServiceOrder);
      const c = (await supabase.from('customers').select('id,name,city,phone').eq('id', o.customer_id).single()).data;
      if (c) setSelectedCustomer(c as unknown as Customer);
    }
    const { data: p } = await supabase
      .from('service_order_parts')
      .select('*')
      .eq('service_order_id', orderId)
      .order('created_at');
    setParts((p as unknown as OSPart[]) ?? []);

    const { data: h } = await supabase
      .from('contacts')
      .select('id,subject,details,contacted_at,contact_type')
      .eq('customer_id', o?.customer_id ?? '')
      .order('contacted_at', { ascending: false })
      .limit(30);
    setHistory((h as unknown as HistoryContact[]) ?? []);

    const { data: att } = await supabase
      .from('service_order_attachments')
      .select('id,photo_url')
      .eq('service_order_id', orderId)
      .order('created_at');
    setAttachments((att as unknown as Attachment[]) ?? []);

    setLoading(false);
  }

  async function handleOpenQRModal() {
    if (!order.equipment_id && (order.equip_type || order.equip_brand || order.equip_model || order.equip_serial)) {
      setSaving(true);
      const serial = order.equip_serial?.trim() || '';
      let eqId = null;
      if (serial) {
        const { data } = await supabase
          .from('customer_equipments')
          .select('id')
          .eq('customer_id', order.customer_id)
          .eq('equip_serial', serial)
          .maybeSingle();
        if (data) {
          eqId = data.id;
        }
      }
      
      if (!eqId) {
        const { data } = await supabase
          .from('customer_equipments')
          .insert({
            customer_id: order.customer_id,
            equip_type: order.equip_type || '',
            equip_brand: order.equip_brand || '',
            equip_model: order.equip_model || '',
            equip_serial: serial,
            equip_gas: order.equip_gas || '',
            equip_voltage: order.equip_voltage || '',
          })
          .select('id')
          .single();
        if (data) eqId = data.id;
      }

      if (eqId) {
        await supabase
          .from('service_orders')
          .update({ equipment_id: eqId })
          .eq('id', order.id);
        setOrder(o => ({ ...o, equipment_id: eqId }));
      }
      setSaving(false);
    }
    setShowQRModal(true);
  }

  async function handlePrintQRCode() {
    const qrUrl = `${window.location.origin}/?publicEquipmentId=${order.equipment_id || ''}`;
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Etiqueta Equipamento</title>
  <style>
    @page { 
      size: 48mm 65mm; 
      margin: 0; 
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 48mm;
      height: auto;
      box-sizing: border-box;
      font-family: sans-serif;
      background-color: #fff;
    }
    .label-card {
      padding: 2mm 1mm 8mm 1mm;
      width: 48mm;
      height: auto;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      margin: 0 auto;
    }
    .header {
      font-weight: bold;
      color: #d97706;
      font-size: 8px;
      width: 100%;
      border-bottom: 0.8px solid #f59e0b;
      padding-bottom: 1.5px;
      margin-top: 0;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      text-align: center;
    }
    .qr-code {
      margin: 1.5mm auto;
      width: 22mm;
      height: 22mm;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .qr-code img {
      width: 100%;
      height: 100%;
    }
    .details {
      text-align: left;
      font-size: 8px;
      color: #374151;
      width: 100%;
      line-height: 1.35;
      margin-top: 1.5mm;
    }
    .details div {
      margin-bottom: 0.8mm;
      word-wrap: break-word;
    }
    .details span {
      font-weight: bold;
      color: #1f2937;
    }
  </style>
</head>
<body>
  <div class="label-card">
    <div class="header">REFRIMAQ CONNECT</div>
    <div class="qr-code">
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrUrl)}" />
    </div>
    <div class="details">
      <div><span>Equipamento:</span> ${order.equip_type || '—'}</div>
      <div><span>Marca/Mod:</span> ${order.equip_brand || '—'} / ${order.equip_model || '—'}</div>
      <div><span>Nº Série:</span> ${order.equip_serial || '—'}</div>
      <div><span>CPF Máquina:</span> ${order.equipment_id ? order.equipment_id.substring(0, 8).toUpperCase() : '—'}</div>
      <div style="font-size: 7.5px; white-space: normal; line-height: 1.25;"><span>Cliente:</span> ${selectedCustomer?.name || '—'}</div>
    </div>
  </div>
</body>
</html>
    `;
    printHtml(html, `Etiqueta_Equipamento_${order.equip_serial || 'S-N'}.pdf`);
  }

  async function save() {
    if (!order.customer_id) { alert('Selecione um cliente.'); return; }
    setSaving(true);

    let equipmentId = order.equipment_id || null;
    const hasEquipmentData = order.equip_type || order.equip_brand || order.equip_model || order.equip_serial;

    if (hasEquipmentData) {
      const serial = order.equip_serial?.trim() || '';
      let existingEquip: any = null;

      if (serial) {
        const { data } = await supabase
          .from('customer_equipments')
          .select('id')
          .eq('customer_id', order.customer_id)
          .eq('equip_serial', serial)
          .maybeSingle();
        existingEquip = data;
      }

      const equipData = {
        customer_id: order.customer_id,
        equip_type: order.equip_type || '',
        equip_brand: order.equip_brand || '',
        equip_model: order.equip_model || '',
        equip_serial: serial,
        equip_gas: order.equip_gas || '',
        equip_voltage: order.equip_voltage || '',
      };

      if (existingEquip) {
        equipmentId = existingEquip.id;
        await supabase
          .from('customer_equipments')
          .update(equipData)
          .eq('id', equipmentId);
      } else {
        const { data } = await supabase
          .from('customer_equipments')
          .insert(equipData)
          .select('id')
          .single();
        if (data) {
          equipmentId = data.id;
        }
      }
    }
    
    // Calcula o labor_cost baseado em peças vs serviços
    const calculatedServices = parts.filter(p => !p.product_id).reduce((s, p) => s + p.quantity * p.unit_price, 0);
    const orderToSave = { ...order, equipment_id: equipmentId, labor_cost: calculatedServices, updated_at: new Date().toISOString() };

    if (isNew) {
      const { data } = await supabase
        .from('service_orders')
        .insert({ ...orderToSave })
        .select()
        .single();
      if (data) {
        const newId = (data as ServiceOrder).id;
        for (const part of parts) {
          await supabase.from('service_order_parts').insert({ ...part, service_order_id: newId });
        }
        setSaving(false);
        onBack();
        return;
      }
    } else {
      await supabase.from('service_orders').update(orderToSave).eq('id', orderId);
      const { data: existingParts } = await supabase.from('service_order_parts').select('id').eq('service_order_id', orderId);
      const existingIds = new Set((existingParts ?? []).map((p: { id: string }) => p.id));
      const currentIds = new Set(parts.map(p => p.id).filter(Boolean));
      for (const id of existingIds) {
        if (!currentIds.has(id)) {
          await supabase.from('service_order_parts').delete().eq('id', id);
        }
      }
      for (const part of parts) {
        if (part.id && existingIds.has(part.id)) {
          await supabase.from('service_order_parts').update({ part_name: part.part_name, quantity: part.quantity, unit_price: part.unit_price }).eq('id', part.id);
        } else if (!part.id) {
          await supabase.from('service_order_parts').insert({ ...part, service_order_id: orderId });
        }
      }
    }
    setSaving(false);
    onBack();
  }

  async function finalizeOS() {
    setFinalizing(true);

    // ── Operational closure only ──────────────────────────────────────────────
    // Does NOT touch paid_at, payment_method or status_financeiro.
    // Financial closure happens exclusively in the Financeiro module.
    await supabase.from('service_orders').update({
      status: 'Concluída',
      data_conclusao: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', orderId);

    // Decrement stock for parts linked to products (operational step)
    for (const part of parts) {
      if (part.product_id) {
        const prod = stockProducts.find(p => p.id === part.product_id);
        if (prod) {
          const after = Math.max(0, prod.stock_quantity - part.quantity);
          await supabase.from('products')
            .update({ stock_quantity: after })
            .eq('id', part.product_id);
            
          await supabase.from('stock_movements').insert({
            product_id: part.product_id,
            product_name: prod.name,
            movement_type: 'saida',
            quantity: part.quantity,
            quantity_before: prod.stock_quantity,
            quantity_after: after,
            reason: `Uso em OS #${order?.order_number}`,
            responsible: 'Sistema OS'
          });
        }
      }
    }

    setFinalizing(false);
    // Reload so isConcluida flips to true and we show the completion banner
    loadOrder();
  }

  const [canceling, setCanceling] = useState(false);

  async function cancelOS() {
    if (!window.confirm("Tem certeza que deseja cancelar esta Ordem de Serviço? Esta ação não pode ser desfeita e os lançamentos serão ajustados.")) return;
    setCanceling(true);

    try {
      const wasConcluded = order.status === 'Concluída';
      
      await supabase.from('service_orders').update({
        status: 'Cancelada',
        status_financeiro: 'cancelada',
        updated_at: new Date().toISOString(),
      }).eq('id', orderId);

      if (wasConcluded) {
        for (const part of parts) {
          if (part.product_id) {
            const prod = stockProducts.find(p => p.id === part.product_id);
            if (prod) {
              const after = prod.stock_quantity + part.quantity;
              await supabase.from('products')
                .update({ stock_quantity: after })
                .eq('id', part.product_id);
                
              await supabase.from('stock_movements').insert({
                product_id: part.product_id,
                product_name: prod.name,
                movement_type: 'entrada',
                quantity: part.quantity,
                quantity_before: prod.stock_quantity,
                quantity_after: after,
                reason: `Retorno por cancelamento de OS #${order?.order_number}`,
                responsible: 'Sistema OS'
              });
            }
          }
        }
      }

      await supabase.from('boletos')
        .update({ status: 'vencido', notes: `Boleto cancelado devido ao cancelamento da OS #${order?.order_number}` })
        .eq('service_order_id', orderId)
        .neq('status', 'pago');

      await loadOrder();
    } catch (err) {
      console.error(err);
      alert("Erro ao cancelar a Ordem de Serviço.");
    } finally {
      setCanceling(false);
    }
  }

  function addManualPart() {
    setParts(p => [...p, { product_id: null, part_name: '', quantity: 1, unit_price: 0 }]);
  }

  function addStockPart(prod: StockProduct) {
    setParts(p => [...p, { product_id: prod.id, part_name: prod.name, quantity: 1, unit_price: prod.unit_price }]);
  }

  function addStockService(svc: StockService) {
    setParts(p => [...p, { product_id: null, part_name: svc.name, quantity: 1, unit_price: svc.price }]);
  }

  function removePart(idx: number) {
    setParts(p => p.filter((_, i) => i !== idx));
  }

  function updatePart(idx: number, field: keyof OSPart, value: string | number | null) {
    setParts(p => p.map((part, i) => i === idx ? { ...part, [field]: value } : part));
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || isNew) return;
    if (attachments.length >= MAX_PHOTOS) { alert(`Máximo de ${MAX_PHOTOS} fotos por OS.`); return; }
    setUploadingPhoto(true);
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${orderId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('service-order-attachments').upload(path, file, { upsert: true });
    if (error) { alert('Erro ao enviar foto.'); setUploadingPhoto(false); return; }
    const { data: urlData } = supabase.storage.from('service-order-attachments').getPublicUrl(path);
    const { data: att } = await supabase
      .from('service_order_attachments')
      .insert({ service_order_id: orderId, photo_url: urlData.publicUrl })
      .select('id,photo_url')
      .single();
    if (att) setAttachments(a => [...a, att as unknown as Attachment]);
    setUploadingPhoto(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function deleteAttachment(att: Attachment) {
    
    setDeletingPhoto(att.id);
    await supabase.from('service_order_attachments').delete().eq('id', att.id);
    setAttachments(a => a.filter(x => x.id !== att.id));
    setDeletingPhoto(null);
  }

  const handleDownloadPhoto = async (url: string, index: number) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      const extension = url.split('.').pop()?.split('?')[0] || 'jpg';
      const orderNum = order.order_number ? String(order.order_number).padStart(4, '0') : 'OS';
      a.download = `OS_${orderNum}_foto_${index + 1}.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      console.error(e);
      window.open(url, '_blank');
    }
  };

  function exportPDF() {
    const totalParts = parts.filter(p => p.product_id).reduce((s, p) => s + p.quantity * p.unit_price, 0);
    const totalServices = parts.filter(p => !p.product_id).reduce((s, p) => s + p.quantity * p.unit_price, 0);
    const totalAmount = totalParts + totalServices;
    const tech = technicians.find(t => t.id === order.technician_id);
    const cfg = companyConfig;

    const photosHtml = attachments.length > 0
      ? `<div class="photos-grid">${attachments.map(a => `<img src="${a.photo_url}" alt="Foto do atendimento" />`).join('')}</div>`
      : '';

    const partsRows = parts.length > 0
      ? parts.map(p => `
          <tr>
            <td>${p.part_name}</td>
            <td class="center">${p.quantity}</td>
            <td class="right">R$ ${p.unit_price.toFixed(2)}</td>
            <td class="right">R$ ${(p.quantity * p.unit_price).toFixed(2)}</td>
          </tr>`).join('')
      : '<tr><td colspan="4" class="center muted">Nenhuma peça registrada</td></tr>';

    const logoHtml = cfg.logo_url
      ? `<img src="${cfg.logo_url}" alt="Logo" style="height:72px;object-fit:contain;max-width:200px;" />`
      : '';

    const companyBlock = `
      <div style="display:flex;align-items:center;gap:12px;">
        ${logoHtml}
        <div>
          <div style="font-size:18px;font-weight:800;color:#1e293b;">${cfg.company_name || 'Empresa'}</div>
          ${cfg.razao_social ? `<div style="font-size:11px;color:#64748b;">${cfg.razao_social}</div>` : ''}
          ${cfg.cnpj ? `<div style="font-size:11px;color:#64748b;">CNPJ: ${cfg.cnpj}</div>` : ''}
          ${cfg.address ? `<div style="font-size:11px;color:#64748b;">${cfg.address}</div>` : ''}
          ${cfg.phone || cfg.email ? `<div style="font-size:11px;color:#64748b;">${[cfg.phone, cfg.email].filter(Boolean).join(' · ')}</div>` : ''}
        </div>
      </div>`;

    const pixBlock = (cfg.pix_key || cfg.bank_name) ? `
      <div style="margin-top:8px;padding:8px 12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;font-size:11px;color:#166534;">
        ${cfg.pix_key ? `<strong>Chave PIX (${cfg.pix_key_type || 'PIX'}):</strong> ${cfg.pix_key}` : ''}
        ${cfg.bank_name ? ` &nbsp;·&nbsp; <strong>Banco:</strong> ${cfg.bank_name}` : ''}
        ${cfg.agency ? ` Ag. ${cfg.agency}` : ''}
        ${cfg.account_number ? ` Cc. ${cfg.account_number}` : ''}
        ${cfg.account_holder ? ` — ${cfg.account_holder}` : ''}
      </div>` : '';

    const footerText = [cfg.pdf_footer, cfg.warranty_policy, cfg.os_notes].filter(Boolean).join(' | ');

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>OS #${String(order.order_number ?? 0).padStart(4, '0')}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #1e293b; padding: 32px; }
  .os-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #f59e0b; }
  .os-title { font-size: 22px; font-weight: 800; color: #1e293b; }
  .badge { display: inline-block; background: #f59e0b; color: #fff; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 999px; margin-top: 4px; }
  .meta { text-align: right; color: #64748b; font-size: 12px; line-height: 1.6; }
  section { margin-bottom: 20px; page-break-inside: avoid; break-inside: avoid; }
  .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; margin-bottom: 8px; }
  .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; page-break-inside: avoid; break-inside: avoid; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; }
  .info-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 24px; }
  .info-item label { font-size: 11px; color: #94a3b8; display: block; margin-bottom: 2px; }
  .info-item span { font-weight: 600; color: #1e293b; }
  .diagnosis { white-space: pre-wrap; color: #475569; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f8fafc; padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid #e2e8f0; }
  td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; font-size: 12px; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  .center { text-align: center; }
  .right { text-align: right; }
  .muted { color: #94a3b8; }
  .totals { margin-top: 8px; border-top: 2px solid #f1f5f9; }
  .totals td { font-weight: 600; }
  .total-row td { font-size: 14px; font-weight: 800; color: #16a34a; }
  .photos-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 8px; }
  .photos-grid img { width: 100%; height: 140px; object-fit: cover; border-radius: 6px; border: 1px solid #e2e8f0; page-break-inside: avoid; break-inside: avoid; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; page-break-inside: avoid; break-inside: avoid; }
  @media print { 
    @page { margin: 10mm; }
    body { padding: 0; font-size: 10px; } 
    .os-title { font-size: 18px; }
    .card { padding: 8px 10px; }
    section { margin-bottom: 12px; }
    .photos-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .photos-grid img { width: 100%; height: 40vh; object-fit: contain; }
    td, th { padding: 4px 6px; font-size: 10px; }
    .info-item label, .section-title { font-size: 9px; }
  }
</style>
</head>
<body>

<!-- Company header -->
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #f59e0b;">
  ${companyBlock}
  <div style="text-align:right;">
    <div style="font-size:22px;font-weight:800;">OS #${String(order.order_number ?? 0).padStart(4, '0')}</div>
    <div class="badge">${order.status ?? ''}</div>
    <div style="font-size:11px;color:#64748b;margin-top:6px;line-height:1.6;">
      <div><strong>Tipo:</strong> ${order.visit_type ?? ''}</div>
      <div><strong>Prioridade:</strong> ${order.priority ?? ''}</div>
      <div><strong>Emissão:</strong> ${new Date(order.created_at ?? Date.now()).toLocaleDateString('pt-BR')}</div>
      ${order.paid_at ? `<div><strong>Pago em:</strong> ${new Date(order.paid_at).toLocaleDateString('pt-BR')}</div>` : ''}
    </div>
  </div>
</div>

<section>
  <div class="section-title">Cliente</div>
  <div class="card">
    <div class="info-grid">
      <div class="info-item"><label>Nome</label><span>${selectedCustomer?.name ?? '—'}</span></div>
      <div class="info-item"><label>Cidade</label><span>${selectedCustomer?.city ?? '—'}</span></div>
      <div class="info-item"><label>Telefone</label><span>${selectedCustomer?.phone ?? '—'}</span></div>
      <div class="info-item"><label>Técnico</label><span>${tech?.full_name ?? '— Não atribuído —'}</span></div>
    </div>
  </div>
</section>

${(order.equip_type || order.equip_brand || order.equip_model || order.equip_serial || order.equip_gas || order.equip_voltage || order.equip_accessories || order.equip_condition) ? `
<section>
  <div class="section-title">Identificação do Equipamento</div>
  <div class="card">
    <div class="info-grid-3">
      ${order.equip_type ? `<div class="info-item"><label>Tipo de Equipamento</label><span>${order.equip_type}</span></div>` : ''}
      ${order.equip_gas ? `<div class="info-item"><label>Gás Refrigerante</label><span>${order.equip_gas}</span></div>` : ''}
      ${order.equip_brand ? `<div class="info-item"><label>Marca</label><span>${order.equip_brand}</span></div>` : ''}
      ${order.equip_model ? `<div class="info-item"><label>Modelo</label><span>${order.equip_model}</span></div>` : ''}
      ${order.equip_serial ? `<div class="info-item"><label>Nº de Série / Patrimônio</label><span style="font-family:monospace">${order.equip_serial}</span></div>` : ''}
      ${order.equip_voltage ? `<div class="info-item"><label>Voltagem</label><span>${order.equip_voltage}</span></div>` : ''}
    </div>
    ${order.equip_accessories ? `<div style="margin-top:10px;"><label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:2px;">Acessórios Inclusos e Conexões</label><p style="color:#475569;white-space:pre-wrap;">${order.equip_accessories.replace(/</g, '&lt;')}</p></div>` : ''}
    ${order.equip_condition ? `<div style="margin-top:10px;"><label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:2px;">Estado Geral de Conservação</label><p style="color:#475569;white-space:pre-wrap;">${order.equip_condition.replace(/</g, '&lt;')}</p></div>` : ''}
  </div>
</section>` : ''}

<section>
  <div class="section-title">Diagnóstico / Descrição</div>
  <div class="card">
    <p class="diagnosis">${order.diagnosis ? order.diagnosis.replace(/</g, '&lt;') : 'Não informado.'}</p>
  </div>
</section>

<section>
  <div class="section-title">Peças e Serviços</div>
  <div class="card" style="padding: 0; overflow: hidden;">
    <table>
      <thead>
        <tr>
          <th>Descrição</th>
          <th class="center">Qtd.</th>
          <th class="right">Unit.</th>
          <th class="right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${partsRows}
      </tbody>
      <tfoot class="totals">
        <tr>
          <td colspan="3" class="right">Peças</td>
          <td class="right">R$ ${totalParts.toFixed(2)}</td>
        </tr>
        <tr>
          <td colspan="3" class="right">Serviços</td>
          <td class="right">R$ ${totalServices.toFixed(2)}</td>
        </tr>
        <tr class="total-row">
          <td colspan="3" class="right">Total</td>
          <td class="right">R$ ${totalAmount.toFixed(2)}</td>
        </tr>
      </tfoot>
    </table>
  </div>
</section>

${order.payment_method ? `
<section>
  <div class="section-title">Pagamento</div>
  <div class="card">
    <span><strong>Forma de pagamento:</strong> ${order.payment_method}</span>
    ${order.paid_at ? ` &nbsp;·&nbsp; <strong>Data:</strong> ${new Date(order.paid_at).toLocaleDateString('pt-BR')}` : ''}
  </div>
</section>` : ''}

<!-- PIX & bank info -->
${pixBlock}

${attachments.length > 0 ? `
<section style="page-break-before: always; break-before: page; page-break-inside: auto; break-inside: auto;">
  <div class="section-title">Fotos do Atendimento (${attachments.length})</div>
  ${photosHtml}
</section>` : ''}

<!-- Footer -->
<div class="footer">
  ${footerText ? `<p style="margin-bottom:4px;">${footerText.replace(/</g,'&lt;')}</p>` : ''}
  <div style="display:flex;justify-content:space-between;margin-top:6px;">
    <span>Gerado em ${new Date().toLocaleString('pt-BR')}</span>
    <span>OS #${String(order.order_number ?? 0).padStart(4, '0')} · ${selectedCustomer?.name ?? ''}</span>
  </div>
</div>
</body>
</html>`;

    const cleanCustomerName = (selectedCustomer?.name ?? '').replace(/[/\\?%*:|"<>]/g, '').trim();
    printHtml(html, `OS_${String(order.order_number ?? 0).padStart(4, '0')}_${cleanCustomerName}.pdf`);
  }


  const filteredStock = stockSearch.trim()
    ? stockProducts.filter(p => p.name.toLowerCase().includes(stockSearch.toLowerCase()))
    : stockProducts;

  const filteredServices = stockSearch.trim()
    ? stockServices.filter(s => s.name.toLowerCase().includes(stockSearch.toLowerCase()) || s.category.toLowerCase().includes(stockSearch.toLowerCase()))
    : stockServices;

  const filteredCustomers = customerSearch
    ? customers.filter(c => 
        (c.name || '').toLowerCase().includes(customerSearch.toLowerCase()) || 
        (c.city || '').toLowerCase().includes(customerSearch.toLowerCase()) ||
        (c.phone || '').includes(customerSearch)
      )
    : customers.slice(0, 10);

  const isConcluida = order.status === 'Concluída';
  const isCanceled = order.status === 'Cancelada';
  const isReadOnly = isConcluida || isCanceled;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={28} className="text-amber-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full transition-colors duration-300 ${isCanceled ? 'bg-red-50/20' : 'bg-slate-50'}`}>
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4">
        <div className="flex items-center gap-3 mb-4">
          <button className="lg:hidden text-slate-500" onClick={onMenuClick}>
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-600">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-slate-800">
              {isNew ? 'Nova OS' : `OS #${String(order.order_number ?? 0).padStart(4, '0')}`}
            </h1>
            {selectedCustomer && (
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 truncate">
                <p className="text-sm text-slate-500 truncate">{selectedCustomer.name} · {selectedCustomer.city}</p>
                {(order.equip_model || order.equip_serial) && (
                  <span className="text-sm font-semibold text-amber-600 truncate">
                    {order.equip_model}{order.equip_model && order.equip_serial ? ' · ' : ''}{order.equip_serial && <span className="font-mono">{order.equip_serial}</span>}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isNew && (
              <button
                onClick={exportPDF}
                title="Exportar PDF"
                className="flex items-center gap-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <Download size={14} />
                <span className="hidden sm:inline">PDF</span>
              </button>
            )}
            {!isReadOnly && (
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Salvar
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto scrollbar-hide">
          {([
            { id: 'details', label: 'Detalhes', icon: FileText },
            { id: 'parts',   label: 'Peças',    icon: Package },
            { id: 'pdv',     label: 'PDV',       icon: CreditCard },
            { id: 'history', label: 'Histórico', icon: History },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-shrink-0 ${tab === id ? 'bg-amber-500 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isCanceled && (
          <div className="max-w-2xl mx-auto mb-4 bg-red-600 text-white font-extrabold text-center py-3.5 px-4 rounded-2xl shadow-lg flex items-center justify-center gap-2 uppercase tracking-widest text-xs border border-red-700 animate-pulse">
            <AlertCircle size={16} />
            Ordem de Serviço Cancelada
          </div>
        )}
        {/* DETALHES TAB */}
        {tab === 'details' && (
          <div className={`space-y-4 max-w-2xl ${isCanceled ? 'bg-red-50/50 p-4 rounded-2xl border-2 border-red-400/40 shadow-inner' : ''}`}>
            {/* Customer */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Cliente</h3>
              {selectedCustomer ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-lg text-slate-800">{selectedCustomer.name}</p>
                    {(order.equip_model || order.equip_serial) && (
                      <p className="text-base font-semibold text-amber-600 mt-0.5">
                        {order.equip_model}
                        {order.equip_model && order.equip_serial && <span className="mx-1.5 text-amber-300">·</span>}
                        {order.equip_serial && <span className="font-mono">{order.equip_serial}</span>}
                      </p>
                    )}
                    <p className="text-sm text-slate-500 mt-0.5">{selectedCustomer.city} · {selectedCustomer.phone}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => onSelectCustomer(selectedCustomer.id)} className="text-xs text-amber-600 hover:underline">Ver perfil</button>
                    {!isReadOnly && (
                      <button onClick={() => { setSelectedCustomer(null); setOrder(o => ({ ...o, customer_id: '' })); }} className="text-xs text-slate-400 hover:text-red-500">Remover</button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Buscar cliente..."
                    value={customerSearch}
                    onChange={e => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); }}
                    onFocus={() => setShowCustomerDropdown(true)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
                  />
                  {showCustomerDropdown && filteredCustomers.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {filteredCustomers.map(c => (
                        <button
                          key={c.id}
                          onClick={() => { setSelectedCustomer(c); setOrder(o => ({ ...o, customer_id: c.id })); setCustomerSearch(''); setShowCustomerDropdown(false); }}
                          className="w-full text-left px-3 py-2 hover:bg-amber-50 text-sm"
                        >
                          <span className="font-medium">{c.name}</span>
                          <span className="text-slate-400 text-xs ml-2">{c.city}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Order details */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-700">Dados da OS</h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-500 font-medium block mb-1">Tipo de Visita</label>
                  <select
                    disabled={isReadOnly}
                    value={order.visit_type ?? 'Corretiva'}
                    onChange={e => setOrder(o => ({ ...o, visit_type: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    {VISIT_TYPES.map(v => <option key={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-medium block mb-1">Garantia / Reprocesso</label>
                  <select
                    disabled={isReadOnly}
                    value={order.warranty_type ?? ''}
                    onChange={e => setOrder(o => ({ ...o, warranty_type: e.target.value || null }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    <option value="">Normal (Nenhum)</option>
                    <option value="Garantia Memo">Garantia Memo</option>
                    <option value="Reprocesso Metalfrio">Reprocesso Metalfrio</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-medium block mb-1">Prioridade</label>
                  <select
                    disabled={isReadOnly}
                    value={order.priority ?? 'Média'}
                    onChange={e => setOrder(o => ({ ...o, priority: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium block mb-1">Status</label>
                <select
                  disabled={isReadOnly}
                  value={order.status ?? 'Triagem'}
                  onChange={e => setOrder(o => ({ ...o, status: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 disabled:bg-slate-50 disabled:text-slate-400"
                >
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium block mb-1">Técnico Responsável</label>
                <select
                  disabled={isReadOnly}
                  value={order.technician_id ?? ''}
                  onChange={e => setOrder(o => ({ ...o, technician_id: e.target.value || null }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <option value="">— Não atribuído —</option>
                  {technicians.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  id="is_rework"
                  disabled={isReadOnly}
                  checked={order.is_rework ?? false}
                  onChange={e => setOrder(o => ({ ...o, is_rework: e.target.checked }))}
                  className="w-4 h-4 text-amber-600 border-slate-300 rounded focus:ring-amber-500"
                />
                <label htmlFor="is_rework" className="text-sm text-slate-700 font-medium cursor-pointer">
                  Este serviço é um retrabalho?
                </label>
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium block mb-1">Diagnóstico / Descrição</label>
                <textarea
                  disabled={isReadOnly}
                  rows={4}
                  value={order.diagnosis ?? ''}
                  onChange={e => setOrder(o => ({ ...o, diagnosis: e.target.value }))}
                  placeholder="Descreva o problema e o diagnóstico..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 disabled:bg-slate-50 disabled:text-slate-400 resize-none"
                />
              </div>
            </div>

            {/* Equipment Identification */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-amber-100 text-amber-600">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
                  </span>
                  Identificação do Equipamento
                </h3>
                {!isNew && (order.equipment_id || order.equip_serial) && (
                  <button
                    type="button"
                    onClick={handleOpenQRModal}
                    className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors border border-amber-200"
                  >
                    <QrCode size={13} />
                    Imprimir QR Code / CPF
                  </button>
                )}
              </div>

              {/* Search Bar for Machine Autofill */}
              {isNew && !isReadOnly && (
                <div className="relative">
                  <label className="text-xs font-bold text-amber-600 block mb-1 uppercase tracking-wider">
                    Buscar Máquina Cadastrada (Série ou CPF)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={equipSearchQuery}
                      onChange={e => searchEquipments(e.target.value)}
                      placeholder="Digite o Nº de Série ou os 8 dígitos do CPF da Máquina..."
                      className="w-full border border-amber-200 focus:border-amber-500 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                    />
                    <Search size={14} className="absolute left-3 top-3 text-slate-400" />
                    {searchingEquip && (
                      <div className="absolute right-3 top-2.5">
                        <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>

                  {/* Suggestions List */}
                  {foundEquipments.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden divide-y divide-slate-100 max-h-60 overflow-y-auto">
                      {foundEquipments.map((eq) => (
                        <button
                          key={eq.id}
                          type="button"
                          onClick={() => {
                            setOrder(o => ({
                              ...o,
                              equipment_id: eq.id,
                              equip_type: eq.equip_type,
                              equip_brand: eq.equip_brand,
                              equip_model: eq.equip_model,
                              equip_serial: eq.equip_serial,
                              equip_gas: eq.equip_gas,
                              equip_voltage: eq.equip_voltage,
                            }));
                            setEquipSearchQuery('');
                            setFoundEquipments([]);
                          }}
                          className="w-full text-left p-3 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4"
                        >
                          <div>
                            <p className="font-bold text-slate-800 text-xs leading-none uppercase">
                              {eq.equip_brand} {eq.equip_model} ({eq.equip_type})
                            </p>
                            <p className="text-[10px] text-slate-400 mt-1 font-semibold">
                              S/N: {eq.equip_serial || '—'} | CPF: {eq.id.substring(0, 8).toUpperCase()}
                            </p>
                          </div>
                          <span className="text-[9px] bg-amber-100 text-amber-800 font-extrabold px-2 py-0.5 rounded uppercase flex-shrink-0">
                            Selecionar
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 font-medium block mb-1">Tipo de Equipamento</label>
                  <select
                    disabled={isReadOnly}
                    value={order.equip_type ?? ''}
                    onChange={e => setOrder(o => ({ ...o, equip_type: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    <option value="">— Selecione —</option>
                    <option>Chopeira Elétrica</option>
                    <option>Chopeira Gelo</option>
                    <option>Pré Resfriador</option>
                    <option>Torre</option>
                    <option>Freezer Comercial</option>
                    <option>Câmara Fria</option>
                    <option>Balcão Refrigerado</option>
                    <option>Bebedouro</option>
                    <option>Ar Condicionado</option>
                    <option>Outro</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-medium block mb-1">Gás Refrigerante</label>
                  <select
                    disabled={isReadOnly}
                    value={order.equip_gas ?? ''}
                    onChange={e => setOrder(o => ({ ...o, equip_gas: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    <option value="">— Selecione —</option>
                    <option>R134a</option>
                    <option>R404A</option>
                    <option>R290</option>
                    <option>R22</option>
                    <option>R410A</option>
                    <option>R600a</option>
                    <option>R507</option>
                    <option>Não se aplica</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 font-medium block mb-1">Marca</label>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={order.equip_brand ?? ''}
                    onChange={e => setOrder(o => ({ ...o, equip_brand: e.target.value }))}
                    placeholder="Ex: Memo, Gelopar, Metalfrio"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 disabled:bg-slate-50 disabled:text-slate-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-medium block mb-1">Modelo</label>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={order.equip_model ?? ''}
                    onChange={e => setOrder(o => ({ ...o, equip_model: e.target.value }))}
                    placeholder="Ex: Slim 50L, Premium Plus"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 disabled:bg-slate-50 disabled:text-slate-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 font-medium block mb-1">Nº de Série / Patrimônio</label>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={order.equip_serial ?? ''}
                    onChange={e => setOrder(o => ({ ...o, equip_serial: e.target.value }))}
                    placeholder="Ex: SN-20240512-001"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 disabled:bg-slate-50 disabled:text-slate-400 font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-medium block mb-1">Voltagem</label>
                  <div className="flex items-center gap-3 mt-2">
                    {['110V', '220V', '380V Trifásico'].map(v => (
                      <label key={v} className={`flex items-center gap-1.5 cursor-pointer text-sm ${isReadOnly ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        <input
                          type="radio"
                          name="equip_voltage"
                          value={v}
                          disabled={isReadOnly}
                          checked={order.equip_voltage === v}
                          onChange={() => setOrder(o => ({ ...o, equip_voltage: v }))}
                          className="accent-amber-500"
                        />
                        <span className="text-slate-700 text-xs font-medium">{v}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-500 font-medium block mb-1">Acessórios Inclusos e Conexões</label>
                <textarea
                  disabled={isReadOnly}
                  rows={2}
                  value={order.equip_accessories ?? ''}
                  onChange={e => setOrder(o => ({ ...o, equip_accessories: e.target.value }))}
                  placeholder="Ex: 2 torneiras tipo Italiana, 1 válvula extratora tipo A, mangueiras atóxicas, cilindro CO2 4kg vazio..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 disabled:bg-slate-50 disabled:text-slate-400 resize-none"
                />
              </div>

              <div>
                <label className="text-xs text-slate-500 font-medium block mb-1">Estado Geral de Conservação</label>
                <textarea
                  disabled={isReadOnly}
                  rows={2}
                  value={order.equip_condition ?? ''}
                  onChange={e => setOrder(o => ({ ...o, equip_condition: e.target.value }))}
                  placeholder="Ex: Carenagem de inox com riscos superficiais, bandeja de gotejamento trincada, pontos de oxidação no compressor..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 disabled:bg-slate-50 disabled:text-slate-400 resize-none"
                />
              </div>
            </div>

            {/* Photos */}
            {!isNew && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-700">
                    Fotos do Atendimento
                    <span className="ml-2 text-xs font-normal text-slate-400">{attachments.length}/{MAX_PHOTOS}</span>
                  </h3>
                  {attachments.length < MAX_PHOTOS && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingPhoto}
                      className="flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:text-amber-700 disabled:opacity-50"
                    >
                      {uploadingPhoto ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
                      {uploadingPhoto ? 'Enviando...' : 'Adicionar foto'}
                    </button>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                </div>

                {attachments.length === 0 && !uploadingPhoto && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-24 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center gap-1.5 text-slate-400 hover:border-amber-300 hover:text-amber-500 hover:bg-amber-50/50 transition-colors"
                  >
                    <Camera size={20} />
                    <span className="text-xs">Clique para adicionar fotos (até {MAX_PHOTOS})</span>
                  </button>
                )}

                {(attachments.length > 0 || uploadingPhoto) && (
                  <div className="grid grid-cols-3 gap-2">
                    {attachments.map((att, idx) => (
                      <div key={att.id} className="relative group aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                        <img
                          src={att.photo_url}
                          alt="Foto do atendimento"
                          className="w-full h-full object-cover cursor-zoom-in"
                          onClick={() => setLightboxUrl(att.photo_url)}
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleDownloadPhoto(att.photo_url, idx)}
                            title="Baixar Foto"
                            className="opacity-0 group-hover:opacity-100 transition-opacity bg-amber-500 text-white rounded-full p-1.5 shadow hover:bg-amber-600"
                          >
                            <Download size={12} />
                          </button>
                          <button
                            onClick={() => deleteAttachment(att)}
                            disabled={deletingPhoto === att.id}
                            title="Excluir Foto"
                            className="opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 text-white rounded-full p-1.5 shadow hover:bg-red-600 disabled:opacity-50"
                          >
                            {deletingPhoto === att.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                          </button>
                        </div>
                      </div>
                    ))}
                    {uploadingPhoto && (
                      <div className="aspect-square rounded-lg border-2 border-dashed border-amber-300 bg-amber-50 flex items-center justify-center">
                        <Loader2 size={20} className="text-amber-500 animate-spin" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

          </div>
        )}

        {/* PEÇAS TAB */}
        {tab === 'parts' && (
          <div className="space-y-4 max-w-2xl">

            {/* Add from stock */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Adicionar do Estoque</h3>

              {/* Tabs: Peças / Serviços */}
              <div className="flex gap-1 p-1 bg-slate-100 rounded-lg mb-3 w-fit">
                <button
                  onClick={() => setStockTab('parts')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${stockTab === 'parts' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <Package size={13} />
                  Peças ({stockProducts.length})
                </button>
                <button
                  onClick={() => setStockTab('services')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${stockTab === 'services' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <Wrench size={13} />
                  Serviços ({stockServices.length})
                </button>
              </div>

              {/* Search */}
              <div className="relative mb-3">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder={stockTab === 'parts' ? 'Pesquisar peça...' : 'Pesquisar serviço...'}
                  value={stockSearch}
                  onChange={e => setStockSearch(e.target.value)}
                  className="w-full pl-8 pr-4 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
                />
              </div>

              {/* Peças list */}
              {stockTab === 'parts' && (
                <div className="grid grid-cols-1 gap-2 max-h-52 overflow-y-auto">
                  {filteredStock.length === 0 ? (
                    <p className="text-sm text-slate-400 py-2 text-center">
                      {stockProducts.length === 0 ? 'Nenhum produto cadastrado no estoque.' : `Nenhum resultado para "${stockSearch}"`}
                    </p>
                  ) : (
                    filteredStock.map(prod => (
                      <div key={prod.id} className="flex items-center justify-between border border-slate-100 rounded-lg px-3 py-2">
                        <div>
                          <p className="text-sm font-medium text-slate-700">{prod.name}</p>
                          <p className="text-xs text-slate-400">Estoque: {prod.stock_quantity} · R$ {prod.unit_price.toFixed(2)}</p>
                        </div>
                        <button
                          disabled={isReadOnly}
                          onClick={() => addStockPart(prod)}
                          className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-600 rounded-lg transition-colors disabled:opacity-40"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Serviços list */}
              {stockTab === 'services' && (
                <div className="grid grid-cols-1 gap-2 max-h-52 overflow-y-auto">
                  {filteredServices.length === 0 ? (
                    <p className="text-sm text-slate-400 py-2 text-center">
                      {stockServices.length === 0 ? 'Nenhum serviço cadastrado.' : `Nenhum resultado para "${stockSearch}"`}
                    </p>
                  ) : (
                    filteredServices.map(svc => (
                      <div key={svc.id} className="flex items-center justify-between border border-slate-100 rounded-lg px-3 py-2">
                        <div>
                          <p className="text-sm font-medium text-slate-700">{svc.name}</p>
                          <p className="text-xs text-slate-400">
                            {svc.category}
                            {svc.estimated_time ? ` · ${svc.estimated_time}` : ''}
                            {' · '}R$ {svc.price.toFixed(2)}
                          </p>
                        </div>
                        <button
                          disabled={isReadOnly}
                          onClick={() => addStockService(svc)}
                          className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors disabled:opacity-40"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}

              {!isReadOnly && (
                <button
                  onClick={addManualPart}
                  className="mt-3 flex items-center gap-1.5 text-sm text-slate-600 hover:text-amber-600 transition-colors"
                >
                  <Plus size={14} />
                  Adicionar item manual
                </button>
              )}
            </div>

            {/* Parts list */}
            {parts.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-700">Peças da OS</h3>
                  <span className="text-xs text-slate-400">{parts.length} {parts.length === 1 ? 'item' : 'itens'}</span>
                </div>
                {/* Column headers */}
                <div className="grid grid-cols-12 gap-2 mb-1 px-0.5">
                  <span className="col-span-5 text-xs text-slate-400 font-medium">Descrição</span>
                  <span className="col-span-2 text-xs text-slate-400 font-medium">Qtd</span>
                  <span className="col-span-3 text-xs text-slate-400 font-medium">Preço unit.</span>
                  <span className="col-span-2 text-xs text-slate-400 font-medium text-right">Subtotal</span>
                </div>
                <div className="space-y-2">
                  {parts.map((part, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center group">
                      <div className="col-span-5">
                        <input
                          type="text"
                          disabled={isReadOnly}
                          value={part.part_name}
                          onChange={e => updatePart(idx, 'part_name', e.target.value)}
                          placeholder="Nome da peça"
                          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/30 disabled:bg-slate-50"
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          disabled={isReadOnly}
                          min={0}
                          step="any"
                          value={part.quantity}
                          onChange={e => updatePart(idx, 'quantity', parseFloat(e.target.value) || 0)}
                          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/30 disabled:bg-slate-50"
                        />
                      </div>
                      <div className="col-span-3">
                        <input
                          type="number"
                          disabled={isReadOnly}
                          min={0}
                          step={0.01}
                          value={part.unit_price}
                          onChange={e => updatePart(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/30 disabled:bg-slate-50"
                        />
                      </div>
                      <div className="col-span-2 flex items-center justify-end gap-1">
                        <span className="text-xs font-medium text-slate-600 group-hover:hidden">
                          R$ {(part.quantity * part.unit_price).toFixed(2)}
                        </span>
                        {!isReadOnly && (
                          <button onClick={() => removePart(idx)} className="hidden group-hover:flex p-1 text-slate-300 hover:text-red-500 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-sm font-semibold text-slate-700 pt-3 mt-2 border-t border-slate-100">
                  <span>Total itens ({parts.length})</span>
                  <span className="text-green-600">
                    R$ {parts.reduce((s, p) => s + p.quantity * p.unit_price, 0).toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PDV TAB */}
        {tab === 'pdv' && (
          <div className="space-y-4 max-w-2xl">
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-700">Faturamento</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Peças</span>
                  <span className="font-medium">R$ {parts.filter(p => p.product_id).reduce((s, p) => s + p.quantity * p.unit_price, 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Serviços</span>
                  <span className="font-medium">R$ {parts.filter(p => !p.product_id).reduce((s, p) => s + p.quantity * p.unit_price, 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-base font-bold border-t border-slate-200 pt-2">
                  <span className="text-slate-800">Total</span>
                  <span className="text-green-600">R$ {parts.reduce((s, p) => s + p.quantity * p.unit_price, 0).toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-700">Forma de Pagamento</h3>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.map(pm => (
                  <button
                    key={pm}
                    disabled={isReadOnly}
                    onClick={() => setOrder(o => ({ ...o, payment_method: pm }))}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${order.payment_method === pm ? 'bg-amber-500 text-white border-amber-500' : 'border-slate-200 text-slate-600 hover:border-amber-300 hover:bg-amber-50'} disabled:opacity-50`}
                  >
                    {pm}
                  </button>
                ))}
              </div>
              {!isReadOnly && (
                <p className="text-xs text-slate-400">
                  A forma de pagamento é registrada no módulo Financeiro após a conclusão operacional.
                </p>
              )}
            </div>

            {!isNew && !isReadOnly && (
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={finalizeOS}
                  disabled={finalizing}
                  className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-3 rounded-xl font-semibold text-sm transition-colors"
                >
                  {finalizing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  Concluir OS Operacionalmente
                </button>
                <button
                  onClick={cancelOS}
                  disabled={canceling}
                  className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white py-3 rounded-xl font-semibold text-sm transition-colors"
                >
                  {canceling ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
                  Cancelar Ordem de Serviço
                </button>
              </div>
            )}

            {isConcluida && (
              <div className="space-y-3">
                <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl p-4 text-green-700">
                  <CheckCircle2 size={20} className="flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm">OS Concluída Operacionalmente</p>
                    <p className="text-xs mt-0.5">
                      Serviço encerrado em {formatDateTime((order as { data_conclusao?: string }).data_conclusao ?? order.updated_at ?? null)}.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800">
                  <CreditCard size={20} className="flex-shrink-0 mt-0.5 text-amber-500" />
                  <div>
                    <p className="font-semibold text-sm">Pagamento pendente no módulo Financeiro</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      O pagamento desta OS deve ser registrado no módulo <strong>Financeiro</strong> — acesse pelo menu lateral para registrar a forma de pagamento, emitir boleto ou marcar como pago.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {isCanceled && (
              <div className="space-y-3">
                <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
                  <AlertCircle size={20} className="flex-shrink-0 mt-0.5 text-red-500" />
                  <div>
                    <p className="font-semibold text-sm">OS Cancelada</p>
                    <p className="text-xs mt-0.5">
                      Esta ordem de serviço foi cancelada em {formatDateTime(order.updated_at ?? null)} e os lançamentos de estoque e financeiro correspondentes foram anulados.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* HISTORY TAB */}
        {tab === 'history' && (
          <div className="space-y-3 max-w-2xl">
            {history.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <History size={32} className="mx-auto mb-2 opacity-30" />
                <p>Nenhum histórico encontrado</p>
              </div>
            ) : (
              history.map(h => (
                <div key={h.id} className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-semibold text-sm text-slate-800">{h.subject}</p>
                    <span className="text-xs text-slate-400 flex-shrink-0">{formatDateTime(h.contacted_at)}</span>
                  </div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{h.contact_type}</p>
                  {h.details && <p className="text-sm text-slate-600">{h.details}</p>}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <button
              className="text-white/80 hover:text-white bg-black/40 rounded-full p-2"
              onClick={(e) => {
                e.stopPropagation();
                const idx = attachments.findIndex(a => a.photo_url === lightboxUrl);
                handleDownloadPhoto(lightboxUrl, idx !== -1 ? idx : 0);
              }}
              title="Baixar Foto"
            >
              <Download size={20} />
            </button>
            <button
              className="text-white/80 hover:text-white bg-black/40 rounded-full p-2"
              onClick={() => setLightboxUrl(null)}
              title="Fechar"
            >
              <X size={20} />
            </button>
          </div>
          <img
            src={lightboxUrl}
            alt="Foto ampliada"
            className="max-w-full max-h-full rounded-xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
      {/* QR Code / CPF Modal */}
      {showQRModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
            {/* Header */}
            <div className="bg-amber-500 px-6 py-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <QrCode size={20} />
                <h3 className="font-bold text-lg">CPF da Máquina (QR Code)</h3>
              </div>
              <button 
                onClick={() => setShowQRModal(false)}
                className="text-white/80 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 flex flex-col items-center">
              <p className="text-sm text-slate-500 text-center mb-6">
                Cole esta etiqueta na máquina para que qualquer pessoa possa acompanhar o histórico completo de manutenções dela.
              </p>

              {/* Label Preview (Square 1:1 format to match 5x5cm) */}
              <div className="border-2 border-amber-500 rounded-xl p-4 w-64 h-64 bg-white shadow-md flex flex-col justify-between items-center text-center">
                <div className="font-bold text-amber-600 text-xs tracking-wider border-b border-amber-100 pb-1 w-full text-center">
                  REFRIMAQ CONNECT
                </div>
                <div className="w-28 h-28 my-1 bg-slate-50 flex items-center justify-center border border-slate-100 rounded-lg overflow-hidden">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(
                      `${window.location.origin}/?publicEquipmentId=${order.equipment_id || ''}`
                    )}`}
                    alt="QR Code"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="text-left text-[10px] text-slate-700 w-full space-y-0.5 leading-tight">
                  <div className="truncate"><span className="font-semibold text-slate-900">Equipamento:</span> {order.equip_type || '—'}</div>
                  <div className="truncate"><span className="font-semibold text-slate-900">Marca/Mod:</span> {order.equip_brand || '—'} / {order.equip_model || '—'}</div>
                  <div className="truncate"><span className="font-semibold text-slate-900">Série:</span> {order.equip_serial || '—'}</div>
                  <div className="truncate"><span className="font-semibold text-slate-900">CPF Máquina:</span> {order.equipment_id ? order.equipment_id.substring(0, 8).toUpperCase() : '—'}</div>
                  <div className="truncate"><span className="font-semibold text-slate-900">Cliente:</span> {selectedCustomer?.name || '—'}</div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 px-6 py-4 flex gap-3 justify-end border-t border-slate-100">
              <button
                onClick={() => setShowQRModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Fechar
              </button>
              <button
                onClick={handlePrintQRCode}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-600 transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <QrCode size={16} />
                Imprimir Etiqueta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
