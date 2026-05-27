"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ModelState {
  imageModelId: string | null;
  videoModelId: string | null;
  setImageModel: (id: string) => void;
  setVideoModel: (id: string) => void;
}

export const useModelStore = create<ModelState>()(
  persist(
    (set) => ({
      imageModelId: null,
      videoModelId: null,
      setImageModel: (id) => set({ imageModelId: id }),
      setVideoModel: (id) => set({ videoModelId: id }),
    }),
    { name: "i2i-ephone-models" },
  ),
);
