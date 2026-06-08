import type { ProviderId } from "./types";
import { createGatewayRegistry } from "./registry";

export function getApiKeys(): Partial<Record<ProviderId, string>> {
  const keys: Partial<Record<ProviderId, string>> = {};

  if (process.env.EPHONE_API_KEY) {
    keys.ephone = process.env.EPHONE_API_KEY;
  }
  if (process.env.REPLICATE_API_TOKEN) {
    keys.replicate = process.env.REPLICATE_API_TOKEN;
  }
  if (process.env.FALAI_API_KEY) {
    keys.falai = process.env.FALAI_API_KEY;
  }
  if (process.env.OPENAI_API_KEY) {
    keys.openai = process.env.OPENAI_API_KEY;
  }
  if (process.env.RUNWAY_API_KEY) {
    keys.runway = process.env.RUNWAY_API_KEY;
  }
  if (process.env.PIKA_API_KEY) {
    keys.pika = process.env.PIKA_API_KEY;
  }
  if (process.env.KLING_API_KEY) {
    keys.kling = process.env.KLING_API_KEY;
  } else if (process.env.EPHONE_API_KEY) {
    // Kling OmniVideo API 通过 ephone 代理，密钥与 ephone 一致
    keys.kling = process.env.EPHONE_API_KEY;
  }
  if (process.env.TUZI_API_KEY) {
    keys.tuzi = process.env.TUZI_API_KEY;
  }

  return keys;
}

export function getGatewayRegistry() {
  return createGatewayRegistry(getApiKeys());
}

export function getDefaultProvider(): ProviderId {
  if (process.env.EPHONE_API_KEY) return "ephone";
  if (process.env.REPLICATE_API_TOKEN) return "replicate";
  if (process.env.FALAI_API_KEY) return "falai";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "ephone";
}
