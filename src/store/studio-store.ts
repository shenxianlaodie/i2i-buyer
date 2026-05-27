"use client";

import { create } from "zustand";
import type { ProviderId, AspectRatio } from "@/server/ai-gateway/types";

interface StudioState {
  selectedProvider: ProviderId | null;
  selectedModel: string | null;
  promptText: string;
  negativePrompt: string;
  aspectRatio: AspectRatio;
  numOutputs: number;
  seed: number | null;
  guidanceScale: number;
  steps: number;
  generationMode: "t2i" | "t2v" | "edit";
  referenceImageUrl: string | null;

  setProvider: (p: ProviderId) => void;
  setModel: (m: string) => void;
  setPrompt: (text: string) => void;
  setNegativePrompt: (text: string) => void;
  setAspectRatio: (ratio: AspectRatio) => void;
  setNumOutputs: (n: number) => void;
  setSeed: (s: number | null) => void;
  setGuidanceScale: (g: number) => void;
  setSteps: (s: number) => void;
  setGenerationMode: (mode: "t2i" | "t2v" | "edit") => void;
  setReferenceImageUrl: (url: string | null) => void;
  reset: () => void;
}

const defaults = {
  selectedProvider: null as ProviderId | null,
  selectedModel: null as string | null,
  promptText: "",
  negativePrompt: "",
  aspectRatio: "1:1" as AspectRatio,
  numOutputs: 1,
  seed: null as number | null,
  guidanceScale: 7.5,
  steps: 28,
  generationMode: "t2i" as const,
  referenceImageUrl: null as string | null,
};

export const useStudioStore = create<StudioState>((set) => ({
  ...defaults,
  setProvider: (p) => set({ selectedProvider: p }),
  setModel: (m) => set({ selectedModel: m }),
  setPrompt: (t) => set({ promptText: t }),
  setNegativePrompt: (t) => set({ negativePrompt: t }),
  setAspectRatio: (r) => set({ aspectRatio: r }),
  setNumOutputs: (n) => set({ numOutputs: n }),
  setSeed: (s) => set({ seed: s }),
  setGuidanceScale: (g) => set({ guidanceScale: g }),
  setSteps: (s) => set({ steps: s }),
  setGenerationMode: (mode) => set({ generationMode: mode }),
  setReferenceImageUrl: (url) => set({ referenceImageUrl: url }),
  reset: () => set(defaults),
}));
