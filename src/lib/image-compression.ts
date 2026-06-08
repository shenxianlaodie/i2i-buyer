/**
 * 前端图片压缩工具
 *
 * 使用 Offscreen Canvas 在浏览器主线程外（或内存中）对图片进行等比降采样，
 * 避免大图直接进入 DOM / Fabric.js / 上传流导致的主线程卡顿。
 *
 * 核心优化点：
 * - 放弃 Base64（FileReader.readAsDataURL），改用 URL.createObjectURL（微秒级引用）
 * - 对大图先压缩再预览 / 上传，降低内存占用和网络传输时间
 */

export interface CompressOptions {
  /** 最大宽度（像素），默认 1920 */
  maxWidth?: number;
  /** 最大高度（像素），默认 1920 */
  maxHeight?: number;
  /** 输出质量 0-1，默认 0.85 */
  quality?: number;
  /** 输出格式，默认 'image/webp'（体积最小） */
  format?: "image/webp" | "image/jpeg" | "image/png";
}

/**
 * 对 File 进行等比压缩，返回压缩后的 Blob。
 * 如果原图尺寸未超过限制，直接返回原 File（零开销）。
 */
export async function compressImage(
  file: File,
  options: CompressOptions = {},
): Promise<{ blob: Blob; width: number; height: number }> {
  const {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 0.85,
    format = "image/webp",
  } = options;

  // 非图片文件直接返回
  if (!file.type.startsWith("image/")) {
    return {
      blob: file,
      width: 0,
      height: 0,
    };
  }

  // SVG / GIF 动图不压缩，直接返回
  if (file.type === "image/svg+xml" || file.type === "image/gif") {
    return {
      blob: file,
      width: 0,
      height: 0,
    };
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const origW = img.naturalWidth;
      const origH = img.naturalHeight;

      // 如果原图尺寸在限制内，不压缩
      if (origW <= maxWidth && origH <= maxHeight) {
        resolve({ blob: file, width: origW, height: origH });
        return;
      }

      // 等比缩放
      let w = origW;
      let h = origH;
      if (w > maxWidth) {
        h = Math.round((h * maxWidth) / w);
        w = maxWidth;
      }
      if (h > maxHeight) {
        w = Math.round((w * maxHeight) / h);
        h = maxHeight;
      }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve({ blob: file, width: origW, height: origH });
        return;
      }

      ctx.drawImage(img, 0, 0, w, h);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve({ blob, width: w, height: h });
          } else {
            // 降级：返回原文件
            resolve({ blob: file, width: origW, height: origH });
          }
        },
        format,
        quality,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片加载失败"));
    };

    img.src = url;
  });
}

/**
 * 压缩图片并返回本地 Blob URL（用于即时预览，微秒级渲染）。
 * 适用于画板、素材库等纯前端展示场景。
 *
 * @param file 原始文件
 * @param maxWidth 预览最大宽度，默认 1200
 * @returns Blob URL 字符串
 */
export async function compressImageForPreview(
  file: File,
  maxWidth = 1200,
): Promise<{ url: string; width: number; height: number }> {
  const { blob, width, height } = await compressImage(file, {
    maxWidth,
    maxHeight: maxWidth * 2, // 预览允许较高的竖图
    quality: 0.8,
    format: "image/webp",
  });

  // 如果没有压缩（原图在限制内），使用原文件的 blob URL
  if (blob === file) {
    return { url: URL.createObjectURL(file), width, height };
  }

  return { url: URL.createObjectURL(blob), width, height };
}

/**
 * 压缩图片并返回适合上传的 File 对象。
 * 用于 Fusion / Pose 等需要上传到服务端的场景。
 *
 * @param file 原始文件
 * @param maxWidth 上传最大宽度，默认 2048（平衡质量与速度）
 * @returns 压缩后的 File（若无需压缩则返回原 File）
 */
export async function compressImageForUpload(
  file: File,
  maxWidth = 2048,
): Promise<File> {
  const { blob } = await compressImage(file, {
    maxWidth,
    maxHeight: maxWidth * 2,
    quality: 0.9,
    format: "image/jpeg",
  });

  if (blob === file) return file;

  // 生成新文件名
  const baseName = file.name.replace(/\.[^.]+$/, "");
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  return new File([blob], `${baseName}_compressed.${ext}`, {
    type: blob.type,
    lastModified: Date.now(),
  });
}
