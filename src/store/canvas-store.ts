"use client";

import { create } from "zustand";
import type { AspectRatio } from "@/server/ai-gateway/types";

export type CanvasFilter = "all" | "image" | "video";
export type CanvasMode = "i2i" | "i2v";

export interface CanvasMedia {
  id: string;
  type: "IMAGE" | "VIDEO";
  url: string;
  thumbnailUrl?: string;
  originalUrl?: string;
  prompt: string;
  category: string;
  isFavorite?: boolean;
  createdAt: string;
  generationId?: string;
  generationStatus?: "QUEUED" | "GENERATING" | "FAILED" | null;
  /** 首次检测到 FAILED 的时间戳（ms），用于 TTL 自动消隐 */
  failedAt?: number;
  userName?: string;
}

interface CanvasState {
  items: CanvasMedia[];
  selectedId: string | null;
  filter: CanvasFilter;
  mode: CanvasMode;
  prompt: string;
  aspectRatio: AspectRatio;
  isGenerating: boolean;
  search: string;
  sidebarCollapsed: boolean;

  // 跨页面持久化的生成任务追踪
  pendingGenId: string | null;
  pendingGenMode: "i2i" | "i2v" | null;
  pendingGenPrompt: string;
  /** 生成任务开始时间戳（ms），用于跨页面计时器不重置 */
  generationStartTime: number | null;

  // 视频生成参数（Sora-2 via 兔子中转）
  videoDuration: string;
  videoSize: string;
  /** @deprecated Sora-2 不再使用画质参数，保留兼容 */
  videoMode: string;
  /** @deprecated Sora-2 不再使用声音参数，保留兼容 */
  videoSound: string;

  setFilter: (f: CanvasFilter) => void;
  setSidebarCollapsed: (v: boolean) => void;
  setMode: (m: CanvasMode) => void;
  setPrompt: (p: string) => void;
  setAspectRatio: (r: AspectRatio) => void;
  setSearch: (s: string) => void;
  select: (id: string | null) => void;
  toggleFavorite: (id: string) => void;
  addItem: (item: CanvasMedia) => void;
  updateItem: (id: string, patch: Partial<CanvasMedia>) => void;
  appendItems: (items: CanvasMedia[]) => void;
  removeItem: (id: string) => void;
  setItems: (items: CanvasMedia[]) => void;
  setGenerating: (v: boolean) => void;
  /** 设置当前生成任务信息 */
  setPendingGeneration: (payload: {
    genId: string;
    mode: "i2i" | "i2v";
    prompt: string;
    startTime: number;
  }) => void;
  /** 清除生成任务（完成/失败时调用） */
  clearPendingGeneration: () => void;
  /** 更新开始时间（从后端恢复时调用） */
  setGenerationStartTime: (t: number) => void;
  setVideoDuration: (d: string) => void;
  setVideoSize: (s: string) => void;
  /** @deprecated */
  setVideoMode: (m: string) => void;
  /** @deprecated */
  setVideoSound: (s: string) => void;
}

const SEED_ITEMS: CanvasMedia[] = [];

export const useCanvasStore = create<CanvasState>((set, get) => ({
  items: SEED_ITEMS,
  selectedId: null,
  filter: "all",
  mode: "i2i",
  prompt: "",
  aspectRatio: "1:1",
  isGenerating: false,
  search: "",
  sidebarCollapsed: false,
  pendingGenId: null,
  pendingGenMode: null,
  pendingGenPrompt: "",
  generationStartTime: null,
  videoDuration: "8",
  videoSize: "1280x720",
  videoMode: "pro",
  videoSound: "off",

  setFilter: (f) => set({ filter: f }),
  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
  setMode: (m) => set({ mode: m }),
  setPrompt: (p) => set({ prompt: p }),
  setAspectRatio: (r) => set({ aspectRatio: r }),
  setSearch: (s) => set({ search: s }),
  select: (id) => set({ selectedId: id }),
  toggleFavorite: (id) =>
    set({
      items: get().items.map((it) =>
        it.id === id ? { ...it, isFavorite: !it.isFavorite } : it,
      ),
    }),
  addItem: (item) => set({ items: [item, ...get().items] }),
  updateItem: (id, patch) =>
    set({
      items: get().items.map((it) =>
        it.id === id ? { ...it, ...patch } : it,
      ),
    }),
  appendItems: (newItems) => set({ items: [...get().items, ...newItems] }),
  removeItem: (id) => set({ items: get().items.filter((it) => it.id !== id) }),
  setItems: (items) => set({ items }),
  setGenerating: (v) => set({ isGenerating: v }),
  setPendingGeneration: ({ genId, mode, prompt, startTime }) =>
    set({
      pendingGenId: genId,
      pendingGenMode: mode,
      pendingGenPrompt: prompt,
      generationStartTime: startTime,
      isGenerating: true,
    }),
  clearPendingGeneration: () =>
    set({
      pendingGenId: null,
      pendingGenMode: null,
      pendingGenPrompt: "",
      generationStartTime: null,
      isGenerating: false,
    }),
  setGenerationStartTime: (t) => set({ generationStartTime: t }),
  setVideoDuration: (d) => set({ videoDuration: d }),
  setVideoSize: (s) => set({ videoSize: s }),
  setVideoMode: (m) => set({ videoMode: m }),
  setVideoSound: (s) => set({ videoSound: s }),
}));
