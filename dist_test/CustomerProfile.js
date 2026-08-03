var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/components/CustomerProfile.tsx
var CustomerProfile_exports = {};
__export(CustomerProfile_exports, {
  default: () => CustomerProfile
});
module.exports = __toCommonJS(CustomerProfile_exports);
var import_react = require("react");
var import_lucide_react2 = require("lucide-react");

// src/lib/supabase.ts
var import_supabase_js = require("@supabase/supabase-js");
var import_meta = {};
var supabaseUrl = import_meta.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co";
var supabaseAnonKey = import_meta.env.VITE_SUPABASE_ANON_KEY || "placeholder-key";
var supabase = (0, import_supabase_js.createClient)(supabaseUrl, supabaseAnonKey);

// src/lib/types.ts
function getContactStatus(lastContactAt) {
  if (!lastContactAt) return "gray";
  const days = Math.floor((Date.now() - new Date(lastContactAt).getTime()) / (1e3 * 60 * 60 * 24));
  if (days <= 30) return "green";
  if (days <= 180) return "yellow";
  return "red";
}
function getStatusLabel(status) {
  const labels = {
    green: "Recente",
    yellow: "Aten\xE7\xE3o",
    red: "Urgente",
    gray: "Novo"
  };
  return labels[status];
}
function formatDate(dateStr) {
  if (!dateStr) return "\u2014";
  return new Date(dateStr).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}
function formatDateTime(dateStr) {
  if (!dateStr) return "\u2014";
  return new Date(dateStr).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}
function daysSince(dateStr) {
  if (!dateStr) return "Nunca";
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1e3 * 60 * 60 * 24));
  if (days === 0) return "Hoje";
  if (days === 1) return "Ontem";
  return `${days} dias atr\xE1s`;
}

// src/components/Header.tsx
var import_lucide_react = require("lucide-react");
function Header({ title, subtitle, onMenuClick, actions }) {
  return /* @__PURE__ */ React.createElement("header", { className: "bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex items-center gap-4" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "lg:hidden text-slate-500 hover:text-slate-700",
      onClick: onMenuClick
    },
    /* @__PURE__ */ React.createElement(import_lucide_react.Menu, { size: 22 })
  ), /* @__PURE__ */ React.createElement("div", { className: "flex-1 min-w-0" }, /* @__PURE__ */ React.createElement("h1", { className: "text-xl font-bold text-slate-800 truncate" }, title), subtitle && /* @__PURE__ */ React.createElement("p", { className: "text-sm text-slate-500 truncate" }, subtitle)), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, actions, /* @__PURE__ */ React.createElement("button", { className: "relative p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors" }, /* @__PURE__ */ React.createElement(import_lucide_react.Bell, { size: 18 }))));
}

