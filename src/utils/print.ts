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

  // Wait for images to load before printing
  const images = doc.querySelectorAll('img');
  const promises = Array.from(images).map(img => {
    if (img.complete) return Promise.resolve();
    return new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve;
    });
  });

  try {
    await Promise.all(promises);
    // Pequeno delay para garantir renderização
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
    }, 500);
  } catch (err) {
    console.error(err);
    if (document.body.contains(iframe)) document.body.removeChild(iframe);
    document.title = originalTitle;
  }
}
