/**
 * Utilitário de compressão de imagens para garantir que arquivos e PDFs
 * permaneçam leves (em torno de 1MB) com alta fidelidade visual.
 */

/**
 * Reduz e comprime um arquivo de imagem (File) antes de enviar para o Supabase Storage.
 * Transforma fotos de câmeras de smartphones (5MB - 20MB) em imagens de ~150KB - 300KB.
 */
export async function compressImageFile(
  file: File,
  maxWidth = 1200,
  maxHeight = 1200,
  quality = 0.75
): Promise<File> {
  if (!file.type.startsWith('image/')) {
    return file;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            const cleanBase = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
            const compressedFile = new File([blob], `${cleanBase}.jpg`, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => resolve(file);
      img.src = event.target?.result as string;
    };
    reader.onerror = () => resolve(file);
  });
}

/**
 * Comprime um elemento <img> dentro do DOM para impressão.
 * Converte imagens de alta resolução em Data URLs JPEG otimizadas (~80KB - 150KB),
 * fazendo com que o PDF gerado pelo navegador ("Salvar como PDF") fique em torno de 1MB.
 */
export async function compressImageElementForPrint(
  img: HTMLImageElement,
  maxWidth = 1024,
  maxHeight = 1024,
  quality = 0.72
): Promise<void> {
  const src = img.src || '';

  // Se já for SVG ou Data URL JPEG já compacto, não precisa recomprimir
  if (src.startsWith('data:image/svg+xml') || (src.startsWith('data:image/jpeg') && src.length < 150000)) {
    return;
  }

  try {
    let blob: Blob | null = null;
    try {
      const resp = await fetch(src, { mode: 'cors' });
      if (resp.ok) {
        blob = await resp.blob();
      }
    } catch {
      // Ignora falha de fetch (ex: CORS em URLs externas) e tenta carregar diretamente
    }

    const tempImg = new Image();
    tempImg.crossOrigin = 'anonymous';

    await new Promise<void>((resolve, reject) => {
      tempImg.onload = () => resolve();
      tempImg.onerror = reject;
      if (blob) {
        tempImg.src = URL.createObjectURL(blob);
      } else {
        tempImg.src = src;
      }
    });

    let width = tempImg.naturalWidth || tempImg.width;
    let height = tempImg.naturalHeight || tempImg.height;

    if (!width || !height) {
      if (blob) URL.revokeObjectURL(tempImg.src);
      return;
    }

    if (width > maxWidth || height > maxHeight) {
      if (width > height) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      } else {
        width = Math.round((width * maxHeight) / height);
        height = maxHeight;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      if (blob) URL.revokeObjectURL(tempImg.src);
      return;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(tempImg, 0, 0, width, height);

    if (blob) {
      URL.revokeObjectURL(tempImg.src);
    }

    const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);

    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = compressedDataUrl;
    });
  } catch (err) {
    console.warn('Aviso: Não foi possível comprimir imagem para impressão, mantendo original:', err);
  }
}
