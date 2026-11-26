import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Check,
  Download,
  Layers,
  Palette,
  RotateCcw,
  Shuffle,
  Sparkles,
  User,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { VirtualHeader } from "@/components/virtual-style-shell";
import {
  accessoryCatalog,
  accessoryColors,
  accessorySlots,
  getAccessoryColor,
  getAccessoryItem,
  type AccessorySlot,
} from "@/lib/accessories";
import {
  STAGE,
  characterLayers,
  defaultCharacter,
  getLayerCategory,
  getLayerSample,
  getRequiredImages,
  hairTones,
  pantsTones,
  randomCharacter,
  renderCharacter,
  skinTones,
  type CharacterLayer,
  type CharacterState,
  type PantsStyle,
} from "@/lib/character";

export const Route = createFileRoute("/karakter")({
  head: () => ({
    meta: [
      { title: "Studio Karakter — Virtual Try-On AI" },
      {
        name: "description",
        content:
          "Dandani karakter virtual: pasang-pasangkan baju, rambut, topi, kacamata, kalung, dan dasi pada karakter dasar.",
      },
      { property: "og:title", content: "Studio Karakter — Virtual Try-On AI" },
      {
        property: "og:description",
        content: "Bongkar-pasang gaya pada karakter dasar tanpa perlu kamera.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CharacterPage,
});

type Tab = "body" | "pants" | "accessories" | CharacterLayer;

const tabIcons: Record<"body" | "pants" | "accessories", LucideIcon> = {
  body: User,
  pants: Layers,
  accessories: Palette,
};

const pantsStyles: readonly { id: PantsStyle; name: string }[] = [
  { id: "long", name: "Celana panjang" },
  { id: "skirt", name: "Rok" },
];

function CharacterPage() {
  const [character, setCharacter] = useState<CharacterState>(defaultCharacter);
  const [tab, setTab] = useState<Tab>("clothes");
  const [loadedCount, setLoadedCount] = useState(0);
  const [message, setMessage] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imagesRef = useRef(new Map<string, HTMLImageElement>());
  const pendingRef = useRef(new Set<string>());

  const lookup = (src: string) => imagesRef.current.get(src);

  // Muat gambar aksesoris yang sedang dipakai (sekali per file).
  useEffect(() => {
    for (const src of getRequiredImages(character)) {
      if (imagesRef.current.has(src) || pendingRef.current.has(src)) {
        continue;
      }

      pendingRef.current.add(src);

      const image = new Image();
      image.onload = () => {
        imagesRef.current.set(src, image);
        pendingRef.current.delete(src);
        setLoadedCount((count) => count + 1);
      };
      image.onerror = () => pendingRef.current.delete(src);
      image.src = src;
    }
  }, [character]);

  // Gambar ulang setiap pilihan atau gambar baru siap.
  useEffect(() => {
    const canvas = canvasRef.current;

    if (canvas) {
      const scale = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
      renderCharacter(canvas, character, lookup, scale);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character, loadedCount]);

  const setItem = (layer: CharacterLayer, id: string | null) => {
    setMessage("");
    setCharacter((prev) => ({ ...prev, items: { ...prev.items, [layer]: id } }));
  };

  const setAccessory = (slot: AccessorySlot, id: string | null) => {
    setMessage("");
    setCharacter((prev) => ({
      ...prev,
      accessories: { ...prev.accessories, [slot]: { ...prev.accessories[slot], id } },
    }));
  };

  const setAccessoryColor = (slot: AccessorySlot, color: number) => {
    setMessage("");
    setCharacter((prev) => ({
      ...prev,
      accessories: { ...prev.accessories, [slot]: { ...prev.accessories[slot], color } },
    }));
  };

  const shuffle = () => {
    setMessage("");
    setCharacter((prev) => randomCharacter(prev));
  };

  const reset = () => {
    setMessage("");
    setCharacter(defaultCharacter);
  };

  const save = () => {
    const canvas = document.createElement("canvas");

    if (!renderCharacter(canvas, character, lookup, 2)) {
      setMessage("Browser ini belum bisa menyimpan gambar.");
      return;
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        setMessage("Gambar gagal disimpan. Coba lagi.");
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "karakter-virtual.png";
      link.click();
      URL.revokeObjectURL(url);
      setMessage("Karakter tersimpan sebagai PNG transparan.");
    }, "image/png");
  };

  const tabs: { id: Tab; name: string; icon: LucideIcon }[] = [
    { id: "body", name: "Tubuh", icon: tabIcons.body },
    ...characterLayers.map((layer) => {
      const category = getLayerCategory(layer);
      return { id: layer as Tab, name: category.name, icon: category.icon };
    }),
    { id: "pants", name: "Bawahan", icon: tabIcons.pants },
    { id: "accessories", name: "Aksesori", icon: tabIcons.accessories },
  ];

  const wornLayers = characterLayers.flatMap((layer) => {
    const sample = getLayerSample(layer, character.items[layer]);
    return sample ? [{ layer: layer as string, label: `${getLayerCategory(layer).name}: ${sample.name}` }] : [];
  });
  const wornBuiltIn = accessorySlots.flatMap(({ id }) => {
    const selection = character.accessories[id];
    const item = getAccessoryItem(id, selection.id);
    return item
      ? [{ layer: `acc-${id}`, label: `${item.name} · ${getAccessoryColor(selection.color).name}` }]
      : [];
  });
  const worn = [...wornLayers, ...wornBuiltIn];

  const activeLayer = tab !== "body" && tab !== "pants" && tab !== "accessories" ? tab : null;
  const activeCategory = activeLayer ? getLayerCategory(activeLayer) : null;
  const swatchClass = (active: boolean) =>
    `grid size-9 place-items-center rounded-full border border-foreground/10 outline-offset-2 transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${
      active ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
    }`;

  return (
    <div className="min-h-screen bg-background">
      <VirtualHeader workspace current="karakter" />

      <main className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 sm:py-9 lg:px-12">
        <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span className="grid size-6 place-items-center rounded-full bg-accent text-primary">
                <Sparkles className="size-3.5" aria-hidden="true" />
              </span>
              STUDIO KARAKTER
            </div>
            <h1 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">
              Dandani karaktermu
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Pilih baju, rambut, dan aksesori, lalu pasang-pasangkan sesukamu.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={shuffle} variant="outline" size="sm" className="rounded-md">
              <Shuffle aria-hidden="true" />
              Acak gaya
            </Button>
            <Button onClick={reset} variant="outline" size="sm" className="rounded-md">
              <RotateCcw aria-hidden="true" />
              Reset
            </Button>
            <Button onClick={save} size="sm" className="rounded-md">
              <Download aria-hidden="true" />
              Simpan PNG
            </Button>
          </div>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px] xl:gap-7">
          <section aria-label="Pratinjau karakter" className="min-w-0">
            <div className="relative flex h-[520px] items-end justify-center overflow-hidden rounded-[4px] bg-secondary px-4 pt-4 sm:h-[660px]">
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-accent/70 to-transparent" />
              <canvas
                ref={canvasRef}
                role="img"
                aria-label="Karakter dengan pakaian dan aksesori pilihanmu"
                width={STAGE.width * 2}
                height={STAGE.height * 2}
                className="relative h-full w-auto max-w-full"
              />
            </div>

            <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 pt-3 text-xs">
              <ul className="flex flex-wrap gap-1.5" aria-label="Yang sedang dipakai">
                {worn.length === 0 ? (
                  <li className="text-muted-foreground">Belum ada aksesori terpasang.</li>
                ) : (
                  worn.map(({ layer, label }) => (
                    <li
                      key={layer}
                      className="rounded-full bg-accent px-2.5 py-1 font-medium text-accent-foreground"
                    >
                      {label}
                    </li>
                  ))
                )}
              </ul>

              {message && (
                <p role="status" className="flex items-center gap-1.5 text-foreground">
                  <Check className="size-3.5 text-primary" aria-hidden="true" />
                  {message}
                </p>
              )}
            </div>
          </section>

          <aside className="border-t border-border bg-background pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0 xl:pl-7">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-semibold text-foreground">Lemari</h2>
              <span className="text-xs text-muted-foreground">
                {String(tabs.length).padStart(2, "0")} bagian
              </span>
            </div>

            <div className="mt-4 grid grid-cols-4 gap-2" role="group" aria-label="Bagian karakter">
              {tabs.map(({ id, name, icon: Icon }) => (
                <Button
                  key={id}
                  type="button"
                  variant="outline"
                  aria-pressed={tab === id}
                  onClick={() => setTab(id)}
                  className={`h-auto min-h-[62px] flex-col gap-1.5 whitespace-normal rounded-sm px-1 py-2 text-[11px] font-medium shadow-none ${
                    tab === id
                      ? "border-primary bg-accent text-primary"
                      : "border-border bg-background text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  <Icon className="size-[18px]" strokeWidth={1.7} aria-hidden="true" />
                  {name}
                </Button>
              ))}
            </div>

            <div className="mt-6 border-t border-border pt-5">
              {tab === "body" && (
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-foreground">Warna kulit</h3>
                      <span className="text-xs text-muted-foreground">
                        {skinTones[character.skin]?.name}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2.5" role="group" aria-label="Warna kulit">
                      {skinTones.map((tone, index) => (
                        <button
                          key={tone.name}
                          type="button"
                          aria-label={tone.name}
                          aria-pressed={character.skin === index}
                          onClick={() => setCharacter((prev) => ({ ...prev, skin: index }))}
                          className={swatchClass(character.skin === index)}
                          style={{ backgroundColor: tone.base }}
                        >
                          {character.skin === index && (
                            <Check className="size-3.5 text-foreground" aria-hidden="true" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-foreground">Warna rambut dasar</h3>
                      <span className="text-xs text-muted-foreground">
                        {hairTones[character.hairTone]?.name}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2.5" role="group" aria-label="Warna rambut">
                      {hairTones.map((tone, index) => (
                        <button
                          key={tone.name}
                          type="button"
                          aria-label={tone.name}
                          aria-pressed={character.hairTone === index}
                          onClick={() => setCharacter((prev) => ({ ...prev, hairTone: index }))}
                          className={swatchClass(character.hairTone === index)}
                          style={{ backgroundColor: tone.color }}
                        >
                          {character.hairTone === index && (
                            <Check className="size-3.5 text-white" aria-hidden="true" />
                          )}
                        </button>
                      ))}
                    </div>
                    <p className="mt-3 text-xs leading-5 text-muted-foreground">
                      Rambut dasar tertutup saat kamu memakai wig dari bagian Rambut.
                    </p>
                  </div>
                </div>
              )}

              {tab === "pants" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Model</h3>
                    <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="Model bawahan">
                      {pantsStyles.map(({ id, name }) => (
                        <Button
                          key={id}
                          type="button"
                          variant="outline"
                          aria-pressed={character.pantsStyle === id}
                          onClick={() => setCharacter((prev) => ({ ...prev, pantsStyle: id }))}
                          className={`h-10 rounded-sm text-xs font-medium shadow-none ${
                            character.pantsStyle === id
                              ? "border-primary bg-accent/50 text-foreground"
                              : "border-border hover:bg-secondary"
                          }`}
                        >
                          {name}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-foreground">Warna</h3>
                      <span className="text-xs text-muted-foreground">
                        {pantsTones[character.pantsTone]?.name}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2.5" role="group" aria-label="Warna bawahan">
                      {pantsTones.map((tone, index) => (
                        <button
                          key={tone.name}
                          type="button"
                          aria-label={tone.name}
                          aria-pressed={character.pantsTone === index}
                          onClick={() => setCharacter((prev) => ({ ...prev, pantsTone: index }))}
                          className={swatchClass(character.pantsTone === index)}
                          style={{ backgroundColor: tone.color }}
                        >
                          {character.pantsTone === index && (
                            <Check className="size-3.5 text-white" aria-hidden="true" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {tab === "accessories" && (
                <div className="space-y-7">
                  <p className="text-xs leading-5 text-muted-foreground">
                    Aksesori bawaan digambar langsung, jadi warnanya bebas kamu ganti.
                  </p>

                  {accessorySlots.map(({ id: slot, name }) => {
                    const selection = character.accessories[slot];
                    const chosen = getAccessoryItem(slot, selection.id);
                    const chip = (active: boolean) =>
                      `h-auto min-h-10 whitespace-normal rounded-sm px-2 py-2 text-center text-[11px] font-medium shadow-none ${
                        active
                          ? "border-primary bg-accent/50 text-foreground"
                          : "border-border hover:bg-secondary"
                      }`;

                    return (
                      <div key={slot}>
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-sm font-semibold text-foreground">{name}</h3>
                          {chosen && (
                            <span className="text-xs text-muted-foreground">
                              {getAccessoryColor(selection.color).name}
                            </span>
                          )}
                        </div>

                        <div
                          className="mt-3 grid grid-cols-3 gap-2"
                          role="group"
                          aria-label={`Aksesori ${name.toLowerCase()}`}
                        >
                          <Button
                            type="button"
                            variant="outline"
                            aria-pressed={selection.id === null}
                            onClick={() => setAccessory(slot, null)}
                            className={chip(selection.id === null)}
                          >
                            Tanpa
                          </Button>
                          {accessoryCatalog[slot].map((item) => (
                            <Button
                              key={item.id}
                              type="button"
                              variant="outline"
                              aria-pressed={selection.id === item.id}
                              onClick={() => setAccessory(slot, item.id)}
                              className={chip(selection.id === item.id)}
                            >
                              {item.name}
                            </Button>
                          ))}
                        </div>

                        {chosen && (
                          <div
                            className="mt-3 flex flex-wrap gap-2.5"
                            role="group"
                            aria-label={`Warna ${chosen.name}`}
                          >
                            {accessoryColors.map((color, index) => (
                              <button
                                key={color.name}
                                type="button"
                                aria-label={color.name}
                                aria-pressed={selection.color === index}
                                onClick={() => setAccessoryColor(slot, index)}
                                className={swatchClass(selection.color === index)}
                                style={{ backgroundColor: color.hex }}
                              >
                                {selection.color === index && (
                                  <Check
                                    className={`size-3.5 ${
                                      color.name === "Putih" || color.name === "Kuning"
                                        ? "text-foreground"
                                        : "text-white"
                                    }`}
                                    aria-hidden="true"
                                  />
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {activeLayer && activeCategory && (
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
                        {activeCategory.name}
                      </p>
                      <h3 className="mt-1 text-sm font-semibold text-foreground">Pilih gaya</h3>
                    </div>
                    <span className="grid size-9 place-items-center rounded-full bg-accent text-primary">
                      <activeCategory.icon className="size-4" aria-hidden="true" />
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      aria-pressed={character.items[activeLayer] === null}
                      onClick={() => setItem(activeLayer, null)}
                      className={`h-auto min-h-[92px] flex-col gap-2 whitespace-normal rounded-sm px-2 py-3 text-center shadow-none ${
                        character.items[activeLayer] === null
                          ? "border-primary bg-accent/50"
                          : "border-border hover:bg-secondary"
                      }`}
                    >
                      <span className="grid size-9 place-items-center rounded-full bg-secondary text-muted-foreground">
                        <RotateCcw className="size-4" aria-hidden="true" />
                      </span>
                      <span className="text-[11px] font-medium leading-4 text-foreground">
                        {activeLayer === "clothes" ? "Baju dasar" : "Tanpa"}
                      </span>
                    </Button>

                    {activeCategory.samples.map((sample) => (
                      <Button
                        key={sample.id}
                        type="button"
                        variant="outline"
                        aria-pressed={character.items[activeLayer] === sample.id}
                        onClick={() => setItem(activeLayer, sample.id)}
                        className={`h-auto min-h-[92px] flex-col gap-2 whitespace-normal rounded-sm px-2 py-3 text-center shadow-none ${
                          character.items[activeLayer] === sample.id
                            ? "border-primary bg-accent/50"
                            : "border-border hover:bg-secondary"
                        }`}
                      >
                        {sample.thumbnail && (
                          <img
                            src={sample.thumbnail}
                            alt=""
                            loading="lazy"
                            className="h-10 w-full object-contain"
                          />
                        )}
                        <span className="text-[11px] font-medium leading-4 text-foreground">
                          {sample.name}
                        </span>
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <p className="mt-6 border-l-2 border-primary/50 py-1 pl-3 text-xs leading-5 text-muted-foreground">
              Semua pilihan memakai katalog yang sama dengan studio kamera, jadi aset baru yang
              ditambahkan di sana otomatis muncul di sini.
            </p>
          </aside>
        </div>
      </main>
    </div>
  );
}
