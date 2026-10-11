"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { instagramPostUrl } from "@/lib/instagram";

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
 * `permalink` is always a canonical URL rebuilt by `instagramPostUrl` (only
 * `[A-Za-z0-9_-]` in the shortcode), so it is safe inside the attribute.
 */
function embedMarkup(permalink: string) {
  return `<blockquote class="instagram-media" data-instgrm-permalink="${permalink}" data-instgrm-version="14" style="margin:0;width:100%;min-width:0;max-width:540px"><a href="${permalink}" target="_blank" rel="noopener noreferrer">Ver esta publicación en Instagram</a></blockquote>`;
}

export function InstagramSection({
  posts,
  preview,
  heading,
}: {
  posts: string[];
  preview: boolean;
  heading: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  // Re-validated at render: the public RPC hands back the stored config as is.
  const permalinks = posts.flatMap((post) => {
    const url = instagramPostUrl(post);
    return url ? [url] : [];
  });
  const signature = permalinks.join("|");

  useEffect(() => {
    const doc = ref.current?.ownerDocument;
    if (!doc || !signature) return;
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
  }, [signature]);

  if (!permalinks.length) return null;

  return (
    <section ref={ref} id="instagram" className="site-section site-instagram-section site-reveal">
      {heading}
      <div className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] items-start justify-items-center gap-6">
        {permalinks.map((permalink) => (
          <div key={permalink} className="w-full" dangerouslySetInnerHTML={{ __html: embedMarkup(permalink) }} />
        ))}
      </div>
      {preview ? null : (
        <Script src={EMBED_SRC} strategy="lazyOnload" onReady={() => processEmbeds(document)} />
      )}
    </section>
  );
}
