"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/server/trpc/client";
import { POSE_TYPES, POSE_LABELS, type PoseType } from "@/lib/pose-types";
import {
  getDefaultPromptSettings,
  PROMPT_CONFIG_SECTIONS,
} from "@/lib/prompt-defaults";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { Trash2, Loader2, Clock, XCircle, RefreshCw } from "lucide-react";
import { PerformanceDashboard } from "./PerformanceDashboard";

type UserRow = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  disabled: boolean;
  credits: number;
  createdAt: Date;
  _count: {
    generations: number;
    fusionBatches: number;
    poseBatches: number;
  };
};

export function AdminPanel() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [grantAmount, setGrantAmount] = useState("100");
  const [setCreditsVal, setSetCreditsVal] = useState("");
  const defaults = getDefaultPromptSettings();
  const [posePrompts, setPosePrompts] = useState<Record<PoseType, string>>(
    () => defaults.pose,
  );
  const [productTitle, setProductTitle] = useState(defaults.productTitle);
  const [productDescription, setProductDescription] = useState(
    defaults.productDescription,
  );
  const [imageModelId, setImageModelId] = useState("");
  const [videoModelId, setVideoModelId] = useState("");
  const [textModelId, setTextModelId] = useState("");

  const usersQuery = useQuery(
    trpc.admin.listUsers.queryOptions({ search: search || undefined }),
  );
  const promptsQuery = useQuery(trpc.admin.getPromptSettings.queryOptions());
  const usageQuery = useQuery({
    ...trpc.admin.getUserUsage.queryOptions({ userId: selectedUserId! }),
    enabled: !!selectedUserId,
  });
  const tasksQuery = useQuery({
    ...trpc.admin.getUserTasks.queryOptions({ userId: selectedUserId! }),
    enabled: !!selectedUserId,
  });

  const invalidateUsers = () =>
    qc.invalidateQueries({ queryKey: trpc.admin.listUsers.queryKey() });

  const setDisabled = useMutation(
    trpc.admin.setUserDisabled.mutationOptions({
      onSuccess: () => {
        invalidateUsers();
        toast.success("已更新账户状态");
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const setRole = useMutation(
    trpc.admin.setUserRole.mutationOptions({
      onSuccess: (data) => {
        invalidateUsers();
        const label = data.role === "ADMIN" ? "超级管理员" : data.role === "MANAGER" ? "管理员" : "普通成员";
        toast.success(`${data.name ?? data.email} 已设为${label}`);
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const grantCredits = useMutation(
    trpc.admin.grantCredits.mutationOptions({
      onSuccess: () => {
        invalidateUsers();
        usageQuery.refetch();
        toast.success("配额已发放");
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const setCredits = useMutation(
    trpc.admin.setCredits.mutationOptions({
      onSuccess: () => {
        invalidateUsers();
        usageQuery.refetch();
        toast.success("配额已设置");
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const savePrompts = useMutation(
    trpc.admin.updatePromptSettings.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({
          queryKey: trpc.admin.getPromptSettings.queryKey(),
        });
        toast.success("提示词已保存");
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const modelSettingsQuery = useQuery(
    trpc.admin.getModelSettings.queryOptions(),
  );
  const saveModels = useMutation(
    trpc.admin.updateModelSettings.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({
          queryKey: trpc.admin.getModelSettings.queryKey(),
        });
        toast.success("模型配置已保存");
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  async function fetchModels(category: "image" | "video" | "other") {
    const res = await fetch(`/api/ephone/models?category=${category}`);
    if (!res.ok) return [];
    return res.json() as Promise<{ id: string }[]>;
  }

  const imageModelsQuery = useQuery({
    queryKey: ["ephone-models", "image"],
    queryFn: () => fetchModels("image"),
    staleTime: 5 * 60 * 1000,
  });
  const videoModelsQuery = useQuery({
    queryKey: ["ephone-models", "video"],
    queryFn: () => fetchModels("video"),
    staleTime: 5 * 60 * 1000,
  });
  const textModelsQuery = useQuery({
    queryKey: ["ephone-models", "other"],
    queryFn: () => fetchModels("other"),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (promptsQuery.data) {
      setPosePrompts(promptsQuery.data.pose);
      setProductTitle(promptsQuery.data.productTitle);
      setProductDescription(promptsQuery.data.productDescription);
    }
  }, [promptsQuery.data]);

  useEffect(() => {
    if (modelSettingsQuery.data) {
      setImageModelId(modelSettingsQuery.data.imageModelId);
      setVideoModelId(modelSettingsQuery.data.videoModelId);
      setTextModelId(modelSettingsQuery.data.textModelId);
    }
  }, [modelSettingsQuery.data]);

  const users = (usersQuery.data ?? []) as UserRow[];
  const selectedUser = users.find((u) => u.id === selectedUserId);

  return (
    <div className="h-full flex flex-col">
      <div className="border-b p-4">
        <h1 className="text-lg font-semibold">管理后台</h1>
        <p className="text-sm text-muted-foreground">
          用户账户、配额、任务与系统提示词
        </p>
      </div>

      <Tabs defaultValue="users" className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-4 mt-4 w-fit">
          <TabsTrigger value="users">用户管理</TabsTrigger>
          <TabsTrigger value="prompts">提示词配置</TabsTrigger>
          <TabsTrigger value="models">模型配置</TabsTrigger>
          <TabsTrigger value="performance">性能监测</TabsTrigger>
          <TabsTrigger value="cleanup">系统清理</TabsTrigger>
          <TabsTrigger value="tasks">任务控制</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="flex-1 overflow-auto p-4 mt-0">
          <div className="flex gap-2 mb-4">
            <Input
              placeholder="搜索邮箱或昵称"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
          </div>

          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2 font-medium">用户</th>
                  <th className="text-left p-2 font-medium">角色</th>
                  <th className="text-left p-2 font-medium">配额</th>
                  <th className="text-left p-2 font-medium">用量</th>
                  <th className="text-left p-2 font-medium">状态</th>
                  <th className="text-left p-2 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t">
                    <td className="p-2">
                      <div className="font-medium">{u.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {u.email}
                      </div>
                    </td>
                    <td className="p-2">
                      <Select
                        value={u.role}
                        onValueChange={(v) => {
                          if (v && v !== u.role) {
                            setRole.mutate({ userId: u.id, role: v as "USER" | "MANAGER" | "ADMIN" });
                          }
                        }}
                      >
                        <SelectTrigger className="h-8 w-28 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USER">普通成员</SelectItem>
                          <SelectItem value="MANAGER">管理员</SelectItem>
                          <SelectItem value="ADMIN">超级管理员</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2">{u.credits}</td>
                    <td className="p-2 text-xs text-muted-foreground">
                      生成 {u._count.generations} · 融合{" "}
                      {u._count.fusionBatches} · 姿势 {u._count.poseBatches}
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={!u.disabled}
                          onCheckedChange={(on) =>
                            setDisabled.mutate({
                              userId: u.id,
                              disabled: !on,
                            })
                          }
                        />
                        <span className="text-xs">
                          {u.disabled ? "已禁用" : "正常"}
                        </span>
                      </div>
                    </td>
                    <td className="p-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedUserId(u.id);
                          setSetCreditsVal(String(u.credits));
                        }}
                      >
                        详情
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="prompts" className="flex-1 overflow-auto p-4 mt-0">
          <div className="max-w-3xl space-y-6">
            <Card className="p-4 space-y-4">
              <div>
                <h2 className="text-sm font-medium">可配置项（共 6 项）</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  未保存时使用下方默认文案；保存后写入数据库 SystemSetting
                </p>
              </div>
              {PROMPT_CONFIG_SECTIONS.map((section) => (
                <div key={section.title}>
                  <p className="text-xs font-medium">{section.title}</p>
                  <p className="text-xs text-muted-foreground mb-2">
                    {section.description}
                  </p>
                  <ul className="text-sm space-y-1">
                    {section.items.map((item) => (
                      <li key={item.id} className="flex gap-2">
                        <span className="text-muted-foreground">·</span>
                        <span>{item.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {promptsQuery.isLoading && (
                <p className="text-xs text-muted-foreground">正在加载已保存配置…</p>
              )}
              {promptsQuery.isError && (
                <p className="text-xs text-destructive">
                  加载失败：{promptsQuery.error.message}（已显示默认值，仍可编辑保存）
                </p>
              )}
            </Card>

            <div>
                <h2 className="text-sm font-medium mb-3">多姿势生成提示词</h2>
                <div className="space-y-4">
                  {POSE_TYPES.map((pose) => (
                    <div key={pose}>
                      <label className="text-xs text-muted-foreground">
                        {POSE_LABELS[pose]}
                      </label>
                      <Textarea
                        className="mt-1 min-h-[80px]"
                        value={posePrompts[pose]}
                        onChange={(e) =>
                          setPosePrompts((prev) => ({
                            ...prev,
                            [pose]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">
                  商品标题生成提示词
                </label>
                <Textarea
                  className="mt-1 min-h-[80px]"
                  value={productTitle}
                  onChange={(e) => setProductTitle(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">
                  商品描述生成提示词
                </label>
                <Textarea
                  className="mt-1 min-h-[100px]"
                  value={productDescription}
                  onChange={(e) => setProductDescription(e.target.value)}
                />
              </div>

              <Button
                disabled={savePrompts.isPending}
                onClick={() =>
                  savePrompts.mutate({
                    pose: posePrompts,
                    productTitle,
                    productDescription,
                  })
                }
              >
                保存提示词
              </Button>
          </div>
        </TabsContent>

        <TabsContent value="models" className="flex-1 overflow-auto p-4 mt-0">
          <div className="max-w-3xl space-y-6">
            <Card className="p-4 space-y-4">
              <div>
                <h2 className="text-sm font-medium">默认模型</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  设置后将应用到所有用户的生成任务中，用户端不再显示模型选择器。
                </p>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">
                  默认图片模型
                </label>
                {imageModelsQuery.isLoading ? (
                  <p className="text-xs text-muted-foreground">加载中…</p>
                ) : (
                  <Select
                    value={imageModelId}
                    onValueChange={(v) => v && setImageModelId(v)}
                  >
                    <SelectTrigger className="mt-1 h-9 w-full">
                      <SelectValue placeholder="选择图片模型" />
                    </SelectTrigger>
                    <SelectContent>
                      {(imageModelsQuery.data ?? []).map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div>
                <label className="text-xs text-muted-foreground">
                  默认视频模型
                </label>
                {videoModelsQuery.isLoading ? (
                  <p className="text-xs text-muted-foreground">加载中…</p>
                ) : (
                  <Select
                    value={videoModelId}
                    onValueChange={(v) => v && setVideoModelId(v)}
                  >
                    <SelectTrigger className="mt-1 h-9 w-full">
                      <SelectValue placeholder="选择视频模型" />
                    </SelectTrigger>
                    <SelectContent>
                      {(videoModelsQuery.data ?? []).map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div>
                <label className="text-xs text-muted-foreground">
                  默认文本模型（商品文案 / 翻译）
                </label>
                {textModelsQuery.isLoading ? (
                  <p className="text-xs text-muted-foreground">加载中…</p>
                ) : (
                  <Select
                    value={textModelId}
                    onValueChange={(v) => v && setTextModelId(v)}
                  >
                    <SelectTrigger className="mt-1 h-9 w-full">
                      <SelectValue placeholder="选择文本模型" />
                    </SelectTrigger>
                    <SelectContent>
                      {(textModelsQuery.data ?? []).map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <Button
                disabled={saveModels.isPending}
                onClick={() =>
                  saveModels.mutate({ imageModelId, videoModelId, textModelId })
                }
              >
                保存模型配置
              </Button>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="performance" className="flex-1 overflow-auto p-4 mt-0">
          <PerformanceDashboard />
        </TabsContent>

        <TabsContent value="cleanup" className="flex-1 overflow-auto p-4 mt-0">
          <CleanupSection />
        </TabsContent>

        <TabsContent value="tasks" className="flex-1 overflow-auto p-4 mt-0">
          <TaskControlSection />
        </TabsContent>
      </Tabs>

      <Dialog
        open={!!selectedUserId}
        onOpenChange={(open) => !open && setSelectedUserId(null)}
      >
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedUser?.email ?? "用户详情"}</DialogTitle>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-4 text-sm">
              <Card className="p-3 space-y-2">
                <p className="font-medium">配额管理</p>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground">
                      增加配额
                    </label>
                    <Input
                      type="number"
                      value={grantAmount}
                      onChange={(e) => setGrantAmount(e.target.value)}
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={() =>
                      grantCredits.mutate({
                        userId: selectedUser.id,
                        amount: parseInt(grantAmount, 10) || 0,
                      })
                    }
                  >
                    发放
                  </Button>
                </div>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground">
                      设为指定值
                    </label>
                    <Input
                      type="number"
                      value={setCreditsVal}
                      onChange={(e) => setSetCreditsVal(e.target.value)}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setCredits.mutate({
                        userId: selectedUser.id,
                        credits: parseInt(setCreditsVal, 10) || 0,
                      })
                    }
                  >
                    设置
                  </Button>
                </div>
              </Card>

              {usageQuery.data && (
                <Card className="p-3 space-y-1">
                  <p className="font-medium">使用情况</p>
                  <p>当前配额：{usageQuery.data.user.credits}</p>
                  <p>
                    累计消耗：{usageQuery.data.totalConsumed} 积分
                  </p>
                  <p>融合任务：{usageQuery.data.fusionBatchCount}</p>
                  <p>多姿势任务：{usageQuery.data.poseBatchCount}</p>
                  {usageQuery.data.generationStats.map((s) => (
                    <p key={s.status} className="text-muted-foreground">
                      {s.status}: {s._count}
                    </p>
                  ))}
                </Card>
              )}

              {tasksQuery.data && (
                <Card className="p-3 space-y-2">
                  <p className="font-medium">当前任务</p>
                  {tasksQuery.data.activeGenerations.length === 0 &&
                    tasksQuery.data.fusionBatches.length === 0 &&
                    tasksQuery.data.poseBatches.length === 0 && (
                      <p className="text-muted-foreground">暂无任务</p>
                    )}
                  {tasksQuery.data.activeGenerations.map((g) => (
                    <div
                      key={g.id}
                      className="text-xs border rounded p-2"
                    >
                      <span className="font-medium">{g.status}</span> ·{" "}
                      {g.type}
                      {g.modelId ? ` · ${g.modelId}` : ""}
                      {g.poseType ? ` · ${g.poseType}` : ""}
                      <div className="text-muted-foreground truncate">
                        {g.prompt}
                      </div>
                    </div>
                  ))}
                  {tasksQuery.data.fusionBatches.map((b) => (
                    <div key={b.id} className="text-xs">
                      融合 · {b.title} · {b._count.rows} 行 ·{" "}
                      {format(new Date(b.updatedAt), "MM-dd HH:mm")}
                    </div>
                  ))}
                  {tasksQuery.data.poseBatches.map((b) => (
                    <div key={b.id} className="text-xs">
                      多姿势 · {b.title} · {b._count.rows} 行 ·{" "}
                      {format(new Date(b.updatedAt), "MM-dd HH:mm")}
                    </div>
                  ))}
                </Card>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CleanupSection() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [trashDays, setTrashDays] = useState("3");
  const [libraryDays, setLibraryDays] = useState("7");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    // 保存到 localStorage 或 system settings
    localStorage.setItem("cleanup-trash-days", trashDays);
    localStorage.setItem("cleanup-library-days", libraryDays);
    toast.success("清理参数已保存");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const cleanupMut = useMutation(
    trpc.trash.cleanup.mutationOptions({
      onSuccess: (d) => {
        toast.success(`清理完成：回收站 ${d.trashDeleted} 张，素材库 ${d.assetsTrashed} 张`);
        qc.invalidateQueries({ queryKey: trpc.admin.listUsers.queryKey() });
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const { data: logs } = useQuery(
    trpc.admin.getCleanupLogs.queryOptions({ limit: 10 }),
  );

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Trash2 className="size-5" /> 系统清理
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">回收站保留天数</label>
          <Input value={trashDays} onChange={(e) => setTrashDays(e.target.value)} type="number" min="1" max="30" />
          <p className="text-xs text-muted-foreground">超过此天数的回收站内容将被永久删除</p>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">素材库保留天数</label>
          <Input value={libraryDays} onChange={(e) => setLibraryDays(e.target.value)} type="number" min="1" max="365" />
          <p className="text-xs text-muted-foreground">超过此天数的素材自动移入回收站</p>
        </div>
        <div className="flex items-end gap-2">
          <Button onClick={handleSave} variant="outline" size="sm">
            {saved ? "已保存" : "保存设置"}
          </Button>
          <Button
            variant="destructive" size="sm"
            onClick={() => cleanupMut.mutate()}
            disabled={cleanupMut.isPending}
          >
            {cleanupMut.isPending ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Trash2 className="size-4 mr-1" />}
            立即执行
          </Button>
        </div>
      </div>

      {logs && logs.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium flex items-center gap-1"><Clock className="size-3.5" /> 清理记录</h3>
          <div className="border rounded-lg divide-y">
            {logs.map((log) => (
              <div key={log.id} className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-4">
                <span className="w-36 shrink-0">{new Date(log.createdAt).toLocaleString("zh-CN")}</span>
                <span>🗑 删除 {log.deletedCount}</span>
                <span>📥 移入回收站 {log.trashedCount}</span>
                {log.error && <span className="text-red-500 truncate">{log.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TaskControlSection() {
  const trpc = useTRPC();
  const qc = useQueryClient();

  const activeQuery = useQuery({
    ...trpc.admin.getActiveTasks.queryOptions(undefined, {
      refetchInterval: 3000,
      refetchOnWindowFocus: true,
    }),
  });

  const logsQuery = useQuery(
    trpc.admin.getTaskLogs.queryOptions({ limit: 30 }),
  );

  const cancelMut = useMutation(
    trpc.admin.cancelTask.mutationOptions({
      onSuccess: () => {
        toast.success("任务已取消并退款");
        qc.invalidateQueries(trpc.admin.getActiveTasks.queryFilter());
        qc.invalidateQueries(trpc.admin.getTaskLogs.queryFilter({ limit: 30 }));
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const active = activeQuery.data ?? [];
  const logs = logsQuery.data ?? [];

  function fmt(s: number) {
    if (s < 60) return s + "s";
    const m = Math.floor(s / 60);
    return m + "m" + (s % 60) + "s";
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <RefreshCw className="size-5" /> 任务控制
        <Button variant="ghost" size="sm" className="h-7 ml-auto" onClick={() => { activeQuery.refetch(); logsQuery.refetch(); }}>
          <RefreshCw className="size-3.5 mr-1" />刷新
        </Button>
      </h2>
      <div>
        <h3 className="text-sm font-medium mb-2">当前队列 ({active.length})</h3>
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">无活跃任务</p>
        ) : (
          <div className="border rounded-lg divide-y">
            {active.map((t) => (
              <div key={t.id} className="px-3 py-2 flex items-center gap-3 text-xs">
                <span className={"w-20 font-medium " + (t.status === "PROCESSING" ? "text-blue-500" : t.status === "QUEUED" ? "text-amber-500" : "text-muted-foreground")}>
                  {t.status === "PROCESSING" ? "生成中" : t.status === "QUEUED" ? "排队中" : t.status}
                </span>
                <span className="w-12">{t.type}</span>
                <span className="w-28 truncate text-muted-foreground">{t.modelId}</span>
                <span className="w-32 truncate">{t.prompt}</span>
                <span className="w-16 tabular-nums text-muted-foreground">{fmt(t.elapsed)}</span>
                <span className="flex-1 truncate text-muted-foreground">{t.user?.name ?? t.user?.email?.split("@")[0]}</span>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500"
                  onClick={() => cancelMut.mutate({ generationId: t.id })} disabled={cancelMut.isPending}>
                  <XCircle className="size-3.5 mr-1" />取消
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <h3 className="text-sm font-medium mb-2">最近日志 ({logs.length})</h3>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">无日志</p>
        ) : (
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full table-fixed text-[11px] leading-tight">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-2 py-1.5 w-[92px] whitespace-nowrap">发起</th>
                  <th className="text-left px-2 py-1.5 w-[92px] whitespace-nowrap">开始</th>
                  <th className="text-right px-1 py-1.5 w-12">排队</th>
                  <th className="text-center px-1 py-1.5 w-8">类型</th>
                  <th className="text-center px-1 py-1.5 w-14">来源</th>
                  <th className="text-left px-1 py-1.5 w-24 truncate">模型</th>
                  <th className="text-left px-1 py-1.5 w-20 hidden xl:table-cell">参数</th>
                  <th className="text-right px-2 py-1.5 w-14">LLM</th>
                  <th className="text-right px-2 py-1.5 w-14">OSS</th>
                  <th className="text-right px-2 py-1.5 w-14">总耗时</th>
                  <th className="text-left px-2 py-1.5 w-16 truncate">用户</th>
                  <th className="text-center px-1 py-1.5 w-10 whitespace-nowrap">状态</th>
                  <th className="text-left px-2 py-1.5 w-32 whitespace-nowrap">失败原因</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {logs.map((t) => (
                  <tr key={t.id} className="hover:bg-muted/30">
                    <td className="px-2 py-1 text-muted-foreground whitespace-nowrap">
                      {t.createdAt ? new Date(t.createdAt).toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"}) : "-"}
                    </td>
                    <td className="px-2 py-1 text-muted-foreground whitespace-nowrap">
                      {t.startedAt ? new Date(t.startedAt).toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"}) : "-"}
                    </td>
                    <td className="px-1 py-1 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                      {t.queuedSec ? t.queuedSec+"s" : "-"}
                    </td>
                    <td className="px-1 py-1 text-center">{t.type === "IMAGE" ? "IMG" : "VID"}</td>
                    <td className="px-1 py-1 text-center whitespace-nowrap">{t.source ?? "-"}</td>
                    <td className="px-1 py-1 text-[10px] truncate max-w-[96px] text-muted-foreground" title={t.modelId}>{t.modelId}</td>
                    <td className="px-1 py-1 text-[9px] text-muted-foreground hidden xl:table-cell">
                      {(t as any).params ? [
                        (t as any).params.duration ? `${(t as any).params.duration}s` : "",
                        (t as any).params.mode === "pro" ? "高清" : (t as any).params.mode === "4k" ? "4K" : (t as any).params.mode === "std" ? "标清" : "",
                        (t as any).params.sound === "on" ? "有声" : "",
                        (t as any).params.aspectRatio ? (t as any).params.aspectRatio : "",
                      ].filter(Boolean).join(" ") || "-" : "-"}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap">{t.genDurationMs != null ? (t.genDurationMs/1000).toFixed(1)+"s" : "-"}</td>
                    <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap">{t.ossDurationMs != null ? (t.ossDurationMs/1000).toFixed(1)+"s" : "-"}</td>
                    <td className="px-2 py-1 text-right tabular-nums font-medium whitespace-nowrap">{t.wallSec ?? "-"}s</td>
                    <td className="px-2 py-1 text-muted-foreground truncate">{t.user?.name ?? t.user?.email?.split("@")[0] ?? "-"}</td>
                    <td className={"px-1 py-1 text-center font-medium whitespace-nowrap " + (t.status === "COMPLETED" ? "text-green-600" : t.status === "FAILED" ? "text-red-500" : t.status === "CANCELLED" ? "text-amber-500" : "text-muted-foreground")}>
                      {t.status === "COMPLETED" ? "完成" : t.status === "FAILED" ? "失败" : t.status === "CANCELLED" ? "取消" : t.status}
                    </td>
                    <td className="px-2 py-1 text-[10px] text-red-400 truncate max-w-[128px]" title={t.errorMessage ?? ""}>
                      {t.status === "FAILED" ? (t.errorMessage || "-") : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
