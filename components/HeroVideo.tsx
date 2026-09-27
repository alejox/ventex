"use client";

import { useRef, useState, useSyncExternalStore } from "react";

const REDUCE_MOTION = "(prefers-reduced-motion: reduce)";
const subscribeMotion = (notify: () => void) => {
  const media = window.matchMedia(REDUCE_MOTION);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};
const prefersReducedMotion = () => window.matchMedia(REDUCE_MOTION).matches;
// Do not include a video source in server HTML before preferences are known.
const serverReducedMotion = () => true;
const subscribeHydration = () => () => {};
const hydrated = () => true;
const serverHydrated = () => false;

type Props = {
  src: string;
  poster: string;
  className?: string;
};

export function HeroVideo({ src, poster, className }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const reducedMotion = useSyncExternalStore(subscribeMotion, prefersReducedMotion, serverReducedMotion);
  const isHydrated = useSyncExternalStore(subscribeHydration, hydrated, serverHydrated);
  const saveData = isHydrated && Boolean(
    (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData,
  );
  const [manualPlay, setManualPlay] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  const shouldMountVideo = isHydrated && !failed && (manualPlay || (!reducedMotion && !saveData));

  const togglePlayback = () => {
    if (!shouldMountVideo) {
      setFailed(false);
      setManualPlay(true);
      // Mounting a <video> is not proof that playback has started.
      setPlaying(false);
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      // A rejected play request (for example, browser policy) is not a media error.
      // Keep the replay control visible; onPlay/onError are the source of truth.
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  return (
    <>
      {shouldMountVideo ? (
        <video
          ref={videoRef}
          className={className}
          poster={poster}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
          tabIndex={-1}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onError={() => { setPlaying(false); setFailed(true); }}
        >
          <source src={src} type="video/mp4" />
        </video>
      ) : (
        // The same poster URL is used by <video>; optimizing it would download a second copy.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="" aria-hidden="true" className={className} />
      )}
      {isHydrated && (
        <div className="pointer-events-auto absolute bottom-5 left-5 z-10 flex flex-col items-start gap-2 sm:bottom-8 sm:left-8">
          {failed && <span role="status" className="rounded-lg bg-black/80 px-3 py-2 text-xs text-white">Video no disponible. Puedes seguir usando la página.</span>}
          <button
            type="button"
            onClick={togglePlayback}
            className="rounded-full border border-white/60 bg-black/75 px-4 py-2 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            aria-label={shouldMountVideo && playing ? "Pausar video de fondo" : failed ? "Reintentar video de fondo" : "Reproducir video de fondo"}
          >
            {shouldMountVideo && playing ? "Pausar video" : failed ? "Reintentar video" : "Reproducir video"}
          </button>
        </div>
      )}
    </>
  );
}
