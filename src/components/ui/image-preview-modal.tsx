"use client";

import { useEffect, useCallback } from "react";
import { X, Download } from "lucide-react";
import { BlurhashImage } from "./blurhash-image";
import { downloadImage } from "@/lib/download-helper";

interface ImagePreviewModalProps {
  open: boolean;
  onClose: () => void;
  src: string;           // 大图 URL (urlPreview)
  downloadUrl?: string;  // 原图下载 URL (originalUrl)
  alt?: string;
  blurHash?: string | null;
  width?: number | null;
  height?: number | null;
  prompt?: string;
}

export function ImagePreviewModal({
  open,
  onClose,
  src,
  downloadUrl,
  alt,
  blurHash,
  width,
  height,
  prompt,
}: ImagePreviewModalProps) {
  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleDownload = useCallback(() => {
    if (!downloadUrl) return;
    downloadImage(downloadUrl);
  }, [downloadUrl]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* 关闭按钮 */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 flex size-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 z-10"
      >
        <X className="size-5" />
      </button>

      {/* 图片 + 下载 */}
      <div
        className="max-h-[90vh] max-w-[90vw] flex flex-col items-center gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <BlurhashImage
          src={src}
          alt={alt ?? ""}
          blurHash={blurHash ?? undefined}
          width={width ?? undefined}
          height={height ?? undefined}
          className="max-h-[75vh] max-w-[90vw] rounded-lg object-contain"
          loading="eager"
        />

        {/* 下载按钮 - 紧贴图片下方 */}
        {downloadUrl && (
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200 transition-colors"
          >
            <Download className="size-4" />
            下载原图 (PNG)
          </button>
        )}

        {/* 信息 */}
        {(prompt || width || height) && (
          <div className="flex flex-col items-center gap-1 text-sm text-white/60 max-w-lg">
            {prompt && <p className="text-center leading-relaxed">{prompt}</p>}
            {width && height && (
              <span className="text-xs text-white/40">{width}×{height}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
