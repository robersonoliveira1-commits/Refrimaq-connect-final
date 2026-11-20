export type ImageFitPresetKey =
  | 'banner_desktop'
  | 'banner_mobile'
  | 'banner_editorial'
  | 'product';

export type ImageFitMode = 'auto' | 'contain_blur' | 'cover';

export type ImageFocalY = 'top' | 'center' | 'bottom';

export type ResolvedFitStrategy = 'cover' | 'blur_backdrop_contain' | 'contain_white';

export interface ImageFitPreset {
  width: number;
  height: number;
  label: string;
  padPercent: number;
}

export const IMAGE_FIT_PRESETS: Record<ImageFitPresetKey, ImageFitPreset> = {
  banner_desktop: {
    width: 1920,
    height: 580,
    label: 'Hero Desktop Tela Cheia (1920×580)',
    padPercent: 0,
  },
  banner_mobile: {
    width: 750,
    height: 820,
    label: 'Hero Mobile (750×820)',
    padPercent: 0,
  },
  banner_editorial: {
    width: 960,
    height: 720,
    label: 'Hero Editorial (960×720)',
    padPercent: 0,
  },
  product: {
    width: 1000,
    height: 750,
    label: 'Foto de Produto (1000×750)',
    padPercent: 0.06,
  },
};

/**
 * Maximum ratio discrepancy allowed before Auto mode switches from full-bleed
 * cover crop to seamless blurred-backdrop contain (preserving 100% of text/artwork).
 */
export const AUTO_COVER_MAX_RATIO_DIFF = 1.22;

export interface DrawRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AutoFitPlan {
  presetKey: ImageFitPresetKey;
  targetWidth: number;
  targetHeight: number;
  srcWidth: number;
  srcHeight: number;
  ratioDiff: number;
  strategy: ResolvedFitStrategy;
  bgRect: DrawRect;
  fgRect: DrawRect;
  summaryLabel: string;
}

function focalToFactor(focalY: ImageFocalY): number {
  if (focalY === 'top') return 0;
  if (focalY === 'bottom') return 1;
  return 0.5;
}

function computeCoverRect(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  focalY: ImageFocalY,
  overscan = 1
): DrawRect {
  const scale = Math.max(dstW / srcW, dstH / srcH) * overscan;
  const width = Math.round(srcW * scale);
  const height = Math.round(srcH * scale);
  const x = Math.round((dstW - width) / 2) || 0;
  const y = Math.round((dstH - height) * focalToFactor(focalY)) || 0;
  return { x, y, width, height };
}

function computeContainRect(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  padPercent = 0
): DrawRect {
  const usableW = dstW * (1 - padPercent * 2);
  const usableH = dstH * (1 - padPercent * 2);
  const scale = Math.min(usableW / srcW, usableH / srcH);
  const width = Math.round(srcW * scale);
  const height = Math.round(srcH * scale);
  const x = Math.round((dstW - width) / 2) || 0;
  const y = Math.round((dstH - height) / 2) || 0;
  return { x, y, width, height };
}

/**
 * Pure deterministic layout planner for fitting any uploaded image into a
 * Refrimaq target screen/card slot without distortion or unintended text clipping.
 */
export function computeAutoFitPlan(
  srcWidth: number,
  srcHeight: number,
  presetKey: ImageFitPresetKey,
  mode: ImageFitMode = 'auto',
  focalY: ImageFocalY = 'center'
): AutoFitPlan {
  const safeSrcW = Math.max(1, Math.round(srcWidth));
  const safeSrcH = Math.max(1, Math.round(srcHeight));
  const preset = IMAGE_FIT_PRESETS[presetKey];
  const targetWidth = preset.width;
  const targetHeight = preset.height;

  const srcRatio = safeSrcW / safeSrcH;
  const targetRatio = targetWidth / targetHeight;
  const ratioDiff = Math.max(srcRatio / targetRatio, targetRatio / srcRatio);

  let strategy: ResolvedFitStrategy;
  if (presetKey === 'product') {
    strategy = 'contain_white';
  } else if (mode === 'cover') {
    strategy = 'cover';
  } else if (mode === 'contain_blur') {
    strategy = 'blur_backdrop_contain';
  } else {
    strategy = ratioDiff <= AUTO_COVER_MAX_RATIO_DIFF ? 'cover' : 'blur_backdrop_contain';
  }

  const bgRect = computeCoverRect(safeSrcW, safeSrcH, targetWidth, targetHeight, 'center', 1.12);
  const fgRect =
    strategy === 'cover'
      ? computeCoverRect(safeSrcW, safeSrcH, targetWidth, targetHeight, focalY, 1)
      : computeContainRect(safeSrcW, safeSrcH, targetWidth, targetHeight, preset.padPercent);

  const strategyText =
    strategy === 'contain_white'
      ? 'enquadrada com fundo branco limpo'
      : strategy === 'cover'
      ? 'tela cheia proporcional'
      : 'inteira sem cortar texto (fundo ambiente)';

  return {
    presetKey,
    targetWidth,
    targetHeight,
    srcWidth: safeSrcW,
    srcHeight: safeSrcH,
    ratioDiff: Math.round(ratioDiff * 100) / 100,
    strategy,
    bgRect,
    fgRect,
    summaryLabel: `${safeSrcW}×${safeSrcH} → ${targetWidth}×${targetHeight} (${strategyText})`,
  };
}

