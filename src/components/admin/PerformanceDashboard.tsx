"use client";

import { useEffect, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/server/trpc/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Cpu,
  HardDrive,
  Clock,
  Loader2,
  RefreshCw,
  Zap,
  Image,
  Video,
  Activity,
  Server,
} from "lucide-react";

function formatUptime(sec: number) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function ProgressBar({ value, max, color = "blue" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const colors: Record<string, string> = {
    blue: "bg-blue-500",
    green: "bg-emerald-500",
    yellow: "bg-amber-500",
    red: "bg-red-500",
  };
  return (
    <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${colors[color] ?? colors.blue}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "blue",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  const borders: Record<string, string> = {
    blue: "border-l-blue-500",
    green: "border-l-emerald-500",
    yellow: "border-l-amber-500",
    red: "border-l-red-500",
    purple: "border-l-purple-500",
  };
  return (
    <Card className={`border-l-4 ${borders[color] ?? borders.blue} p-3`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className="size-4 text-muted-foreground/50" />
      </div>
      <p className="text-lg font-bold tabular-nums mt-1">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </Card>
  );
}

export function PerformanceDashboard() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [imageMax, setImageMax] = useState(5);
  const [videoMax, setVideoMax] = useState(2);
  const [saving, setSaving] = useState(false);

  // ═══ 服务器指标（每 10 秒轮询） ═══
  const metricsQuery = useQuery({
    ...trpc.admin.getServerMetrics.queryOptions(),
    refetchInterval: 10_000,
  });

  // ═══ Worker 配置 + 队列状态（每 5 秒轮询） ═══
  const workerQuery = useQuery({
    ...trpc.admin.getWorkerConfig.queryOptions(),
    refetchInterval: 5_000,
  });

  // 同步 slider 初始值
  useEffect(() => {
    if (workerQuery.data) {
      setImageMax(workerQuery.data.config.imageMax);
      setVideoMax(workerQuery.data.config.videoMax);
    }
  }, [workerQuery.data?.config.imageMax, workerQuery.data?.config.videoMax]);

  const updateConfig = useMutation(
    trpc.admin.updateWorkerConfig.mutationOptions({
      onSuccess: () => {
        toast.success("并发上限已更新");
        qc.invalidateQueries({ queryKey: trpc.admin.getWorkerConfig.queryKey() });
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    updateConfig.mutate({ imageMax, videoMax });
    setSaving(false);
  }, [imageMax, videoMax, updateConfig]);

  const m = metricsQuery.data;
  const w = workerQuery.data;

  // Mem %
  const memColor = m ? (m.memory.percent > 85 ? "red" : m.memory.percent > 60 ? "yellow" : "green") : "blue";
  // Heap %
  const heapColor = m ? (m.process.heapUsedPercent > 85 ? "red" : m.process.heapUsedPercent > 60 ? "yellow" : "green") : "blue";
  // Load
  const loadColor = m ? (m.loadAvg["1min"] > m.cpu.cores * 1.5 ? "red" : m.loadAvg["1min"] > m.cpu.cores ? "yellow" : "green") : "blue";

  return (
    <div className="space-y-6">
      {/* ═══ 服务器资源仪表盘 ═══ */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Server className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">服务器资源</h2>
          {metricsQuery.isFetching && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
          <span className="text-[10px] text-muted-foreground ml-auto">
            更新于 {m ? new Date(m.timestamp).toLocaleTimeString("zh-CN") : "—"}
          </span>
        </div>

        {metricsQuery.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : metricsQuery.isError ? (
          <p className="text-sm text-destructive">加载服务器指标失败：{metricsQuery.error.message}</p>
        ) : m ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              icon={Cpu}
              label="进程 CPU"
              value={`${m.cpu.processPercent}%`}
              sub={`${m.cpu.cores} 核 · ${m.cpu.model?.substring(0, 30)}`}
              color={m.cpu.processPercent > 80 ? "red" : m.cpu.processPercent > 50 ? "yellow" : "green"}
            />
            <StatCard
              icon={HardDrive}
              label="系统内存"
              value={`${m.memory.percent}%`}
              sub={`${m.memory.usedMB} / ${m.memory.totalMB} MB`}
              color={memColor}
            />
            <StatCard
              icon={HardDrive}
              label="Node 堆内存"
              value={`${m.process.heapUsedPercent}%`}
              sub={`${m.process.heapUsedMB} / ${m.process.heapTotalMB} MB · RSS ${m.process.rssMB} MB`}
              color={heapColor}
            />
            <StatCard
              icon={Clock}
              label="运行时间"
              value={formatUptime(m.systemUptimeSec)}
              sub={`进程 ${formatUptime(m.process.uptimeSec)}`}
              color="purple"
            />
          </div>
        ) : null}

        {/* 负载 & 内存进度条 */}
        {m && (
          <div className="grid grid-cols-2 gap-4 mt-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>系统负载 (1m / 5m / 15m)</span>
                <span className="tabular-nums">
                  {m.loadAvg["1min"]} / {m.loadAvg["5min"]} / {m.loadAvg["15min"]}
                </span>
              </div>
              <ProgressBar
                value={m.loadAvg["1min"]}
                max={m.cpu.cores * 2}
                color={loadColor}
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>V8 堆使用率</span>
                <span className="tabular-nums">{m.process.heapUsedPercent}%</span>
              </div>
              <ProgressBar value={m.process.heapUsedPercent} max={100} color={heapColor} />
            </div>
          </div>
        )}
      </div>

      {/* ═══ 生成任务队列 ═══ */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Activity className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">生成任务队列</h2>
          {workerQuery.isFetching && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
        </div>

        {workerQuery.isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : w ? (
          <div className="grid grid-cols-2 gap-3">
            {/* 图片队列 */}
            <Card className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <Image className="size-4 text-blue-400" />
                <span className="text-xs font-medium">图片生成</span>
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  上限 {w.stats.image.max}
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold text-blue-400 tabular-nums">{w.stats.image.active}</p>
                  <p className="text-[10px] text-muted-foreground">活跃</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-amber-400 tabular-nums">{w.stats.image.queued}</p>
                  <p className="text-[10px] text-muted-foreground">排队</p>
                </div>
                <div>
                  <p className="text-lg font-bold tabular-nums">{w.stats.image.active + w.stats.image.queued}</p>
                  <p className="text-[10px] text-muted-foreground">合计</p>
                </div>
              </div>
              <div className="mt-2">
                <ProgressBar
                  value={w.stats.image.active}
                  max={w.stats.image.max}
                  color={w.stats.image.active >= w.stats.image.max ? "red" : "blue"}
                />
              </div>
            </Card>

            {/* 视频队列 */}
            <Card className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <Video className="size-4 text-purple-400" />
                <span className="text-xs font-medium">视频生成</span>
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  上限 {w.stats.video.max}
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold text-purple-400 tabular-nums">{w.stats.video.active}</p>
                  <p className="text-[10px] text-muted-foreground">活跃</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-amber-400 tabular-nums">{w.stats.video.queued}</p>
                  <p className="text-[10px] text-muted-foreground">排队</p>
                </div>
                <div>
                  <p className="text-lg font-bold tabular-nums">{w.stats.video.active + w.stats.video.queued}</p>
                  <p className="text-[10px] text-muted-foreground">合计</p>
                </div>
              </div>
              <div className="mt-2">
                <ProgressBar
                  value={w.stats.video.active}
                  max={w.stats.video.max}
                  color={w.stats.video.active >= w.stats.video.max ? "red" : "purple"}
                />
              </div>
            </Card>
          </div>
        ) : null}
      </div>

      {/* ═══ 并发上限调整 ═══ */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Zap className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">并发上限调整</h2>
        </div>

        <Card className="p-4 space-y-5">
          {/* 图片并发 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Image className="size-4 text-blue-400" />
                <span className="text-sm">图片并发上限</span>
              </div>
              <Badge variant="outline" className="tabular-nums text-sm font-bold">
                {imageMax}
              </Badge>
            </div>
            <Slider
              value={[imageMax]}
              min={1}
              max={20}
              step={1}
              onValueChange={(v) => {
                const arr = Array.isArray(v) ? v : [v];
                setImageMax(arr[0] ?? 5);
              }}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>1</span>
              <span>建议 5-10</span>
              <span>20</span>
            </div>
          </div>

          {/* 视频并发 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Video className="size-4 text-purple-400" />
                <span className="text-sm">视频并发上限</span>
              </div>
              <Badge variant="outline" className="tabular-nums text-sm font-bold">
                {videoMax}
              </Badge>
            </div>
            <Slider
              value={[videoMax]}
              min={1}
              max={10}
              step={1}
              onValueChange={(v) => {
                const arr = Array.isArray(v) ? v : [v];
                setVideoMax(arr[0] ?? 2);
              }}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>1</span>
              <span>建议 2-4</span>
              <span>10</span>
            </div>
          </div>

          <Button
            onClick={handleSave}
            disabled={updateConfig.isPending}
            className="w-full"
          >
            {updateConfig.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                保存中...
              </>
            ) : (
              <>
                <RefreshCw className="size-4 mr-2" />
                应用并发配置
              </>
            )}
          </Button>
          <p className="text-[10px] text-muted-foreground text-center">
            修改后立即生效，无需重启服务
          </p>
        </Card>
      </div>
    </div>
  );
}
