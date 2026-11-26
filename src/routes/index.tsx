import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUpRight, Camera, Check, Glasses, ScanFace, Sparkles } from "lucide-react";

import studioPortrait from "@/assets/style-studio-editorial.jpg";
import { Button } from "@/components/ui/button";
import { VirtualFooter, VirtualHeader } from "@/components/virtual-style-shell";
import { tryOnCategories } from "@/lib/try-on-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Virtual Try-On AI — Coba gaya secara virtual" },
      {
        name: "description",
        content:
          "Jelajahi gaya baru dan akses studio Virtual Try-On AI untuk mencoba aksesori serta pakaian melalui kamera.",
      },
      { property: "og:title", content: "Virtual Try-On AI — Coba gaya secara virtual" },
      {
        property: "og:description",
        content: "Cara personal untuk menjelajahi gaya, dari kacamata hingga detail pelengkap.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  return (
    <div className="min-h-screen overflow-hidden bg-background">
      <VirtualHeader />
      <main>
        <section className="mx-auto grid w-full max-w-[1320px] items-center gap-12 px-6 pb-20 pt-12 sm:px-10 lg:min-h-[690px] lg:grid-cols-[0.94fr_1.06fr] lg:gap-16 lg:px-12 lg:pb-24 lg:pt-9">
          <div className="order-2 max-w-[560px] lg:order-1">
            <div className="mb-7 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <span className="grid size-7 place-items-center rounded-full bg-accent text-primary">
                <Sparkles className="size-3.5" aria-hidden="true" />
              </span>
              Cara baru untuk mencoba gaya
            </div>
            <h1 className="font-display text-5xl font-semibold leading-[1.07] text-foreground sm:text-6xl lg:text-[66px]">
              Gayamu,
              <br />
              <span className="text-primary">Versi Virtual</span>
              <br />
              Untukmu.
            </h1>
            <p className="mt-7 max-w-[430px] text-base leading-7 text-muted-foreground sm:text-lg">
              Temukan detail kecil yang terasa paling kamu. Jelajahi pilihan aksesori dan pakaian,
              lalu masuk ke studio untuk melihat pratinjau kamera.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-5">
              <Button asChild size="lg" className="h-12 rounded-md px-6 text-sm">
                <Link to="/try-on">
                  Mulai Coba Virtual
                  <ArrowUpRight aria-hidden="true" />
                </Link>
              </Button>
              <a
                href="#discover"
                className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-foreground transition-colors hover:text-primary"
              >
                Jelajahi pilihan <ArrowDown className="size-4" aria-hidden="true" />
              </a>
            </div>
            <div className="mt-11 flex items-center gap-3 border-t border-border pt-5 text-sm text-muted-foreground">
              <span className="flex -space-x-2" aria-hidden="true">
                <span className="grid size-8 place-items-center rounded-full border-2 border-background bg-secondary text-secondary-foreground">
                  <Glasses className="size-3.5" />
                </span>
                <span className="grid size-8 place-items-center rounded-full border-2 border-background bg-accent text-primary">
                  <Sparkles className="size-3.5" />
                </span>
                <span className="grid size-8 place-items-center rounded-full border-2 border-background bg-muted text-foreground">
                  <Check className="size-3.5" />
                </span>
              </span>
              <span>Lebih terasa dirimu, di setiap detail.</span>
            </div>
          </div>

          <div className="order-1 relative mx-auto w-full max-w-[650px] lg:order-2 lg:ml-auto">
            <div className="absolute -left-5 -top-5 hidden h-24 w-24 border-l border-t border-primary/30 sm:block" />
            <div className="relative aspect-[1.13/1] overflow-hidden rounded-[4px] bg-muted sm:aspect-[1.15/1]">
              <img
                src={studioPortrait}
                alt="Model mengenakan kacamata lilac transparan di studio dengan pencahayaan lembut"
                width={1600}
                height={1200}
                fetchPriority="high"
                className="h-full w-full object-cover object-[58%_46%]"
              />
              <div className="absolute bottom-5 left-5 flex items-center gap-2 bg-background/90 px-3 py-2 text-xs font-medium text-foreground backdrop-blur-sm">
                <span className="size-2 rounded-full bg-primary" />
                Gaya favoritmu berikutnya menanti
              </div>
            </div>
            <div className="absolute -bottom-4 -right-4 hidden h-24 w-24 border-b border-r border-primary/30 sm:block" />
            <div className="absolute right-4 top-4 grid size-11 place-items-center rounded-full bg-background/90 text-primary backdrop-blur-sm sm:right-6 sm:top-6">
              <ScanFace className="size-5" aria-hidden="true" />
            </div>
          </div>
        </section>

        <section id="discover" className="scroll-mt-8 border-y border-border bg-secondary/45">
          <div className="mx-auto max-w-[1320px] px-6 py-16 sm:px-10 lg:px-12 lg:py-20">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                  Pilihan untuk setiap gaya
                </p>
                <h2 className="mt-3 font-display text-3xl font-semibold tracking-normal text-foreground sm:text-4xl">
                  Temukan sentuhan akhirmu.
                </h2>
              </div>
              <Link
                to="/try-on"
                className="inline-flex min-h-10 w-fit items-center gap-2 text-sm font-medium text-foreground transition-colors hover:text-primary"
              >
                Buka studio <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
            <div className="mt-9 grid grid-cols-2 gap-x-4 gap-y-0 sm:grid-cols-3 lg:grid-cols-9 lg:gap-x-3">
              {tryOnCategories.map(({ name, icon: Icon }) => (
                <Link
                  key={name}
                  to="/try-on"
                  className="group flex min-h-24 items-center gap-3 border-t border-border py-4 text-sm font-medium text-foreground transition-colors hover:text-primary lg:min-h-28 lg:flex-col lg:items-start lg:gap-4 lg:py-5"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-background text-muted-foreground transition-colors group-hover:bg-accent group-hover:text-primary">
                    <Icon className="size-[18px]" strokeWidth={1.7} aria-hidden="true" />
                  </span>
                  {name}
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section
          id="benefits"
          className="mx-auto max-w-[1320px] px-6 py-16 sm:px-10 lg:px-12 lg:py-24"
        >
          <div className="grid gap-12 lg:grid-cols-[0.74fr_1.26fr] lg:gap-20">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                Dengan caramu sendiri
              </p>
              <h2 className="mt-3 max-w-[410px] font-display text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
                Mencoba sesuatu yang baru terasa mudah.
              </h2>
              <p className="mt-5 max-w-[390px] text-sm leading-6 text-muted-foreground">
                Ikuti rasa ingin tahumu. Jelajahi pilihan, tentukan detail, dan lihat lebih dekat
                gaya yang menarik perhatianmu.
              </p>
            </div>
            <div className="divide-y divide-border border-y border-border">
              <article className="grid gap-3 py-5 sm:grid-cols-[56px_1fr] sm:gap-5 sm:py-6">
                <span className="grid size-10 place-items-center rounded-full bg-accent text-primary">
                  <Camera className="size-[18px]" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    Jadikan kamera cerminmu
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Gunakan kamera untuk pratinjau personal langsung di peramban.
                  </p>
                </div>
              </article>
              <article className="grid gap-3 py-5 sm:grid-cols-[56px_1fr] sm:gap-5 sm:py-6">
                <span className="grid size-10 place-items-center rounded-full bg-accent text-primary">
                  <Glasses className="size-[18px]" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    Satu studio, banyak pilihan
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Jelajahi aksesori dan pakaian dalam satu studio.
                  </p>
                </div>
              </article>
              <article className="grid gap-3 py-5 sm:grid-cols-[56px_1fr] sm:gap-5 sm:py-6">
                <span className="grid size-10 place-items-center rounded-full bg-accent text-primary">
                  <Sparkles className="size-[18px]" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    Simpan yang terasa cocok
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Ambil tangkapan layar gaya yang ingin kamu ingat.
                  </p>
                </div>
              </article>
            </div>
          </div>
          <div className="mt-14 flex flex-col items-start justify-between gap-5 border-t border-border pt-8 sm:flex-row sm:items-center">
            <p className="font-display text-xl font-medium text-foreground">
              Siap melihat lebih dekat?
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline" className="rounded-md">
                <Link to="/try-on">
                  Masuk ke studio <ArrowUpRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="rounded-md">
                <Link to="/karakter">
                  Dandani karakter <ArrowUpRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
      <VirtualFooter />
    </div>
  );
}
