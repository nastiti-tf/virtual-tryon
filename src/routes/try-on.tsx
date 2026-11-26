import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { FaceLandmarker, HandLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";
import { Aperture, Camera, Check, Download, LoaderCircle, Sparkles, X } from "lucide-react";

import studioPortrait from "@/assets/style-studio-editorial.jpg";
import { VirtualHeader } from "@/components/virtual-style-shell";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_HIJAB_REACH,
  HijabRecolorer,
  defaultHijabColor,
  hijabColors,
} from "@/lib/hijab";
import {
  computeHandOverlays,
  drawHandOverlays,
  readHands,
  smoothHandOverlays,
  type HandImages,
} from "@/lib/hand-fit";
import {
  loadFaceLandmarker,
  loadHandLandmarker,
  loadImageSegmenter,
  loadPoseLandmarker,
  nextTimestamp,
} from "@/lib/mediapipe";
import {
  SMOOTHING,
  computeOverlayPose,
  drawOverlay,
  hasVisibleShoulders,
  smoothPose,
  type OverlayPose,
  type TrackingData,
  type View,
} from "@/lib/overlay-fit";
import {
  defaultTryOnCategory,
  hasOverlay as sampleHasOverlay,
  resolveOverlayFit,
  tryOnCategories,
  tryOnColors,
  type TryOnCategory,
  type TryOnSample,
} from "@/lib/try-on-data";

