export type EphoneTaskStatus = "queued" | "in_progress" | "completed" | "failed";

export interface EphoneTaskResponse {
  id: string;
  status: EphoneTaskStatus;
  created_at?: number;
  completed_at?: number;
  outputs?: string[];
  error?: string;
}

export class EphoneClient {
  private readonly baseUrl: string;
  private readonly apiBase: string;

  constructor(
    private readonly apiKey: string,
    baseUrl = process.env.EPHONE_BASE_URL ?? "https://api.ephone.ai",
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiBase = `${this.baseUrl}/v1`;
  }

  get openaiBaseUrl() {
    return this.apiBase;
  }

  private headers(extra?: HeadersInit): HeadersInit {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      ...extra,
    };
  }

  async submitTask(
    model: string,
    input: Record<string, unknown>,
    callbackUrl?: string,
  ): Promise<EphoneTaskResponse> {
    const res = await fetch(`${this.apiBase}/task/submit`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model,
        input,
        ...(callbackUrl ? { callback_url: callbackUrl } : {}),
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ePhone task submit failed (${res.status}): ${text}`);
    }
    return res.json() as Promise<EphoneTaskResponse>;
  }

  async getTask(taskId: string): Promise<EphoneTaskResponse> {
    const res = await fetch(`${this.apiBase}/task/${taskId}`, {
      headers: this.headers(),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ePhone task query failed (${res.status}): ${text}`);
    }
    return res.json() as Promise<EphoneTaskResponse>;
  }

  async pollTask(
    taskId: string,
    options?: { intervalMs?: number; maxAttempts?: number },
  ): Promise<EphoneTaskResponse> {
    const intervalMs = options?.intervalMs ?? 5000;
    const maxAttempts = options?.maxAttempts ?? 120;

    for (let i = 0; i < maxAttempts; i++) {
      const task = await this.getTask(taskId);
      if (task.status === "completed" || task.status === "failed") {
        return task;
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error(`ePhone task ${taskId} timed out`);
  }
}
