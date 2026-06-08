export interface KlingTaskResponse {
  code: number;
  message: string;
  request_id?: string;
  data: {
    task_id: string;
    task_status: "submitted" | "processing" | "succeed" | "failed";
    task_status_msg?: string;
    created_at: number; // unix timestamp ms
    updated_at: number;
    task_result?: {
      videos: Array<{
        id: string;
        url: string;
        watermark_url?: string;
        duration: string;
      }>;
    };
    task_info?: { external_task_id?: string };
  };
}

export class KlingClient {
  private readonly baseUrl: string;

  constructor(
    private readonly apiKey: string,
    baseUrl = (process.env.EPHONE_BASE_URL
      ? `${process.env.EPHONE_BASE_URL.replace(/\/$/, "")}/kling`
      : "https://api.ephone.ai/kling"),
  ) {
    this.baseUrl = baseUrl;
  }

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  /** 创建图生视频任务 */
  async createImageToVideo(params: {
    modelName?: string;
    prompt: string;
    imageUrl: string;
    duration?: string;
    mode?: "std" | "pro" | "4k";
    aspectRatio?: string;
    sound?: "on" | "off";
  }): Promise<KlingTaskResponse> {
    const res = await fetch(`${this.baseUrl}/v1/videos/omni-video`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model_name: params.modelName ?? "kling-video-o1",
        prompt: params.prompt || `让<<<image_1>>>中的人物动起来`,
        image_list: [{ image_url: params.imageUrl }],
        duration: params.duration ?? "5",
        mode: params.mode ?? "pro",
        aspect_ratio: params.aspectRatio ?? "16:9",
        sound: params.sound ?? "off",
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Kling task submit failed (${res.status}): ${text}`);
    }
    const json = (await res.json()) as KlingTaskResponse;
    if (json.code !== 0) {
      throw new Error(`Kling API error: ${json.message}`);
    }
    return json;
  }

  /** 查询任务状态 */
  async getTask(taskId: string): Promise<KlingTaskResponse> {
    const res = await fetch(
      `${this.baseUrl}/v1/videos/omni-video/${taskId}`,
      { headers: this.headers() },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Kling task query failed (${res.status}): ${text}`);
    }
    const json = (await res.json()) as KlingTaskResponse;
    if (json.code !== 0) {
      throw new Error(`Kling API error: ${json.message}`);
    }
    return json;
  }

  /** 轮询直到完成或失败 */
  async pollTask(
    taskId: string,
    options?: { intervalMs?: number; maxAttempts?: number },
  ): Promise<KlingTaskResponse> {
    const intervalMs = options?.intervalMs ?? 5000;
    const maxAttempts = options?.maxAttempts ?? 120;
    for (let i = 0; i < maxAttempts; i++) {
      const task = await this.getTask(taskId);
      if (task.data.task_status === "succeed" || task.data.task_status === "failed") {
        return task;
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error(`Kling task ${taskId} timed out`);
  }
}
