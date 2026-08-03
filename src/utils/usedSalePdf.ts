import { UsedItemSale } from './types';
import { CompanyConfig } from './companyConfig';

export async function generateUsedSalePdf(sale: UsedItemSale, cfg: CompanyConfig) {
  const item = sale.used_item;
  if (!item) {
    alert('Os detalhes do item não estão disponíveis para esta venda.');
    return;
  }

  const logoHtml = cfg.logo_url
    ? `<img src="${cfg.logo_url}" alt="Logo" style="height:48px;object-fit:contain;max-width:120px;" />`
    : '';

  const pixLine = cfg.pix_key 
    ? `<div><strong>Chave PIX:</strong> ${cfg.pix_key} (${cfg.pix_key_type || 'PIX'}) ${cfg.account_holder ? '- ' + cfg.account_holder : ''}</div>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>Recibo_${(sale.buyer_name || 'Venda').replace(/[/\\?%*:|"<>]/g, '').trim()}_${sale.id.slice(0, 8)}</title>
<style>
  * { box-sizing: border-box; margin:0; padding:0; }
  body { font-family: Arial, sans-serif; font-size: 13px; color: #1e293b; background: #fff; padding: 30px; }
  .header { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 16px; margin-bottom: 24px; }
  .company-info h1 { font-size: 20px; font-weight: 900; margin-bottom: 4px; }
  .company-info p { font-size: 11px; color: #64748b; margin-bottom: 2px; }
  
  .title { text-align: center; font-size: 18px; font-weight: bold; text-transform: uppercase; margin-bottom: 24px; letter-spacing: 1px; }
  
  .section { margin-bottom: 24px; }
  .section-title { font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 12px; }
  
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .info-box { background: #f8fafc; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; }
  .info-box label { display: block; font-size: 10px; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }
  .info-box span { display: block; font-weight: bold; font-size: 14px; }
  
  .item-details { display: flex; gap: 20px; align-items: flex-start; }
  .item-photo { width: 200px; height: 200px; object-fit: cover; border-radius: 8px; border: 1px solid #e2e8f0; }
  .item-specs table { width: 100%; border-collapse: collapse; }
  .item-specs th, .item-specs td { padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: left; font-size: 12px; }
  .item-specs th { width: 120px; color: #64748b; font-weight: normal; }
  .item-specs td { font-weight: bold; }
  
  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px dashed #cbd5e1; font-size: 11px; color: #64748b; text-align: center; }
  
  @media print {
    body { padding: 0; }
  }
</style>
</head>
<body>
  <div class="header">
    <div class="company-info">
      ${logoHtml}
      <h1 style="margin-top: ${logoHtml ? '8px' : '0'}">${cfg.company_name || 'Empresa'}</h1>
      ${cfg.cnpj ? `<p>CNPJ: ${cfg.cnpj}</p>` : ''}
      ${cfg.address ? `<p>${cfg.address}</p>` : ''}
      ${cfg.phone ? `<p>Tel: ${cfg.phone}</p>` : ''}
    </div>
    <div style="text-align: right;">
      <p style="font-size: 10px; color: #64748b;">Recibo Nº</p>
      <p style="font-size: 16px; font-weight: bold;">${sale.id.slice(0, 8).toUpperCase()}</p>
      <p style="font-size: 10px; color: #64748b; margin-top: 8px;">Data da Venda</p>
      <p style="font-weight: bold;">${new Date(sale.created_at).toLocaleDateString('pt-BR')}</p>
    </div>
  </div>

  <div class="title">Comprovante de Venda de Usado</div>

  <div class="section grid-2">
    <div class="info-box">
      <label>Comprador</label>
      <span>${sale.customer_name}</span>
      ${sale.customer_phone ? `<span style="font-size: 12px; font-weight: normal; margin-top: 4px;">📞 ${sale.customer_phone}</span>` : ''}
    </div>
    <div class="info-box" style="text-align: right; background: #f0fdf4; border-color: #bbf7d0;">
      <label>Valor Pago (${sale.payment_method})</label>
      <span style="font-size: 20px; color: #166534;">${sale.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
      <span style="font-size: 11px; font-weight: normal; color: #166534; margin-top: 4px;">Status: ${sale.status}</span>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Detalhes do Item</div>
    <div class="item-details">
      ${item.photos && item.photos.length > 0 
        ? `<img src="${item.photos[0]}" class="item-photo" />`
        : `<div class="item-photo" style="display:flex; align-items:center; justify-content:center; background:#f1f5f9; color:#94a3b8;">Sem Foto</div>`
      }
      <div class="item-specs" style="flex: 1;">
        <h3 style="margin-bottom: 12px; font-size: 16px;">${item.name}</h3>
        <table>
          <tr><th>Categoria</th><td>${item.category}</td></tr>
          <tr><th>Marca/Modelo</th><td>${item.brand_model || '-'}</td></tr>
          <tr><th>Ano</th><td>${item.year || '-'}</td></tr>
          <tr><th>Estado de Cons.</th><td>${item.condition}</td></tr>
          <tr><th>Código Int.</th><td>${item.internal_code || '-'}</td></tr>
        </table>
        
        ${item.description ? `<div style="margin-top: 16px; font-size: 12px;"><strong style="color: #64748b; display: block; margin-bottom: 4px;">Descrição:</strong>${item.description}</div>` : ''}
      </div>
    </div>
  </div>

  <div class="footer">
    ${pixLine}
    <div style="margin-top: 8px;">
      ${cfg.financial_notes || 'Obrigado pela preferência! Equipamento usado vendido no estado em que se encontra.'}
    </div>
  </div>
  
  <script>
    window.onload = () => { window.print(); }
  </script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}
