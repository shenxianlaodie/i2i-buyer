/** 兔子 API (tu-zi.com) 客户端 */

export interface TuziVideoResponse {
  id: string;
  object: string;
  model: string;
  status: "queued" | "in_progress" | "completed" | "failed";
  progress: number;
  created_at: number;
  seconds: string;
  video_url?: string;
  size?: string;
  error?: string;
}

/** veo chat completions 响应（OpenAI 兼容格式） */
export interface TuziChatVideoResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices?: Array<{
    index: number;
    message?: { role: string; content: string };
    finish_reason?: string;
  }>;
  /** tu-zi 自定义字段 */
  video_url?: string;
  error?: { message: string };
}

/** Sora-2 支持的视频尺寸 */
export const SORA2_SIZES = ["1280x720", "720x1280", "1792x1024", "1024x1792"] as const;
export type Sora2Size = (typeof SORA2_SIZES)[number];

/** Sora-2 支持的视频时长（秒） */
export const SORA2_SECONDS = ["4", "8", "10", "12", "15", "25"] as const;
export type Sora2Second = (typeof SORA2_SECONDS)[number];

export class TuziClient {
  private readonly baseUrl: string;

  constructor(
    private readonly apiKey: string,
    baseUrl = process.env.TUZI_BASE_URL ?? "https://api.tu-zi.com",
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private headers(extra?: HeadersInit): HeadersInit {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      ...extra,
    };
  }

  /** 创建 Sora-2 视频（multipart/form-data → /v1/videos） */
  async createVideo(params: {
    prompt: string;
    imageUrl?: string;
    seconds?: string;
    size?: string;
  }): Promise<TuziVideoResponse> {
    const seconds = params.seconds ?? "8";
    const size = params.size ?? "1280x720";

    const formData = new FormData();
    formData.append("model", "sora-2");
    formData.append("prompt", params.prompt || "让图片中的人物动起来");
    formData.append("seconds", seconds);
    formData.append("size", size);
    formData.append("watermark", "false");

    if (params.imageUrl) {
      formData.append("input_reference", params.imageUrl);
    }

    const res = await fetch(`${this.baseUrl}/v1/videos`, {
      method: "POST",
      headers: this.headers(),
      body: formData,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Tuzi video create failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<TuziVideoResponse>;
  }

  /** 创建 Veo 视频（OpenAI chat completions 格式 → /v1/chat/completions） */
  async createChatVideo(params: {
    model: string; // e.g. "veo3.1-4k"
    prompt: string;
    imageUrl?: string;
  }): Promise<TuziChatVideoResponse> {
    const messages: Array<Record<string, unknown>> = [];

    if (params.imageUrl) {
      // 图生视频：多模态 content 数组
      messages.push({
        role: "user",
        content: [
          { type: "text", text: params.prompt || "让图片中的人物动起来" },
          { type: "image_url", image_url: { url: params.imageUrl } },
        ],
      });
    } else {
      // 文生视频：纯文本
      messages.push({
        role: "user",
        content: params.prompt || "生成一段视频",
      });
    }

    const body = {
      model: params.model,
      messages,
      stream: false,
    };

    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Tuzi chat video failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<TuziChatVideoResponse>;
  }

  /** 查询视频任务状态（/v1/videos/{id}） */
  async getVideo(videoId: string): Promise<TuziVideoResponse> {
    const res = await fetch(
      `${this.baseUrl}/v1/videos/${encodeURIComponent(videoId)}`,
      { headers: this.headers() },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Tuzi video query failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<TuziVideoResponse>;
  }

  /** 轮询直到完成或失败 */
  async pollVideo(
    videoId: string,
    options?: { intervalMs?: number; maxAttempts?: number },
  ): Promise<TuziVideoResponse> {
    const intervalMs = options?.intervalMs ?? 5000;
    const maxAttempts = options?.maxAttempts ?? 120;

    for (let i = 0; i < maxAttempts; i++) {
      const video = await this.getVideo(videoId);
      if (video.status === "completed" || video.status === "failed") {
        return video;
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }

    throw new Error(`Tuzi video ${videoId} timed out`);
  }

  /** 下载远程图片并返回 Blob */
  private async fetchImageAsBlob(url: string): Promise<Blob> {
    const tempMatch = url.match(/\/api\/temp-upload\/([^/]+)$/);
    if (tempMatch) {
      const { getTempUploadData } = await import("@/lib/temp-upload-store");
      const entry = getTempUploadData(tempMatch[1]);
      if (entry) {
        return new Blob([new Uint8Array(entry.buffer)], {
          type: entry.mime || "image/png",
        });
      }
      throw new Error("参考图已过期（服务重启后临时文件丢失），请重新上传");
    }

    const resolvedUrl = (() => {
      if (url.startsWith("http") || url.startsWith("data:")) return url;
      const base =
        process.env.NEXT_PUBLIC_APP_URL ??
        (process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : "http://localhost:3000");
      return `${base.replace(/\/$/, "")}${url.startsWith("/") ? url : `/${url}`}`;
    })();

    const res = await fetch(resolvedUrl);
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
    return res.blob();
  }
}
