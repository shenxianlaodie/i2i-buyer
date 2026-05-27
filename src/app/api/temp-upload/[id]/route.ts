import { auth } from "@/lib/auth";
import { getTempUpload } from "@/lib/temp-upload-store";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const entry = getTempUpload(id, session.user.id);
  if (!entry) {
    return NextResponse.json({ error: "图片不存在或已过期" }, { status: 404 });
  }

  return new NextResponse(entry.buffer, {
    headers: {
      "Content-Type": entry.mime,
      "Cache-Control": "private, no-store",
    },
  });
}
