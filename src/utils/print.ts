import { compressImageElementForPrint } from './imageCompressor';

export async function printHtml(html: string, filename = 'documento.pdf') {
  console.log("Opening Print Dialog for:", filename);

  const cleanFilename = filename.replace('.pdf', '');
  const originalTitle = document.title;
  document.title = cleanFilename;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  
  // Set title for the printed document name
  const htmlWithTitle = html.replace(/<title>.*?<\/title>/i, `<title>${cleanFilename}</title>`);
  
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    console.error("Erro ao criar iframe de impressão");
    document.body.removeChild(iframe);
    document.title = originalTitle;
    return;
  }

  doc.open();
  doc.write(htmlWithTitle);
  doc.close();

  // Wait for images to load and optimize them for lightweight PDF generation
  const images = Array.from(doc.querySelectorAll('img'));
  
  // Aguarda carregamento inicial de todas as imagens
  await Promise.all(
    images.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
      });
    })
  );

  // Comprime cada imagem para resolução máxima de 1024px e JPEG 0.72 (~80-150KB cada)
  // Isso reduz o PDF final gerado pelo navegador ("Salvar como PDF") de 5-15MB para ~1MB.
  await Promise.all(
    images.map((img) => compressImageElementForPrint(img, 1024, 1024, 0.72))
  );

  try {
    // Pequeno delay para garantir renderização no iframe
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      
      // Remove o iframe e restaura o título após a impressão ser acionada
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
        document.title = originalTitle;
      }, 1000);
    }, 400);
  } catch (err) {
    console.error(err);
    if (document.body.contains(iframe)) document.body.removeChild(iframe);
    document.title = originalTitle;
  }
}
