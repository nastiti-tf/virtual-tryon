import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";
import { getDefaultTryOnSelection, tryOnCategories } from "@/lib/try-on-data";

// Match routes without running loaders or rendering.
describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({
      routeTree,
      context: { queryClient: new QueryClient() },
    });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });

  it("matches the try-on workspace route", () => {
    const router = createRouter({
      routeTree,
      context: { queryClient: new QueryClient() },
    });

    const matches = router.matchRoutes("/try-on");

    expect(matches.at(-1)?.routeId).toBe("/try-on");
  });

  it("matches the character studio route", () => {
    const router = createRouter({
      routeTree,
      context: { queryClient: new QueryClient() },
    });

    const matches = router.matchRoutes("/karakter");

    expect(matches.at(-1)?.routeId).toBe("/karakter");
  });

  it("provides all requested accessory categories", () => {
    expect(tryOnCategories.map((category) => category.name)).toEqual([
      "Kacamata",
      "Rambut",
      "Topi",
      "Kalung",
      "Dasi",
      "Pakaian",
      "Jam Tangan",
      "Gelang",
      "Cincin",
      "Kuku",
    ]);
  });

  it("restores the default accessory, sample, and color", () => {
    const selection = getDefaultTryOnSelection();

    expect(selection.category.name).toBe("Kacamata");
    expect(selection.sample.name).toBe("Bingkai klasik");
    expect(selection.color?.name).toBe("Lilac");
  });
});