// src/components/CustomerProfile.tsx
var CONTACT_TYPE_ICONS = {
  phone: /* @__PURE__ */ React.createElement(import_lucide_react2.PhoneCall, { size: 14 }),
  whatsapp: /* @__PURE__ */ React.createElement(import_lucide_react2.MessageCircle, { size: 14 }),
  email: /* @__PURE__ */ React.createElement(import_lucide_react2.AtSign, { size: 14 }),
  visit: /* @__PURE__ */ React.createElement(import_lucide_react2.Navigation, { size: 14 }),
  other: /* @__PURE__ */ React.createElement(import_lucide_react2.MoreHorizontal, { size: 14 })
};
var CONTACT_TYPE_COLORS = {
  phone: "bg-blue-100 text-blue-700",
  whatsapp: "bg-emerald-100 text-emerald-700",
  email: "bg-violet-100 text-violet-700",
  visit: "bg-orange-100 text-orange-700",
  other: "bg-slate-100 text-slate-600"
};
var CONTACT_TYPE_LABELS = {
  phone: "Telefone",
  whatsapp: "WhatsApp",
  email: "E-mail",
  visit: "Visita",
  other: "Outro"
};
var STATUS_BADGE = {
  green: "bg-emerald-100 text-emerald-700 border-emerald-200",
  yellow: "bg-amber-100 text-amber-700 border-amber-200",
  red: "bg-red-100 text-red-700 border-red-200",
  gray: "bg-slate-100 text-slate-600 border-slate-200"
};
function CustomerProfile({
  customerId,
  onBack,
  onAddContact,
  onEditCustomer,
  onMenuClick,
  refresh
}) {
  const [customer, setCustomer] = (0, import_react.useState)(null);
  const [products, setProducts] = (0, import_react.useState)([]);
  const [contacts, setContacts] = (0, import_react.useState)([]);
  const [schedules, setSchedules] = (0, import_react.useState)([]);
  const [orders, setOrders] = (0, import_react.useState)([]);
  const [sales, setSales] = (0, import_react.useState)([]);
  const [loading, setLoading] = (0, import_react.useState)(true);
  const [deleteConfirm, setDeleteConfirm] = (0, import_react.useState)(null);
  const [activeTab, setActiveTab] = (0, import_react.useState)("contacts");
  (0, import_react.useEffect)(() => {
    loadAll();
  }, [customerId, refresh]);
  async function loadAll() {
    setLoading(true);
    const [customerRes, productsRes, contactsRes, schedulesRes, ordersRes, salesRes] = await Promise.all([
      supabase.from("customers").select("*").eq("id", customerId).maybeSingle(),
      supabase.from("customer_products").select("*").eq("customer_id", customerId).order("purchase_date", { ascending: false }),
      supabase.from("contacts").select("*").eq("customer_id", customerId).order("contacted_at", { ascending: false }),
      supabase.from("contact_schedules").select("*").eq("customer_id", customerId).eq("completed", false).order("scheduled_at"),
      supabase.from("service_orders").select("*").eq("customer_id", customerId).order("created_at", { ascending: false }),
      supabase.from("sales").select("*").eq("customer_id", customerId).order("created_at", { ascending: false })
    ]);
    if (customerRes.data) setCustomer(customerRes.data);
    if (productsRes.data) setProducts(productsRes.data);
    if (contactsRes.data) setContacts(contactsRes.data);
    if (schedulesRes.data) setSchedules(schedulesRes.data);
    if (ordersRes.data) setOrders(ordersRes.data);
    if (salesRes.data) setSales(salesRes.data);
    setLoading(false);
  }
  async function deleteContact(id) {
    await supabase.from("contacts").delete().eq("id", id);
    loadAll();
  }
  async function completeSchedule(id) {
    await supabase.from("contact_schedules").update({ completed: true }).eq("id", id);
    loadAll();
  }
  if (loading) {
    return /* @__PURE__ */ React.createElement("div", { className: "flex flex-col h-full" }, /* @__PURE__ */ React.createElement(Header, { title: "Carregando...", onMenuClick }), /* @__PURE__ */ React.createElement("div", { className: "flex-1 flex items-center justify-center" }, /* @__PURE__ */ React.createElement("div", { className: "w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" })));
  }
  if (!customer) {
    return /* @__PURE__ */ React.createElement("div", { className: "flex flex-col h-full" }, /* @__PURE__ */ React.createElement(Header, { title: "Cliente n\xE3o encontrado", onMenuClick }), /* @__PURE__ */ React.createElement("div", { className: "flex-1 flex items-center justify-center" }, /* @__PURE__ */ React.createElement("button", { onClick: onBack, className: "text-amber-600 hover:underline text-sm" }, "Voltar")));
  }
  const status = getContactStatus(customer.last_contact_at);
  const historyItems = [
    ...contacts.map((c) => ({ type: "contact", date: c.contacted_at, data: c })),
    ...orders.map((o) => ({ type: "order", date: o.created_at, data: o })),
    ...sales.map((s) => ({ type: "sale", date: s.created_at, data: s }))
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return /* @__PURE__ */ React.createElement("div", { className: "flex flex-col h-full" }, /* @__PURE__ */ React.createElement(
    Header,
    {
      title: customer.name,
      subtitle: `${customer.city ? customer.city + (customer.state ? `, ${customer.state}` : "") : "Sem localiza\xE7\xE3o"}`,
      onMenuClick,
      actions: /* @__PURE__ */ React.createElement("div", { className: "flex gap-2" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          onClick: () => onEditCustomer(customer),
          className: "flex items-center gap-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-1.5 rounded-lg text-sm transition-colors"
        },
        /* @__PURE__ */ React.createElement(import_lucide_react2.Edit2, { size: 14 }),
        /* @__PURE__ */ React.createElement("span", { className: "hidden sm:inline" }, "Editar")
      ), /* @__PURE__ */ React.createElement(
        "button",
        {
          onClick: () => onAddContact(customerId),
          className: "flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
        },
        /* @__PURE__ */ React.createElement(import_lucide_react2.Plus, { size: 14 }),
        /* @__PURE__ */ React.createElement("span", { className: "hidden sm:inline" }, "Registrar Contato")
      ))
    }
  ), /* @__PURE__ */ React.createElement("div", { className: "flex-1 overflow-auto p-4 sm:p-6 space-y-4" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: onBack,
      className: "flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
    },
    /* @__PURE__ */ React.createElement(import_lucide_react2.ArrowLeft, { size: 16 }),
    "Voltar para a lista"
  ), /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-xl border border-slate-200 p-5" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-start gap-4" }, /* @__PURE__ */ React.createElement("div", { className: "w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0" }, /* @__PURE__ */ React.createElement("span", { className: "text-amber-700 font-bold text-xl" }, customer.name.charAt(0).toUpperCase())), /* @__PURE__ */ React.createElement("div", { className: "flex-1 min-w-0" }, /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap items-center gap-2" }, /* @__PURE__ */ React.createElement("h2", { className: "text-lg font-bold text-slate-800" }, customer.name), /* @__PURE__ */ React.createElement("span", { className: `inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${STATUS_BADGE[status]}` }, getStatusLabel(status), " \u2014 ", daysSince(customer.last_contact_at))), /* @__PURE__ */ React.createElement("div", { className: "mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2" }, customer.phone && /* @__PURE__ */ React.createElement("a", { href: `tel:${customer.phone}`, className: "flex items-center gap-2 text-sm text-slate-600 hover:text-amber-600 transition-colors" }, /* @__PURE__ */ React.createElement(import_lucide_react2.Phone, { size: 14, className: "text-slate-400" }), customer.phone), customer.whatsapp && /* @__PURE__ */ React.createElement(
    "a",
    {
      href: `https://wa.me/${(() => {
        const digits = customer.whatsapp.replace(/\D/g, "");
        return digits.startsWith("55") ? digits : "55" + digits;
      })()}`,
      target: "_blank",
      rel: "noreferrer",
      className: "flex items-center gap-2 text-sm text-slate-600 hover:text-emerald-600 transition-colors"
    },
    /* @__PURE__ */ React.createElement(import_lucide_react2.MessageCircle, { size: 14, className: "text-slate-400" }),
    customer.whatsapp
  ), customer.email && /* @__PURE__ */ React.createElement("a", { href: `mailto:${customer.email}`, className: "flex items-center gap-2 text-sm text-slate-600 hover:text-amber-600 transition-colors" }, /* @__PURE__ */ React.createElement(import_lucide_react2.Mail, { size: 14, className: "text-slate-400" }), customer.email), (customer.address || customer.city) && /* @__PURE__ */ React.createElement("span", { className: "flex items-center gap-2 text-sm text-slate-600" }, /* @__PURE__ */ React.createElement(import_lucide_react2.MapPin, { size: 14, className: "text-slate-400" }), [customer.address, customer.city, customer.state].filter(Boolean).join(", ")), customer.document && /* @__PURE__ */ React.createElement("span", { className: "flex items-center gap-2 text-sm text-slate-600" }, /* @__PURE__ */ React.createElement(import_lucide_react2.FileText, { size: 14, className: "text-slate-400" }), customer.document)), Array.isArray(customer.equipment_types) && customer.equipment_types.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "mt-6 pt-6 border-t border-slate-100" }, /* @__PURE__ */ React.createElement("h3", { className: "text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2" }, /* @__PURE__ */ React.createElement(import_lucide_react2.Wrench, { className: "h-4 w-4 text-amber-500" }), "Equipamentos do Cliente"), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap gap-2" }, customer.equipment_types.map((eq) => /* @__PURE__ */ React.createElement("span", { key: eq, className: "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200" }, eq)))), customer.notes && /* @__PURE__ */ React.createElement("p", { className: "mt-3 text-sm text-slate-500 bg-slate-50 rounded-lg p-3 italic" }, customer.notes)))), schedules.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "bg-amber-50 border border-amber-200 rounded-xl p-4" }, /* @__PURE__ */ React.createElement("p", { className: "text-sm font-semibold text-amber-800 mb-2 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(import_lucide_react2.Calendar, { size: 14 }), "Contatos Agendados"), /* @__PURE__ */ React.createElement("div", { className: "space-y-2" }, schedules.map((s) => /* @__PURE__ */ React.createElement("div", { key: s.id, className: "flex items-center gap-3 bg-white rounded-lg p-3 border border-amber-100" }, /* @__PURE__ */ React.createElement("div", { className: "flex-1 min-w-0" }, /* @__PURE__ */ React.createElement("p", { className: "text-sm font-medium text-slate-700" }, formatDateTime(s.scheduled_at)), s.assigned_to && /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500" }, "Respons\xE1vel: ", s.assigned_to), s.notes && /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mt-0.5" }, s.notes)), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => completeSchedule(s.id),
      className: "flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
    },
    /* @__PURE__ */ React.createElement(import_lucide_react2.CheckCircle, { size: 14 }),
    "Conclu\xEDdo"
  ))))), /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-xl border border-slate-200" }, /* @__PURE__ */ React.createElement("div", { className: "flex border-b border-slate-100" }, [
    { key: "contacts", label: "Hist\xF3rico Geral", count: historyItems.length },
    { key: "products", label: "Produtos", count: products.length },
    { key: "schedules", label: "Agendamentos", count: schedules.length }
  ].map((tab) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: tab.key,
      onClick: () => setActiveTab(tab.key),
      className: `flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.key ? "border-amber-500 text-amber-600" : "border-transparent text-slate-500 hover:text-slate-700"}`
    },
    tab.label,
    /* @__PURE__ */ React.createElement("span", { className: `text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab.key ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}` }, tab.count)
  ))), activeTab === "contacts" && /* @__PURE__ */ React.createElement("div", null, historyItems.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "p-10 text-center" }, /* @__PURE__ */ React.createElement(import_lucide_react2.MessageSquare, { size: 36, className: "text-slate-300 mx-auto mb-3" }), /* @__PURE__ */ React.createElement("p", { className: "text-slate-500 font-medium" }, "Nenhum hist\xF3rico registrado"), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => onAddContact(customerId),
      className: "mt-3 text-amber-600 hover:underline text-sm"
    },
    "Registrar primeiro contato"
  )) : /* @__PURE__ */ React.createElement("div", { className: "divide-y divide-slate-100" }, historyItems.map((item, idx) => {
    if (item.type === "contact") {
      const contact = item.data;
      return /* @__PURE__ */ React.createElement("div", { key: `contact-${contact.id}-${idx}`, className: "p-4 hover:bg-slate-50 transition-colors" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-start gap-3" }, /* @__PURE__ */ React.createElement("div", { className: `w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${CONTACT_TYPE_COLORS[contact.contact_type] || CONTACT_TYPE_COLORS.other}` }, CONTACT_TYPE_ICONS[contact.contact_type] || CONTACT_TYPE_ICONS.other), /* @__PURE__ */ React.createElement("div", { className: "flex-1 min-w-0" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 flex-wrap" }, /* @__PURE__ */ React.createElement("span", { className: `text-xs font-medium px-2 py-0.5 rounded-full ${CONTACT_TYPE_COLORS[contact.contact_type] || CONTACT_TYPE_COLORS.other}` }, CONTACT_TYPE_LABELS[contact.contact_type] || "Outro"), /* @__PURE__ */ React.createElement("span", { className: "text-xs text-slate-400" }, formatDateTime(contact.contacted_at)), contact.contacted_by && /* @__PURE__ */ React.createElement("span", { className: "text-xs text-slate-400" }, "por ", contact.contacted_by)), /* @__PURE__ */ React.createElement("p", { className: "mt-1.5 font-medium text-slate-700 text-sm" }, contact.subject), contact.details && /* @__PURE__ */ React.createElement("p", { className: "mt-1 text-sm text-slate-500 leading-relaxed" }, contact.details), contact.comprovante_url && /* @__PURE__ */ React.createElement(
        "a",
        {
          href: contact.comprovante_url,
          target: "_blank",
          rel: "noopener noreferrer",
          className: "mt-2 inline-block rounded-lg overflow-hidden border border-slate-200 hover:border-amber-400 transition-colors"
        },
        /* @__PURE__ */ React.createElement("img", { src: contact.comprovante_url, alt: "Comprovante", className: "w-24 h-24 object-cover" })
      ), contact.next_contact_at && /* @__PURE__ */ React.createElement("div", { className: "mt-2 flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 rounded-lg px-2.5 py-1.5 w-fit" }, /* @__PURE__ */ React.createElement(import_lucide_react2.Calendar, { size: 11 }), "Pr\xF3ximo contato: ", formatDateTime(contact.next_contact_at), contact.next_contact_notes && ` \u2014 ${contact.next_contact_notes}`)), /* @__PURE__ */ React.createElement(
        "button",
        {
          onClick: () => setDeleteConfirm(contact.id),
          className: "text-slate-300 hover:text-red-400 transition-colors flex-shrink-0"
        },
        /* @__PURE__ */ React.createElement(import_lucide_react2.Trash2, { size: 14 })
      )));
    } else if (item.type === "order") {
      const o = item.data;
      return /* @__PURE__ */ React.createElement("div", { key: `order-${o.id}-${idx}`, className: "p-4 hover:bg-slate-50 transition-colors" }, /* @__PURE__ */ React.createElement("div", { className: "flex flex-col sm:flex-row sm:items-center justify-between gap-4" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-start gap-3" }, /* @__PURE__ */ React.createElement("div", { className: "w-8 h-8 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center flex-shrink-0" }, /* @__PURE__ */ React.createElement(import_lucide_react2.Wrench, { size: 14 })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 flex-wrap" }, /* @__PURE__ */ React.createElement("span", { className: "text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200" }, "OS"), /* @__PURE__ */ React.createElement("p", { className: "font-bold text-slate-800 text-sm" }, "#", String(o.order_number).padStart(4, "0"), " - ", o.visit_type), /* @__PURE__ */ React.createElement("span", { className: "text-xs text-slate-400" }, formatDateTime(o.created_at))), o.diagnosis && /* @__PURE__ */ React.createElement("p", { className: "text-sm text-slate-600 mt-1.5" }, o.diagnosis))), /* @__PURE__ */ React.createElement("div", { className: "flex flex-col items-start sm:items-end gap-2 flex-shrink-0" }, /* @__PURE__ */ React.createElement("span", { className: "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200" }, o.status))));
    } else if (item.type === "sale") {
      const s = item.data;
      return /* @__PURE__ */ React.createElement("div", { key: `sale-${s.id}-${idx}`, className: "p-4 hover:bg-slate-50 transition-colors" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-start gap-3" }, /* @__PURE__ */ React.createElement("div", { className: "w-8 h-8 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center flex-shrink-0" }, /* @__PURE__ */ React.createElement(import_lucide_react2.ShoppingCart, { size: 14 })), /* @__PURE__ */ React.createElement("div", { className: "flex-1" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 flex-wrap" }, /* @__PURE__ */ React.createElement("span", { className: "text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200" }, "Venda"), /* @__PURE__ */ React.createElement("span", { className: "text-xs text-slate-400" }, formatDateTime(s.created_at))), /* @__PURE__ */ React.createElement("p", { className: "text-sm text-slate-700 mt-1.5 font-medium" }, "Venda registrada: ", new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(s.total)))));
    }
    return null;
  }))), activeTab === "products" && /* @__PURE__ */ React.createElement("div", null, products.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "p-10 text-center" }, /* @__PURE__ */ React.createElement(import_lucide_react2.Package, { size: 36, className: "text-slate-300 mx-auto mb-3" }), /* @__PURE__ */ React.createElement("p", { className: "text-slate-500 font-medium" }, "Nenhum produto registrado")) : /* @__PURE__ */ React.createElement("div", { className: "divide-y divide-slate-100" }, products.map((p) => /* @__PURE__ */ React.createElement("div", { key: p.id, className: "p-4" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-start gap-3" }, /* @__PURE__ */ React.createElement("div", { className: "w-9 h-9 bg-amber-50 rounded-lg flex items-center justify-center flex-shrink-0" }, /* @__PURE__ */ React.createElement(import_lucide_react2.Package, { size: 16, className: "text-amber-600" })), /* @__PURE__ */ React.createElement("div", { className: "flex-1" }, /* @__PURE__ */ React.createElement("p", { className: "font-medium text-slate-700" }, p.product_name), /* @__PURE__ */ React.createElement("div", { className: "mt-1 flex flex-wrap gap-3 text-xs text-slate-500" }, p.purchase_date && /* @__PURE__ */ React.createElement("span", null, "Compra: ", formatDate(p.purchase_date)), p.invoice_number && /* @__PURE__ */ React.createElement("span", null, "NF: ", p.invoice_number), p.warranty_start && p.warranty_end && /* @__PURE__ */ React.createElement("span", { className: "flex items-center gap-1" }, /* @__PURE__ */ React.createElement(import_lucide_react2.Shield, { size: 10 }), "Garantia: ", formatDate(p.warranty_start), " a ", formatDate(p.warranty_end))), p.notes && /* @__PURE__ */ React.createElement("p", { className: "mt-1 text-xs text-slate-400" }, p.notes))))))), activeTab === "schedules" && /* @__PURE__ */ React.createElement("div", null, schedules.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "p-10 text-center" }, /* @__PURE__ */ React.createElement(import_lucide_react2.Calendar, { size: 36, className: "text-slate-300 mx-auto mb-3" }), /* @__PURE__ */ React.createElement("p", { className: "text-slate-500 font-medium" }, "Nenhum agendamento pendente")) : /* @__PURE__ */ React.createElement("div", { className: "divide-y divide-slate-100" }, schedules.map((s) => /* @__PURE__ */ React.createElement("div", { key: s.id, className: "p-4 flex items-center gap-3" }, /* @__PURE__ */ React.createElement(import_lucide_react2.Calendar, { size: 16, className: "text-amber-500 flex-shrink-0" }), /* @__PURE__ */ React.createElement("div", { className: "flex-1" }, /* @__PURE__ */ React.createElement("p", { className: "text-sm font-medium text-slate-700" }, formatDateTime(s.scheduled_at)), s.assigned_to && /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500" }, "Para: ", s.assigned_to), s.notes && /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500" }, s.notes)), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => completeSchedule(s.id),
      className: "text-xs text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
    },
    "Concluir"
  ))))))), deleteConfirm && /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm flex flex-col items-center" }, /* @__PURE__ */ React.createElement("h3", { className: "text-lg font-bold text-slate-800 mb-2" }, "Confirmar Exclus\xE3o"), /* @__PURE__ */ React.createElement("p", { className: "text-sm text-slate-500 text-center mb-4" }, "Excluir este registro de contato? Esta a\xE7\xE3o n\xE3o pode ser desfeita."), /* @__PURE__ */ React.createElement("div", { className: "flex gap-3 w-full" }, /* @__PURE__ */ React.createElement("button", { onClick: () => setDeleteConfirm(null), className: "flex-1 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50" }, "Cancelar"), /* @__PURE__ */ React.createElement("button", { onClick: () => {
    if (deleteConfirm) deleteContact(deleteConfirm);
    setDeleteConfirm(null);
  }, className: "flex-1 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600" }, "Sim, excluir")))));
}
