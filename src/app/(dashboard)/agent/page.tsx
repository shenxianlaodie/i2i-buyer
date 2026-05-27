"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { MessageSquare, Send, Sparkles, Image, Film } from "lucide-react";

export default function AgentPage() {
  const [input, setInput] = useState("");

  return (
    <div className="h-full flex flex-col">
      <div className="border-b p-4">
        <h1 className="text-lg font-semibold">AI 助手</h1>
        <p className="text-sm text-muted-foreground">
          头脑风暴、创建分镜、细化你的创意想法
        </p>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-3xl mx-auto">
          <Card className="border-dashed border-2 flex flex-col items-center justify-center p-12 text-center">
            <MessageSquare className="size-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">创意 AI 助手</h3>
            <p className="text-muted-foreground mb-6 max-w-md">
              我可以帮你头脑风暴、创建分镜、推荐提示词、保持角色在全作品中的一致性。
            </p>
            <div className="flex gap-2 flex-wrap justify-center">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Sparkles className="size-3.5" />
                头脑风暴
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Film className="size-3.5" />
                创建分镜
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Image className="size-3.5" />
                推荐提示词
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <div className="border-t p-4">
        <div className="flex gap-3 max-w-3xl mx-auto">
          <Textarea
            placeholder="随便聊聊你的创意想法..."
            className="min-h-[50px] resize-none"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                setInput("");
              }
            }}
          />
          <Button size="icon" className="shrink-0">
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