export interface ProcessedImageResult {
  file: File;
  ext: 'webp' | 'jpg';
  plan: AutoFitPlan;
  sizeKb: number;
}

function loadImageElement(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Não foi possível ler a imagem selecionada.'));
    };
    img.src = objectUrl;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob | null> {
  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob), mimeType, quality);
  });
}

/**
 * Renders any image File/Blob onto an offscreen HTML5 canvas perfectly fitted
 * to the target screen preset (`1440×520`, `750×820`, `960×720`, or `1000×750`)
 * and returns a compressed WebP (or JPEG fallback) File ready for Supabase Storage.
 */
export async function processImageForSlot(
  source: Blob,
  options: {
    preset: ImageFitPresetKey;
    mode?: ImageFitMode;
    focalY?: ImageFocalY;
    baseFileName?: string;
  }
): Promise<ProcessedImageResult> {
  const img = await loadImageElement(source);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (!srcW || !srcH) {
    throw new Error('Dimensões inválidas na imagem enviada.');
  }

  const plan = computeAutoFitPlan(
    srcW,
    srcH,
    options.preset,
    options.mode ?? 'auto',
    options.focalY ?? 'center'
  );

  const canvas = document.createElement('canvas');
  canvas.width = plan.targetWidth;
  canvas.height = plan.targetHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Navegador não suporta processamento de imagem em canvas.');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (plan.strategy === 'contain_white') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, plan.targetWidth, plan.targetHeight);
    ctx.drawImage(img, plan.fgRect.x, plan.fgRect.y, plan.fgRect.width, plan.fgRect.height);
  } else if (plan.strategy === 'cover') {
    ctx.fillStyle = '#0D1014';
    ctx.fillRect(0, 0, plan.targetWidth, plan.targetHeight);
    ctx.drawImage(img, plan.fgRect.x, plan.fgRect.y, plan.fgRect.width, plan.fgRect.height);
  } else {
    // Seamless ambient blurred backdrop + crisp full uncropped foreground artwork
    ctx.fillStyle = '#0D1014';
    ctx.fillRect(0, 0, plan.targetWidth, plan.targetHeight);

    ctx.save();
    ctx.filter = 'blur(30px) brightness(0.45) saturate(1.18)';
    ctx.drawImage(img, plan.bgRect.x, plan.bgRect.y, plan.bgRect.width, plan.bgRect.height);
    ctx.restore();

    // Soft side vignette so the centered artwork integrates naturally
    const vignette = ctx.createLinearGradient(0, 0, plan.targetWidth, 0);
    vignette.addColorStop(0, 'rgba(13, 16, 20, 0.35)');
    vignette.addColorStop(0.25, 'rgba(13, 16, 20, 0.05)');
    vignette.addColorStop(0.75, 'rgba(13, 16, 20, 0.05)');
    vignette.addColorStop(1, 'rgba(13, 16, 20, 0.35)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, plan.targetWidth, plan.targetHeight);

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 28;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 8;
    ctx.drawImage(img, plan.fgRect.x, plan.fgRect.y, plan.fgRect.width, plan.fgRect.height);
    ctx.restore();
  }

  let blob = await canvasToBlob(canvas, 'image/webp', 0.88);
  let ext: 'webp' | 'jpg' = 'webp';
  let mime = 'image/webp';

  if (!blob || blob.type !== 'image/webp') {
    blob = await canvasToBlob(canvas, 'image/jpeg', 0.9);
    ext = 'jpg';
    mime = 'image/jpeg';
  }
  if (!blob) {
    throw new Error('Falha ao gerar arquivo otimizado da imagem.');
  }

  const base = (options.baseFileName || 'imagem').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
  const file = new File([blob], `${base}.${ext}`, { type: mime });
  const sizeKb = Math.max(1, Math.round(blob.size / 1024));

  return { file, ext, plan, sizeKb };
}

/**
 * Fetches an already-uploaded public image URL (CORS-safe) as a Blob
 * so existing misconfigured banners can be auto-fitted in 1 click.
 */
export async function fetchImageUrlAsBlob(url: string): Promise<Blob> {
  const res = await fetch(url, { mode: 'cors', cache: 'no-cache' });
  if (!res.ok) {
    throw new Error(`Não foi possível baixar a imagem atual (HTTP ${res.status}).`);
  }
  return res.blob();
}
