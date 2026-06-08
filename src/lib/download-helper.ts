/**
 * 通过服务端代理下载图片（解决 OSS 无 CORS + jfif 问题）
 */
export function downloadImage(ossUrl: string, filename?: string) {
  const name = filename ?? `image-${Date.now()}.png`;
  const proxyUrl = `/api/download?url=${encodeURIComponent(ossUrl)}&name=${encodeURIComponent(name)}`;
  const a = document.createElement("a");
  a.href = proxyUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
