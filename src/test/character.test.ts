import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  characterLayers,
  defaultCharacter,
  getLayerCategory,
  getLayerPose,
  getLayerSample,
  getRequiredImages,
  hairTones,
  pantsTones,
  randomCharacter,
  skinTones,
} from "@/lib/character";
import { resolveOverlayFit } from "@/lib/try-on-data";

const publicDir = path.resolve(__dirname, "../../public");

describe("Character builder", () => {
  it("uses only layers that exist in the try-on catalog, each with real assets", () => {
    for (const layer of characterLayers) {
      const category = getLayerCategory(layer);

      expect(category.samples.length).toBeGreaterThan(0);

      for (const sample of category.samples) {
        expect(sample.overlay2d, `${sample.id} needs an overlay`).toBeTruthy();
        expect(existsSync(path.join(publicDir, sample.overlay2d!)), sample.id).toBe(true);
        expect(existsSync(path.join(publicDir, sample.thumbnail!)), sample.id).toBe(true);
      }
    }
  });

  it("starts with a valid default outfit", () => {
    for (const layer of characterLayers) {
      const id = defaultCharacter.items[layer];

      if (id) {
        expect(getLayerSample(layer, id)?.id).toBe(id);
      }
    }

    expect(getRequiredImages(defaultCharacter)).toEqual(["/overlays/clothes/senin_blazer.webp"]);
  });

  it("computes finite, positive overlay sizes for every sample", () => {
    for (const layer of characterLayers) {
      for (const sample of getLayerCategory(layer).samples) {
        const pose = getLayerPose(layer, resolveOverlayFit(sample));

        expect(Number.isFinite(pose.x + pose.y)).toBe(true);
        expect(pose.width).toBeGreaterThan(0);
      }
    }
  });

  it("shuffles into valid selections", () => {
    for (let i = 0; i < 25; i++) {
      const next = randomCharacter(defaultCharacter);

      expect(next.items.clothes).not.toBeNull();
      expect(skinTones[next.skin]).toBeDefined();
      expect(hairTones[next.hairTone]).toBeDefined();
      expect(pantsTones[next.pantsTone]).toBeDefined();

      for (const layer of characterLayers) {
        const id = next.items[layer];
        expect(id === null || getLayerSample(layer, id) !== null).toBe(true);
      }
    }
  });
});
