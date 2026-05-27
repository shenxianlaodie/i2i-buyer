import { NextResponse } from "next/server";
import {
  fetchEphoneModels,
  filterEphoneModels,
  type EphoneModelCategory,
} from "@/server/ai-gateway/ephone/models";

export async function GET(req: Request) {
  try {
    if (!process.env.EPHONE_API_KEY) {
      return NextResponse.json({ error: "未配置 EPHONE_API_KEY" }, { status: 503 });
    }
    const category = new URL(req.url).searchParams.get("category");
    const models = await fetchEphoneModels();
    const cat =
      category === "image" || category === "video" || category === "other"
        ? (category as EphoneModelCategory)
        : undefined;
    return NextResponse.json(filterEphoneModels(models, cat));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "获取模型失败" },
      { status: 500 },
    );
  }
}