export const Route = createFileRoute("/try-on")({
  head: () => ({
    meta: [
      { title: "Try-On Studio — Virtual Try-On AI" },
      {
        name: "description",
        content:
          "Explore the Virtual Try-On AI studio. Select accessories, choose a color, and preview yourself on camera.",
      },
      {
        property: "og:title",
        content: "Try-On Studio — Virtual Try-On AI",
      },
      {
        property: "og:description",
        content:
          "Explore accessories in your own camera preview with the Virtual Try-On AI studio.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TryOnPage,
});

/** "partial": aksesoris leher terpasang dari perkiraan wajah karena bahu belum terlihat. */
type TrackingStatus = "off" | "loading" | "searching" | "tracking" | "partial" | "error";

/** Status pelacakan hijab: area hijab ditemukan lewat segmentasi + landmark wajah. */
type HijabStatus = "off" | "loading" | "searching" | "tracking" | "error";

function TryOnPage() {
  const initialColor = tryOnColors[0] ?? {
    name: "Lilac",
    className: "bg-swatch-lilac",
  };

  const [selectedCategory, setSelectedCategory] = useState<TryOnCategory>(defaultTryOnCategory);

  const [selectedSample, setSelectedSample] = useState<TryOnSample>(
    defaultTryOnCategory.samples[0],
  );

  const [selectedColor, setSelectedColor] = useState<{
    name: string;
    className: string;
  }>(initialColor);

  const [cameraState, setCameraState] = useState<"idle" | "starting" | "active" | "error">("idle");

  const [cameraError, setCameraError] = useState("");
  const [snapshotMessage, setSnapshotMessage] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const overlayImageRef = useRef<HTMLImageElement | null>(null);
  // Kuku: satu gambar per jari, kuncinya "<set>_<jari>" (mis. "a_index").
  const nailImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const trackingRef = useRef<TrackingData>({ face: null, pose: null });

  const [trackingStatus, setTrackingStatus] = useState<TrackingStatus>("off");

  const hijabCanvasRef = useRef<HTMLCanvasElement>(null);
  const hijabEngineRef = useRef<HijabRecolorer | null>(null);
  const [hijabEnabled, setHijabEnabled] = useState(false);
  const [hijabColor, setHijabColor] = useState<string>(defaultHijabColor.hex);
  const [hijabReach, setHijabReach] = useState(DEFAULT_HIJAB_REACH);
  const [hijabDebug, setHijabDebug] = useState(false);
  const [hijabStatus, setHijabStatus] = useState<HijabStatus>("off");
  // Nilai terbaru dibaca loop kamera lewat ref, supaya mengganti warna tidak memuat ulang model.
  const hijabSettingsRef = useRef({ color: hijabColor, reach: hijabReach, debug: hijabDebug });
  useEffect(() => {
    hijabSettingsRef.current = { color: hijabColor, reach: hijabReach, debug: hijabDebug };
  }, [hijabColor, hijabReach, hijabDebug]);

  // Muat gambar aksesoris yang dipilih (satu gambar, atau satu per jari untuk kuku).
  useEffect(() => {
    const src = selectedSample.overlay2d;
    const nails = selectedSample.nails;
    overlayImageRef.current = null;
    nailImagesRef.current = new Map();

    const loaded: HTMLImageElement[] = [];

    if (src) {
      const image = new Image();
      image.onload = () => {
        overlayImageRef.current = image;
      };
      image.src = src;
      loaded.push(image);
    }

    if (nails) {
      const images = new Map<string, HTMLImageElement>();

      for (const [side, hand] of Object.entries(nails)) {
        for (const [finger, url] of Object.entries(hand)) {
          const image = new Image();
          image.onload = () => {
            images.set(`${side}_${finger}`, image);
          };
          image.src = url;
          loaded.push(image);
        }
      }

      // Gambar baru masuk ke peta ini satu per satu saat selesai dimuat.
      nailImagesRef.current = images;
    }

    return () => {
      for (const image of loaded) {
        image.onload = null;
      }
    };
  }, [selectedSample]);

  // Deteksi landmark dan gambar aksesoris di atas kamera live.
  // Landmark mengikuti jenis aksesoris: mata (kacamata), kepala (topi, rambut), bahu (kalung, dasi),
  // bahu + pinggul (baju, rompi, blazer), pergelangan (jam tangan, gelang), jari (kuku).
  // (Foto studio sudah memakai kacamata, jadi tidak diberi overlay.)
  useEffect(() => {
    const canvas = canvasRef.current;

    trackingRef.current = { face: null, pose: null };

    if (!canvas || cameraState !== "active" || !sampleHasOverlay(selectedSample)) {
      setTrackingStatus("off");
      return;
    }

    const anchor = selectedSample.anchor ?? "eyes";
    // Aksesoris tangan memakai Hand Landmarker saja; wajah tidak perlu dimuat.
    const handAnchor = anchor === "wrist" || anchor === "nails";
    const fit = resolveOverlayFit(selectedSample);

    let cancelled = false;
    let frameId = 0;
    let faceLandmarker: FaceLandmarker | null = null;
    let poseLandmarker: PoseLandmarker | null = null;
    let handLandmarker: HandLandmarker | null = null;
    const handPoses = new Map<string, OverlayPose>();
    let ready = false;
    let lastVideoTime = -1;
    let lastTimestamp = 0;
    let frameCount = 0;
    let pose: OverlayPose | null = null;
    let status: TrackingStatus = "loading";

    const update = (next: TrackingStatus) => {
      if (!cancelled && next !== status) {
        status = next;
        setTrackingStatus(next);
      }
    };

    setTrackingStatus("loading");

    // Model bahu hanya dimuat untuk aksesoris leher dan badan; jika gagal, posisinya diperkirakan dari wajah.
    const needsBody = anchor === "neck" || anchor === "torso";
    const poseLoad = needsBody ? loadPoseLandmarker().catch(() => null) : Promise.resolve(null);

    const faceLoad = handAnchor ? Promise.resolve(null) : loadFaceLandmarker();
    const handLoad = handAnchor ? loadHandLandmarker() : Promise.resolve(null);

    Promise.all([faceLoad, poseLoad, handLoad])
      .then(([face, bodyPose, hand]) => {
        faceLandmarker = face;
        poseLandmarker = bodyPose;
        handLandmarker = hand;
        ready = true;
        update("searching");
      })
      .catch(() => update("error"));

    const frame = () => {
      frameId = requestAnimationFrame(frame);

      const context = canvas.getContext("2d");
      const video = videoRef.current;
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      if (!context || !video || width === 0 || height === 0) {
        return;
      }

      // Samakan resolusi canvas dengan ukuran tampil (termasuk layar retina).
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);

      if (
        !ready ||
        (!faceLandmarker && !handLandmarker) ||
        !video.videoWidth ||
        !video.videoHeight
      ) {
        return;
      }

      // Deteksi hanya saat ada frame video baru; timestamp harus selalu naik.
      if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        lastTimestamp = nextTimestamp();
        frameCount += 1;

        try {
          if (faceLandmarker) {
            const faceResult = faceLandmarker.detectForVideo(video, lastTimestamp);
            trackingRef.current.face = faceResult.faceLandmarks[0] ?? null;
          }

          // Tangan bergerak cepat, jadi dideteksi di setiap frame.
          if (handLandmarker) {
            const handResult = handLandmarker.detectForVideo(video, lastTimestamp);
            trackingRef.current.hands = readHands(handResult);
          }

          // Bahu bergerak lebih lambat daripada wajah, cukup dideteksi tiap dua frame.
          if (poseLandmarker && frameCount % 2 === 0) {
            const poseResult = poseLandmarker.detectForVideo(video, lastTimestamp);
            trackingRef.current.pose = poseResult.landmarks[0] ?? null;
          }
        } catch {
          update("error");
          return;
        }
      }

      const view: View = {
        sourceWidth: video.videoWidth,
        sourceHeight: video.videoHeight,
        width,
        height,
        mirror: true, // video ditampilkan -scale-x-100
      };

      if (handAnchor) {
        const overlays = computeHandOverlays(anchor, trackingRef.current.hands, view, fit);

        if (overlays.length === 0) {
          handPoses.clear();
          update("searching");
          return;
        }

        update("tracking");
        drawHandOverlays(
          context,
          smoothHandOverlays(handPoses, overlays, SMOOTHING[anchor]),
          { single: overlayImageRef.current, nails: nailImagesRef.current },
          fit,
        );
        return;
      }

      const next = computeOverlayPose(anchor, trackingRef.current, view, fit);

      if (!next) {
        pose = null;
        update("searching");
        return;
      }

      const shouldersMissing = needsBody && !hasVisibleShoulders(trackingRef.current.pose);
      update(shouldersMissing ? "partial" : "tracking");

      const overlay = overlayImageRef.current;

      if (!overlay) {
        return;
      }

      pose = smoothPose(pose, next, SMOOTHING[anchor]);
      drawOverlay(context, overlay, pose, fit);
    };

    frameId = requestAnimationFrame(frame);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      trackingRef.current = { face: null, pose: null, hands: null };
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [cameraState, selectedSample]);

  // Ubah warna hijab: segmentasi (area hijab) dibatasi landmark wajah, lalu diwarnai ulang.
  // Digambar di kanvas sendiri (di antara video dan aksesoris) dan tidak bergantung pada aksesori terpilih.
  useEffect(() => {
    const canvas = hijabCanvasRef.current;

    if (!canvas || cameraState !== "active" || !hijabEnabled) {
      setHijabStatus("off");
      return;
    }

    let cancelled = false;
    let frameId = 0;
    let engine: HijabRecolorer | null = null;
    let faceLandmarker: FaceLandmarker | null = null;
    let lastVideoTime = -1;
    let frameCount = 0;
    let misses = 0;
    let status: HijabStatus = "loading";

    const update = (next: HijabStatus) => {
      if (!cancelled && next !== status) {
        status = next;
        setHijabStatus(next);
      }
    };

    setHijabStatus("loading");

    Promise.all([loadFaceLandmarker(), loadImageSegmenter()])
      .then(([face, segmenter]) => {
        if (cancelled) {
          return;
        }

        faceLandmarker = face;
        engine = new HijabRecolorer(segmenter);
        hijabEngineRef.current = engine;
        update("searching");
      })
      .catch(() => update("error"));

    const frame = () => {
      frameId = requestAnimationFrame(frame);

      const context = canvas.getContext("2d");
      const video = videoRef.current;
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      if (!context || !video || width === 0 || height === 0) {
        return;
      }

      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);

      if (!engine || !faceLandmarker || !video.videoWidth || !video.videoHeight) {
        return;
      }

      // Segmentasi cukup tiap 3 frame video baru; mask terakhir dipakai di antaranya.
      if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        frameCount += 1;

        if (frameCount % 3 === 1) {
          try {
            const face = faceLandmarker.detectForVideo(video, nextTimestamp()).faceLandmarks[0];

            if (face && engine.update(video, face, nextTimestamp(), hijabSettingsRef.current.reach)) {
              misses = 0;
            } else {
              misses += 1;
            }
          } catch {
            update("error");
            return;
          }

          // Wajah hilang beberapa saat → sembunyikan hasil lama agar tidak "menempel".
          if (misses > 8) {
            engine.clear();
          }
        }
      }

      if (!engine.ready) {
        update("searching");
        return;
      }

      update("tracking");

      const view: View = {
        sourceWidth: video.videoWidth,
        sourceHeight: video.videoHeight,
        width,
        height,
        mirror: true,
      };

      engine.draw(context, video, view, {
        color: hijabSettingsRef.current.color,
        debug: hijabSettingsRef.current.debug,
      });
    };

    frameId = requestAnimationFrame(frame);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      hijabEngineRef.current = null;
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [cameraState, hijabEnabled]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const changeCategory = (category: (typeof tryOnCategories)[number]) => {
    setSelectedCategory(category);
    setSelectedSample(category.samples[0]);
  };

  const startCamera = async () => {
    setCameraError("");
    setSnapshotMessage("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "Camera access isn't available here. You can still explore the studio preview.",
      );
      setCameraState("error");
      return;
    }

    setCameraState("starting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraState("active");
    } catch (error) {
      const name = error instanceof Error ? error.name : "";

      setCameraError(
        name === "NotAllowedError" || name === "PermissionDeniedError"
          ? "Camera permission was declined. Allow camera access in your browser settings to try it live."
          : name === "NotFoundError" || name === "DevicesNotFoundError"
            ? "No camera was found on this device. You can still explore the studio preview."
            : "We couldn't start your camera. Check that it's connected and available, then try again.",
      );

      setCameraState("error");
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraError("");
    setCameraState("idle");
  };

  const saveSnapshot = () => {
    const video = videoRef.current;
    const image = imageRef.current;

    const sourceWidth = video && cameraState === "active" ? video.videoWidth : image?.naturalWidth;

    const sourceHeight =
      video && cameraState === "active" ? video.videoHeight : image?.naturalHeight;

    if (!sourceWidth || !sourceHeight) {
      setSnapshotMessage("The preview is still loading. Try again in a moment.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;

    const context = canvas.getContext("2d");

    if (!context) {
      setSnapshotMessage("This browser couldn't save the snapshot. Please try another browser.");
      return;
    }

    const live = Boolean(video) && cameraState === "active";

    if (video && live) {
      context.save();
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      context.restore();
    } else if (image) {
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    }

    // Sertakan hijab berwarna baru (di bawah aksesoris, sama seperti di layar).
    if (live && video && hijabEnabled && hijabEngineRef.current) {
      hijabEngineRef.current.draw(
        context,
        video,
        { sourceWidth, sourceHeight, width: canvas.width, height: canvas.height, mirror: true },
        { color: hijabSettingsRef.current.color },
      );
    }

    // Sertakan aksesoris pada hasil snapshot (koordinat penuh, tanpa crop object-cover).
    const overlay = overlayImageRef.current;
    const snapshotAnchor = selectedSample.anchor ?? "eyes";

    if (live && (snapshotAnchor === "wrist" || snapshotAnchor === "nails")) {
      const images: HandImages = { single: overlay, nails: nailImagesRef.current };
      const fit = resolveOverlayFit(selectedSample);

      drawHandOverlays(
        context,
        computeHandOverlays(
          snapshotAnchor,
          trackingRef.current.hands,
          { sourceWidth, sourceHeight, width: canvas.width, height: canvas.height, mirror: true },
          fit,
        ),
        images,
        fit,
      );
    } else if (live && overlay) {
      const fit = resolveOverlayFit(selectedSample);
      const view: View = {
        sourceWidth,
        sourceHeight,
        width: canvas.width,
        height: canvas.height,
        mirror: true,
      };
      const pose = computeOverlayPose(
        selectedSample.anchor ?? "eyes",
        trackingRef.current,
        view,
        fit,
      );

      if (pose) {
        drawOverlay(context, overlay, pose, fit);
      }
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        setSnapshotMessage("This browser couldn't save the snapshot. Please try again.");
        return;
      }

      const url = URL.createObjectURL(blob);
      const download = document.createElement("a");

      download.href = url;
      download.download = "virtual-try-on-preview.png";
      download.click();

      URL.revokeObjectURL(url);

      setSnapshotMessage("Your preview has been saved.");
    }, "image/png");
  };

  const hasOverlay = sampleHasOverlay(selectedSample);
  const handAccessory = selectedSample.anchor === "wrist" || selectedSample.anchor === "nails";

  const trackingMessage =
    cameraState !== "active"
      ? "Camera stays off until you choose to activate it."
      : !hasOverlay
        ? "Pemasangan langsung untuk kategori ini belum tersedia."
        : trackingStatus === "loading"
          ? handAccessory
            ? "Memuat pelacak tangan…"
            : "Memuat pelacak wajah…"
          : trackingStatus === "searching"
            ? handAccessory
              ? "Tangan belum terdeteksi. Angkat tangan ke depan kamera, punggung tangan menghadap kamera, jari terbuka."
              : "Wajah belum terdeteksi. Hadapkan wajah ke kamera dengan cahaya yang cukup."
            : trackingStatus === "partial"
              ? selectedSample.anchor === "torso"
                ? "Bahu belum terlihat. Mundur sampai bahu masuk frame agar pakaian pas di badanmu."
                : "Bahu belum terlihat. Mundur sedikit agar posisinya lebih pas."
              : "Aksesoris mengikuti gerakanmu.";

  const hijabMessage =
    hijabStatus === "loading"
      ? "Memuat model hijab…"
      : hijabStatus === "searching"
        ? "Hijab belum terdeteksi. Hadapkan wajah ke kamera dengan cahaya yang cukup."
        : hijabStatus === "error"
          ? "Model hijab gagal dimuat. Periksa koneksi internet, lalu muat ulang halaman."
          : "";

  const ActiveIcon = selectedCategory.icon;

  return (
    <div className="min-h-screen bg-background">
      <VirtualHeader workspace current="try-on" />

      <main className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 sm:py-9 lg:px-12">
        <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span className="grid size-6 place-items-center rounded-full bg-accent text-primary">
                <Sparkles className="size-3.5" aria-hidden="true" />
              </span>
              THE PERSONAL STYLING ROOM
            </div>

            <h1 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">
              Your try-on studio
            </h1>

            <p className="mt-2 text-sm text-muted-foreground">
              Choose an edit, find your color, see how you feel.
            </p>
          </div>

          <div className="flex min-h-9 items-center gap-2 text-xs font-medium text-muted-foreground">
            <span
              className={`size-2 rounded-full ${
                cameraState === "active" ? "bg-primary" : "bg-muted-foreground/50"
              }`}
            />
            {cameraState === "active" ? "Camera on" : "Preview mode"}
          </div>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px] xl:gap-7">
          <section aria-label="Camera preview" className="min-w-0">
            <div className="relative aspect-[4/3] min-h-0 max-h-[760px] overflow-hidden rounded-[4px] bg-secondary sm:aspect-[16/10] lg:aspect-[1.18/1] xl:aspect-[1.3/1]">
              <img
                ref={imageRef}
                src={studioPortrait}
                alt="Studio sample portrait for your preview"
                width={1600}
                height={1200}
                className={`absolute inset-0 h-full w-full object-cover object-[58%_43%] ${
                  cameraState === "active" ? "hidden" : "block"
                }`}
              />

              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                aria-label="Your live camera preview"
                className={`absolute inset-0 h-full w-full -scale-x-100 object-cover ${
                  cameraState === "active" ? "block" : "hidden"
                }`}
              />

              <canvas
                ref={hijabCanvasRef}
                aria-hidden="true"
                className={`pointer-events-none absolute inset-0 h-full w-full ${
                  cameraState === "active" ? "block" : "hidden"
                }`}
              />

              <canvas
                ref={canvasRef}
                aria-hidden="true"
                className={`pointer-events-none absolute inset-0 h-full w-full ${
                  cameraState === "active" ? "block" : "hidden"
                }`}
              />

              <div className="absolute left-4 top-4 flex items-center gap-2 bg-background/90 px-3 py-2 text-xs font-medium text-foreground backdrop-blur-sm sm:left-5 sm:top-5">
                <Aperture className="size-3.5 text-primary" aria-hidden="true" />
                {cameraState === "active" ? "LIVE CAMERA" : "STUDIO PREVIEW"}
              </div>

              <div className="absolute right-4 top-4 grid size-9 place-items-center bg-background/90 text-muted-foreground backdrop-blur-sm sm:right-5 sm:top-5">
                <ActiveIcon className="size-4" aria-hidden="true" />
              </div>

              {cameraState !== "active" && (
                <div className="absolute inset-x-4 bottom-[72px] flex justify-center sm:bottom-[82px]">
                  <div className="max-w-[300px] bg-background/90 px-4 py-3 text-center backdrop-blur-sm">
                    <p className="font-display text-base font-semibold text-foreground">
                      A moment for you.
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      Turn on your camera for a personal preview.
                    </p>
                  </div>
                </div>
              )}

              <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-3 bg-background/95 px-4 py-3 backdrop-blur-sm sm:px-5">
                <Button
                  onClick={cameraState === "active" ? stopCamera : startCamera}
                  disabled={cameraState === "starting"}
                  size="sm"
                  className="rounded-md"
                >
                  {cameraState === "starting" ? (
                    <LoaderCircle className="animate-spin" aria-hidden="true" />
                  ) : cameraState === "active" ? (
                    <X aria-hidden="true" />
                  ) : (
                    <Camera aria-hidden="true" />
                  )}

                  {cameraState === "starting"
                    ? "Starting camera…"
                    : cameraState === "active"
                      ? "Turn camera off"
                      : "Activate camera"}
                </Button>

                <Button
                  onClick={saveSnapshot}
                  variant="outline"
                  size="sm"
                  className="rounded-md bg-background"
                >
                  <Download aria-hidden="true" />
                  Save snapshot
                </Button>
              </div>
            </div>

            <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 pt-2 text-xs">
              {cameraError ? (
                <p role="alert" className="max-w-xl leading-5 text-destructive">
                  {cameraError}
                </p>
              ) : trackingStatus === "error" ? (
                <p role="alert" className="max-w-xl leading-5 text-destructive">
                  Pelacak wajah gagal dimuat. Periksa koneksi internet, lalu muat ulang halaman.
                </p>
              ) : (
                <p role="status" className="text-muted-foreground">
                  {trackingMessage}
                </p>
              )}

              {hijabEnabled && cameraState === "active" && hijabMessage && (
                <p role="status" className="basis-full text-muted-foreground">
                  {hijabMessage}
                </p>
              )}

              {snapshotMessage && (
                <p role="status" className="flex items-center gap-1.5 text-foreground">
                  <Check className="size-3.5 text-primary" aria-hidden="true" />
                  {snapshotMessage}
                </p>
              )}
            </div>
          </section>

          <aside className="border-t border-border bg-background pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0 xl:pl-7">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-semibold text-foreground">The edit</h2>

              <span className="text-xs text-muted-foreground">
                {String(tryOnCategories.length).padStart(2, "0")} categories
              </span>
            </div>

            <div
              className="mt-4 grid grid-cols-3 gap-2"
              role="group"
              aria-label="Accessory categories"
            >
              {tryOnCategories.map((category) => (
                <Button
                  key={category.name}
                  type="button"
                  variant="outline"
                  aria-pressed={selectedCategory.name === category.name}
                  onClick={() => changeCategory(category)}
                  className={`h-auto min-h-[66px] flex-col gap-1.5 whitespace-normal rounded-sm px-1.5 py-2 text-[11px] font-medium shadow-none ${
                    selectedCategory.name === category.name
                      ? "border-primary bg-accent text-primary"
                      : "border-border bg-background text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  <category.icon className="size-[18px]" strokeWidth={1.7} aria-hidden="true" />
                  {category.name}
                </Button>
              ))}
            </div>

            <div className="mt-7 border-t border-border pt-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
                    {selectedCategory.name}
                  </p>

                  <h3 className="mt-1 text-sm font-semibold text-foreground">Choose a style</h3>
                </div>

                <span className="grid size-9 place-items-center rounded-full bg-accent text-primary">
                  <ActiveIcon className="size-4" aria-hidden="true" />
                </span>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                {selectedCategory.samples.map((sample, index) => (
                  <Button
                    key={sample.id}
                    type="button"
                    variant="outline"
                    aria-pressed={selectedSample.id === sample.id}
                    onClick={() => setSelectedSample(sample)}
                    className={`h-auto min-h-[92px] flex-col gap-2 whitespace-normal rounded-sm px-2 py-3 text-center shadow-none ${
                      selectedSample.id === sample.id
                        ? "border-primary bg-accent/50"
                        : "border-border hover:bg-secondary"
                    }`}
                  >
                    {sample.thumbnail ? (
                      <img
                        src={sample.thumbnail}
                        alt=""
                        loading="lazy"
                        className="h-10 w-full object-contain"
                      />
                    ) : (
                      <span
                        className={`grid size-9 place-items-center rounded-full text-primary ${
                          index === 1 ? "bg-secondary" : "bg-accent"
                        }`}
                      >
                        <ActiveIcon className="size-4" aria-hidden="true" />
                      </span>
                    )}

                    <span className="text-[11px] font-medium leading-4 text-foreground">
                      {sample.name}
                    </span>
                  </Button>
                ))}
              </div>

              <div className="mt-6 border-t border-border pt-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-foreground">Color story</h3>

                  <span className="text-xs text-muted-foreground">{selectedColor.name}</span>
                </div>

                <div
                  className="mt-3 flex flex-wrap gap-2.5"
                  role="group"
                  aria-label="Choose a color"
                >
                  {tryOnColors.map(({ name, className }) => (
                    <Button
                      key={name}
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={name}
                      aria-pressed={selectedColor.name === name}
                      onClick={() => setSelectedColor({ name, className })}
                      className={`grid size-8 place-items-center rounded-full border border-foreground/10 p-0 ${className} outline-offset-2 transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${
                        selectedColor.name === name
                          ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                          : ""
                      }`}
                    >
                      {selectedColor.name === name && (
                        <Check className="size-3.5 text-foreground" aria-hidden="true" />
                      )}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 border-t border-border pt-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Warna hijab</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Ganti warna hijabmu langsung di kamera.
                  </p>
                </div>

                <Switch
                  checked={hijabEnabled}
                  onCheckedChange={setHijabEnabled}
                  aria-label="Aktifkan ubah warna hijab"
                />
              </div>

              {hijabEnabled && (
                <div className="mt-4 space-y-4">
                  {cameraState !== "active" && (
                    <p className="text-xs leading-5 text-muted-foreground">
                      Aktifkan kamera dulu agar hijab bisa diwarnai.
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2.5" role="group" aria-label="Warna hijab">
                    {hijabColors.map(({ name, hex }) => (
                      <button
                        key={name}
                        type="button"
                        aria-label={name}
                        title={name}
                        aria-pressed={hijabColor === hex}
                        onClick={() => setHijabColor(hex)}
                        className={`grid size-8 place-items-center rounded-full border border-foreground/15 outline-offset-2 transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${
                          hijabColor === hex
                            ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                            : ""
                        }`}
                        style={{ backgroundColor: hex }}
                      />
                    ))}

                    <label className="inline-flex min-h-8 cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
                      <input
                        type="color"
                        value={hijabColor}
                        onChange={(event) => setHijabColor(event.target.value)}
                        aria-label="Pilih warna hijab sendiri"
                        className="size-8 cursor-pointer rounded-full border border-foreground/15 bg-transparent p-0"
                      />
                      Warna lain
                    </label>
                  </div>

                  <div>
                    <label
                      htmlFor="hijab-reach"
                      className="flex items-center justify-between gap-3 text-xs font-medium text-foreground"
                    >
                      Panjang area ke bawah
                      <span className="text-muted-foreground">{hijabReach.toFixed(1)}×</span>
                    </label>
                    <input
                      id="hijab-reach"
                      type="range"
                      min={0.4}
                      max={2}
                      step={0.1}
                      value={hijabReach}
                      onChange={(event) => setHijabReach(Number(event.target.value))}
                      className="mt-2 w-full accent-[var(--primary)]"
                    />
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Perpanjang jika bagian hijab di dada belum ikut berubah; pendekkan jika baju
                      ikut berwarna.
                    </p>
                  </div>

                  <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={hijabDebug}
                      onChange={(event) => setHijabDebug(event.target.checked)}
                      className="size-4 accent-[var(--primary)]"
                    />
                    Tampilkan area terdeteksi
                  </label>
                </div>
              )}
            </div>

            <p className="mt-6 border-l-2 border-primary/50 py-1 pl-3 text-xs leading-5 text-muted-foreground">
              Selections are a style guide for this studio preview. Live fitting is coming soon.
            </p>
          </aside>
        </div>
      </main>
    </div>
  );
}
