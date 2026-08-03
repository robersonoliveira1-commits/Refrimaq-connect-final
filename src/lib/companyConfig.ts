import { supabase } from './supabase';

export interface CompanyConfig {
  id: string;
  company_name: string;
  razao_social: string;
  cnpj: string;
  address: string;
  phone: string;
  email: string;
  responsible: string;
  logo_url: string;

  pix_key: string;
  pix_key_type: string;
  account_holder: string;
  bank_name: string;
  agency: string;
  account_number: string;
  account_type: string;
  financial_notes: string;

  pdf_footer: string;
  boleto_message: string;
  warranty_policy: string;
  return_policy: string;
  os_notes: string;
}

export const EMPTY_CONFIG: CompanyConfig = {
  id: '',
  company_name: '',
  razao_social: '',
  cnpj: '',
  address: '',
  phone: '',
  email: '',
  responsible: '',
  logo_url: '',
  pix_key: '',
  pix_key_type: '',
  account_holder: '',
  bank_name: '',
  agency: '',
  account_number: '',
  account_type: 'corrente',
  financial_notes: '',
  pdf_footer: '',
  boleto_message: '',
  warranty_policy: '',
  return_policy: '',
  os_notes: '',
};

export async function fetchCompanyConfig(): Promise<CompanyConfig> {
  const { data } = await supabase
    .from('company_settings')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (!data) return EMPTY_CONFIG;

  let extra: any = {};
  try {
    if (data.default_payment_conditions && data.default_payment_conditions.startsWith('{')) {
      extra = JSON.parse(data.default_payment_conditions);
    } else {
      extra = {};
    }
  } catch (e) {}

  return {
    id: data.id || '',
    company_name: data.company_name || '',
    razao_social: data.trade_name || '',
    cnpj: data.cnpj || '',
    address: data.address || '',
    phone: data.main_phone || '',
    email: data.contact_email || '',
    logo_url: data.logo_url || '',
    bank_name: data.bank || '',
    agency: data.agency || '',
    account_number: data.account || '',
    account_type: data.account_type || 'corrente',
    pix_key: data.pix_key || '',
    responsible: extra.responsible || '',
    pix_key_type: extra.pix_key_type || '',
    account_holder: extra.account_holder || '',
    financial_notes: extra.financial_notes || '',
    pdf_footer: extra.pdf_footer || '',
    boleto_message: extra.boleto_message || '',
    warranty_policy: extra.warranty_policy || '',
    return_policy: extra.return_policy || '',
    os_notes: extra.os_notes || ''
  };
}

export async function saveCompanyConfig(config: CompanyConfig) {
  const extra = {
    responsible: config.responsible,
    pix_key_type: config.pix_key_type,
    account_holder: config.account_holder,
    financial_notes: config.financial_notes,
    pdf_footer: config.pdf_footer,
    boleto_message: config.boleto_message,
    warranty_policy: config.warranty_policy,
    return_policy: config.return_policy,
    os_notes: config.os_notes,
  };

  const payload = {
    company_name: config.company_name,
    trade_name: config.razao_social,
    cnpj: config.cnpj,
    address: config.address,
    main_phone: config.phone,
    contact_email: config.email,
    logo_url: config.logo_url,
    bank: config.bank_name,
    agency: config.agency,
    account: config.account_number,
    account_type: config.account_type,
    pix_key: config.pix_key,
    default_payment_conditions: JSON.stringify(extra),
    updated_at: new Date().toISOString()
  };

  if (config.id) {
    const { error } = await supabase.from('company_settings').update(payload).eq('id', config.id);
    if (error) console.error('Error updating company config:', error);
  } else {
    const { error } = await supabase.from('company_settings').insert(payload);
    if (error) console.error('Error inserting company config:', error);
  }
}
