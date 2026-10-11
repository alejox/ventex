"use client";

import Script from "next/script";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { IconButton } from "@/components/ui/Button";
import { instagramShownPosts, type InstagramCount, type InstagramLayout } from "@/lib/instagram";

const EMBED_SRC = "https://www.instagram.com/embed.js";

/** The global that Instagram's embed.js installs. */
interface InstagramEmbedApi {
  Embeds: { process: () => void };
}
type InstagramWindow = Window & { instgrm?: InstagramEmbedApi };

/** Turns every pending `blockquote.instagram-media` of `doc` into an iframe. */
function processEmbeds(doc: Document) {
  (doc.defaultView as InstagramWindow | null)?.instgrm?.Embeds.process();
}

/**
 * Markup Instagram expects. It is written as an HTML string ON PURPOSE:
 * embed.js replaces the blockquote with its own iframe, and if React owned that
 * node it would later try to remove an element that is no longer in the DOM.
 * `permalink` is always a canonical URL rebuilt by `instagramPostUrl` (via
 * `instagramShownPosts`; only
 * `[A-Za-z0-9_-]` in the shortcode), so it is safe inside the attribute.
 */
function embedMarkup(permalink: string) {
  return `<blockquote class="instagram-media" data-instgrm-permalink="${permalink}" data-instgrm-version="14" style="margin:0;width:100%;min-width:0;max-width:540px"><a href="${permalink}" target="_blank" rel="noopener noreferrer">Ver esta publicación en Instagram</a></blockquote>`;
}

const NAV_BUTTON =
  "border border-[var(--site-border)]! bg-[var(--site-surface)]! text-[var(--site-text)]! hover:bg-[var(--site-surface-alt)]! focus-visible:ring-[var(--site-accent)]! focus-visible:ring-offset-0! disabled:opacity-40";

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d={direction === "left" ? "M15 18l-6-6 6-6" : "M9 6l6 6-6 6"} />
    </svg>
  );
}

/**
 * Every card in a row gets the same height (the tallest post's) and draws its
 * own frame: Instagram posts come in different aspect ratios, so the embeds are
 * different heights. embed.js styles its iframe INLINE (border, radius, shadow,
 * margin), hence the `!` overrides. White on purpose: the embed itself is white
 * whatever the site palette is, and the leftover space must match it.
 */
const CARD_FRAME =
  "overflow-hidden rounded-lg border border-black/10 bg-white [&_iframe]:m-0! [&_iframe]:rounded-none! [&_iframe]:border-0! [&_iframe]:shadow-none! [&_.instagram-media]:m-0!";

/**
 * One post. Memoized ON PURPOSE: React 19 rewrites `innerHTML` whenever the
 * `dangerouslySetInnerHTML` object changes identity, and a fresh `{ __html }`
 * per render would wipe the iframe embed.js already put here (the carousel
 * re-renders on every scroll/resize to update its arrows). With stable props
 * the card never re-renders, so React never touches the node again.
 */
const EmbedCard = memo(function EmbedCard({ permalink, className }: { permalink: string; className: string }) {
  const html = useMemo(() => ({ __html: embedMarkup(permalink) }), [permalink]);
  return <div className={className} dangerouslySetInnerHTML={html} />;
});

export function InstagramSection({
  posts,
  layout,
  count,
  preview,
  heading,
}: {
  posts: string[];
  layout: InstagramLayout;
  count: InstagramCount;
  preview: boolean;
  heading: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ atStart: true, atEnd: false });
  const permalinks = instagramShownPosts(posts, count);
  // The layout is part of the signature: switching it remounts the cards with
  // fresh blockquotes that embed.js has to process again.
  const signature = `${layout}:${permalinks.join("|")}`;
  const hasPosts = permalinks.length > 0;
  const carousel = layout === "carousel" && permalinks.length > 1;

  useEffect(() => {
    const doc = ref.current?.ownerDocument;
    if (!doc || !hasPosts) return;
    // The editor preview portals this tree into an iframe (PreviewFrame).
    // next/script only targets the dashboard document, so the frame needs its
    // own copy of embed.js, which then processes the frame's blockquotes.
    if (doc !== document && !doc.querySelector(`script[src="${EMBED_SRC}"]`)) {
      const script = doc.createElement("script");
      script.src = EMBED_SRC;
      script.async = true;
      script.onload = () => processEmbeds(doc);
      doc.head.appendChild(script);
      return;
    }
    // Already loaded: render the posts that were just added.
    processEmbeds(doc);
  }, [signature, hasPosts]);

  // Prev/next are disabled at each end. Read on scroll and on resize (embeds
  // grow when embed.js swaps the blockquote for its iframe).
  useEffect(() => {
    const track = trackRef.current;
    if (!carousel || !track) return;
    const update = () => {
      const max = track.scrollWidth - track.clientWidth;
      const atStart = track.scrollLeft <= 1;
      const atEnd = track.scrollLeft >= max - 1;
      // Same values → same object: no re-render on every scroll event.
      setEdges((prev) => (prev.atStart === atStart && prev.atEnd === atEnd ? prev : { atStart, atEnd }));
    };
    const observer = new ResizeObserver(update);
    observer.observe(track);
    track.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      track.removeEventListener("scroll", update);
    };
  }, [carousel, signature]);

  if (!hasPosts) return null;

  const scrollByCard = (direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.firstElementChild as HTMLElement | null;
    const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
    const step = (card?.offsetWidth ?? track.clientWidth) + gap;
    const reduce = track.ownerDocument.defaultView?.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollBy({ left: direction * step, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <section ref={ref} id="instagram" className="site-section site-instagram-section site-reveal">
      {heading}
      {carousel ? (
        <div className="mt-8">
          <div
            ref={trackRef}
            role="region"
            aria-roledescription="carrusel"
            aria-label="Publicaciones de Instagram"
            tabIndex={0}
            className="flex snap-x snap-mandatory items-stretch gap-6 overflow-x-auto overscroll-x-contain pb-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--site-accent)]"
          >
            {permalinks.map((permalink) => (
              // 340px: Instagram's iframe needs at least 326px to lay out.
              <EmbedCard key={`${layout}-${permalink}`} permalink={permalink} className={`w-[340px] max-w-full shrink-0 snap-start ${CARD_FRAME}`} />
            ))}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <IconButton
              icon={<Chevron direction="left" />}
              aria-label="Publicación anterior"
              disabled={edges.atStart}
              onClick={() => scrollByCard(-1)}
              className={NAV_BUTTON}
            />
            <IconButton
              icon={<Chevron direction="right" />}
              aria-label="Publicación siguiente"
              disabled={edges.atEnd}
              onClick={() => scrollByCard(1)}
              className={NAV_BUTTON}
            />
          </div>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] items-stretch justify-items-center gap-6">
          {permalinks.map((permalink) => (
            <EmbedCard key={`${layout}-${permalink}`} permalink={permalink} className={`w-full ${CARD_FRAME}`} />
          ))}
        </div>
      )}
      {preview ? null : (
        <Script src={EMBED_SRC} strategy="lazyOnload" onReady={() => processEmbeds(document)} />
      )}
    </section>
  );
}
