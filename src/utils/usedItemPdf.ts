import { jsPDF } from 'jspdf';
import { UsedItem } from '../lib/types';
import { CompanyConfig } from '../lib/companyConfig';

const loadImage = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = url;
  });
};

export async function generateUsedItemPDF(item: UsedItem, config: CompanyConfig | null) {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  
  // Colors
  const primaryColor = [245, 158, 11]; // amber-500
  const secondaryColor = [30, 41, 59]; // slate-800
  const textColor = [71, 85, 105]; // slate-600
  
  // Header background
  pdf.setFillColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  pdf.rect(0, 0, width, 30, 'F');
  
  // Title
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.text('OPORTUNIDADE - ' + item.category.toUpperCase(), 15, 20);

  // Logo if exists
  if (config?.logo_url) {
    try {
      pdf.addImage(config.logo_url, 'JPEG', width - 40, 5, 30, 20);
    } catch (e) {
      console.warn('Failed to load logo for PDF', e);
    }
  }

  // Item Title
  let currentY = 40;
  pdf.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  pdf.setFontSize(22);
  pdf.text(item.name, 15, currentY);
  
  // Tag / Condition
  currentY += 8;
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(textColor[0], textColor[1], textColor[2]);
  pdf.text(`${item.brand_model || ''} ${item.year ? ` - Ano ${item.year}` : ''} | Estado: ${item.condition}`, 15, currentY);

  // Prices
  currentY += 15;
  const priceToUse = item.promotional_price || item.price;
  
  if (item.promotional_price) {
    pdf.setFontSize(14);
    pdf.setTextColor(150, 150, 150);
    pdf.text(`De: ${item.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, 15, currentY);
    currentY += 10;
  }
  
  pdf.setFontSize(28);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(22, 163, 74); // green-600
  pdf.text(`Por: ${priceToUse.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, 15, currentY);
  
  if (item.payment_conditions) {
    currentY += 8;
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(textColor[0], textColor[1], textColor[2]);
    pdf.text(`Pagamento: ${item.payment_conditions}`, 15, currentY);
  }

  // Details Section (Moved before photos so it doesn't get pushed too far)
  currentY += 15;
  let detailsHeight = 80;
  if (item.description) {
    const splitDesc = pdf.splitTextToSize(item.description, width - 40);
    detailsHeight += (splitDesc.length * 6);
  }
  
  pdf.setFillColor(248, 250, 252);
  pdf.rect(15, currentY, width - 30, detailsHeight, 'F');
  
  currentY += 10;
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  pdf.text('Detalhes e Especificações', 20, currentY);
  
  currentY += 10;
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(textColor[0], textColor[1], textColor[2]);

  const leftColX = 20;
  const rightColX = width / 2;
  
  const addField = (label: string, value: string | null | undefined, x: number, y: number) => {
    if (value) {
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${label}:`, x, y);
      pdf.setFont('helvetica', 'normal');
      pdf.text(value, x + 30, y);
    }
  };

  let rowY = currentY;
  if (item.internal_code) { addField('Código', item.internal_code, leftColX, rowY); rowY += 8; }
  if (item.voltage) { addField('Voltagem', item.voltage, leftColX, rowY); rowY += 8; }
  if (item.weight) { addField('Peso', item.weight, leftColX, rowY); rowY += 8; }
  
  rowY = currentY;
  if (item.dimensions) { addField('Medidas', item.dimensions, rightColX, rowY); rowY += 8; }
  if (item.compatibility) { addField('Compat.', item.compatibility, rightColX, rowY); rowY += 8; }

  // Description
  currentY += 30;
  if (item.description) {
    pdf.setFont('helvetica', 'bold');
    pdf.text('Descrição:', 20, currentY);
    currentY += 6;
    pdf.setFont('helvetica', 'normal');
    
    const splitDesc = pdf.splitTextToSize(item.description, width - 40);
    pdf.text(splitDesc, 20, currentY);
    currentY += (splitDesc.length * 6);
  }

  currentY += 20; // Space after details

  // Photos
  if (item.photos && item.photos.length > 0) {
    const loadedImages = await Promise.all(
      item.photos.map(p => loadImage(p).catch(() => null))
    );

    for (let i = 0; i < loadedImages.length; i++) {
      const img = loadedImages[i];
      if (!img) continue;

      const maxWidth = 150;
      const maxHeight = 120;
      const ratio = img.naturalWidth / img.naturalHeight;
      
      let imgWidth = maxWidth;
      let imgHeight = imgWidth / ratio;
      
      if (imgHeight > maxHeight) {
         imgHeight = maxHeight;
         imgWidth = imgHeight * ratio;
      }
      
      // Check page break
      if (currentY + imgHeight > height - 20) {
         pdf.addPage();
         currentY = 20;
      }
      
      const xOffset = (width - imgWidth) / 2;
      pdf.addImage(img, 'JPEG', xOffset, currentY, imgWidth, imgHeight);
      currentY += imgHeight + 15;
    }
  } else {
      pdf.text('Nenhuma foto disponível', width/2 - 25, currentY);
      currentY += 15;
  }

  // Footer Config (Add to all pages if needed, but for now just add to the last page)
  if (config) {
    pdf.setFontSize(10);
    pdf.setTextColor(150, 150, 150);
    const footerText = `${config.company_name} | ${config.phone} | ${config.email}`;
    pdf.text(footerText, width / 2, height - 10, { align: 'center' });
  }

  // Open PDF
  window.open(pdf.output('bloburl'), '_blank');
}
