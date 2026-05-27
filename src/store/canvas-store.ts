"use client";

import { create } from "zustand";
import type { AspectRatio } from "@/server/ai-gateway/types";

export type CanvasFilter = "all" | "image" | "video" | "trash";
export type CanvasMode = "i2i" | "i2v";

export interface CanvasMedia {
  id: string;
  type: "IMAGE" | "VIDEO";
  url: string;
  thumbnailUrl?: string;
  prompt: string;
  category: string;
  isFavorite?: boolean;
  createdAt: string;
  generationId?: string;
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

  setFilter: (f: CanvasFilter) => void;
  setSidebarCollapsed: (v: boolean) => void;
  setMode: (m: CanvasMode) => void;
  setPrompt: (p: string) => void;
  setAspectRatio: (r: AspectRatio) => void;
  setSearch: (s: string) => void;
  select: (id: string | null) => void;
  toggleFavorite: (id: string) => void;
  addItem: (item: CanvasMedia) => void;
  removeItem: (id: string) => void;
  setItems: (items: CanvasMedia[]) => void;
  setGenerating: (v: boolean) => void;
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
  removeItem: (id) => set({ items: get().items.filter((it) => it.id !== id) }),
  setItems: (items) => set({ items }),
  setGenerating: (v) => set({ isGenerating: v }),
}));
