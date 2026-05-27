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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";

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

  useEffect(() => {
    if (promptsQuery.data) {
      setPosePrompts(promptsQuery.data.pose);
      setProductTitle(promptsQuery.data.productTitle);
      setProductDescription(promptsQuery.data.productDescription);
    }
  }, [promptsQuery.data]);

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
