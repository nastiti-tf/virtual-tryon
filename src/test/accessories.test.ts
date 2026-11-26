import { describe, expect, it } from "vitest";

import {
  accessoryCatalog,
  accessoryColors,
  accessorySlots,
  defaultAccessories,
  getAccessoryColor,
  getAccessoryItem,
  makePalette,
  randomAccessories,
} from "@/lib/accessories";
import { defaultCharacter, randomCharacter } from "@/lib/character";

describe("Aksesori bawaan", () => {
  it("punya setidaknya satu model dengan id unik di setiap slot", () => {
    for (const { id } of accessorySlots) {
      const ids = accessoryCatalog[id].map((item) => item.id);

      expect(ids.length).toBeGreaterThan(0);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("dimulai tanpa aksesoris dan dengan warna yang valid", () => {
    for (const { id } of accessorySlots) {
      expect(defaultAccessories[id].id).toBeNull();
      expect(accessoryColors[defaultAccessories[id].color]).toBeDefined();
    }

    expect(defaultCharacter.accessories).toEqual(defaultAccessories);
  });

  it("menemukan model berdasarkan id dan mengabaikan id yang tidak dikenal", () => {
    expect(getAccessoryItem("headwear", "bow")?.name).toBe("Pita");
    expect(getAccessoryItem("headwear", "tidak-ada")).toBeNull();
    expect(getAccessoryItem("headwear", null)).toBeNull();
  });

  it("memakai warna pertama bila indeks warna tidak valid", () => {
    expect(getAccessoryColor(999)).toBe(accessoryColors[0]);
  });

  it("membuat palet terang dan gelap dari satu warna dasar", () => {
    const palette = makePalette("#d94b58");

    expect(palette.base).toBe("#d94b58");
    expect(palette.light).not.toBe(palette.dark);
  });

  it("mengacak ke pilihan yang valid", () => {
    for (let i = 0; i < 25; i++) {
      const next = randomAccessories();

      for (const { id } of accessorySlots) {
        expect(getAccessoryItem(id, next[id].id) !== null || next[id].id === null).toBe(true);
        expect(accessoryColors[next[id].color]).toBeDefined();
      }

      expect(randomCharacter(defaultCharacter).accessories).toBeDefined();
    }
  });
});
