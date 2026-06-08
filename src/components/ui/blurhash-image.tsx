"use client";

import { useState, useEffect, useRef } from "react";
import { decode } from "blurhash";

interface BlurhashImageProps {
  src: string;
  alt: string;
  blurHash?: string;
  width?: number;
  height?: number;
  className?: string;
  loading?: "lazy" | "eager";
}

/**
 * 带 BlurHash 占位的图片组件
 *
 * - 图片加载前渲染 BlurHash Canvas 占位
 * - 图片加载完成后淡入替换
 * - 提供 width/height 防布局抖动
 */
export function BlurhashImage({
  src,
  alt,
  blurHash,
  width,
  height,
  className,
  loading = "lazy",
}: BlurhashImageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  // 渲染 BlurHash 占位
  useEffect(() => {
    if (!blurHash || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    try {
      const pixels = decode(blurHash, 32, 32);
      const imageData = ctx.createImageData(32, 32);
      imageData.data.set(pixels);
      ctx.putImageData(imageData, 0, 0);
    } catch {
      // 解码失败，忽略
    }
  }, [blurHash]);

  if (error) {
    // 加载失败：显示灰色占位
    return (
      <div
        className={className}
        style={{
          background: "#27272a",
          aspectRatio: width && height ? `${width}/${height}` : "1/1",
        }}
        role="img"
        aria-label={alt}
      />
    );
  }

  return (
    <div className="relative" style={{ width: "100%", height: "100%" }}>
      {/* BlurHash Canvas 占位 */}
      {blurHash && !loaded && (
        <canvas
          ref={canvasRef}
          width={32}
          height={32}
          className="absolute inset-0 size-full object-cover"
          style={{ imageRendering: "pixelated" }}
        />
      )}

      {/* 真实图片 */}
      <img
        src={src}
        alt={alt}
        width={width ?? undefined}
        height={height ?? undefined}
        loading={loading}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        className={className}
        style={{
          opacity: loaded ? 1 : 0,
          transition: "opacity 0.3s ease-in-out",
          ...(width && height
            ? { aspectRatio: `${width}/${height}` }
            : {}),
        }}
      />

      {/* 无 blurHash 时的骨架屏 */}
      {!blurHash && !loaded && !error && (
        <div
          className={`absolute inset-0 animate-pulse bg-zinc-800 ${className}`}
          style={{
            aspectRatio: width && height ? `${width}/${height}` : "1/1",
          }}
        />
      )}
    </div>
  );
}
