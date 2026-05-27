import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GalleryHorizontalEnd, Play, Image, Zap, Box, MessageSquare, Sparkles } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-svh bg-background">
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2 font-semibold text-lg">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <GalleryHorizontalEnd className="size-5" />
            </div>
            i2i Studio
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="ghost" size="sm">登录</Button>
            </Link>
            <Link href="/login">
              <Button size="sm">开始使用</Button>
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="py-20 lg:py-32">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              用 AI 创作令人惊艳的图片与视频
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              i2i Studio 汇集顶尖 AI 模型，在统一的工作空间里完成图片生成、视频创作、编辑以及素材管理。
            </p>
            <div className="mt-8 flex items-center justify-center gap-4">
              <Link href="/login">
                <Button size="lg" className="gap-2">
                  <Sparkles className="size-4" />
                  开始创作
                </Button>
              </Link>
              <Link href="/login">
                <Button size="lg" variant="outline">
                  了解更多
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <section className="py-20 bg-muted/50">
          <div className="container mx-auto px-4">
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              <FeatureCard
                icon={Image}
                title="AI 图片生成"
                description="使用 Flux、SDXL、DALL-E 3 等模型，通过文字描述生成高质量图片。"
              />
              <FeatureCard
                icon={Play}
                title="视频生成"
                description="通过 Runway、Pika、Kling 模型，将文字或图片转化为视频。"
              />
              <FeatureCard
                icon={Zap}
                title="智能编辑"
                description="使用套索工具选中任意区域，用自然语言描述修改内容。"
              />
              <FeatureCard
                icon={Box}
                title="自定义工作流"
                description="用自然语言描述你需要的工具，AI 自动构建多步骤处理流程。"
              />
              <FeatureCard
                icon={MessageSquare}
                title="AI 助手"
                description="头脑风暴、创建分镜、保持角色一致性，AI 助手陪你完成创意全过程。"
              />
              <FeatureCard
                icon={GalleryHorizontalEnd}
                title="素材管理"
                description="将创作整理到合集，支持强大的搜索和筛选功能。"
              />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          i2i Studio — 基于 Next.js、tRPC 与 AI 构建
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-6 transition-colors hover:bg-accent/50">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="size-5 text-primary" />
      </div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
