"use client";

import { useId, useState } from "react";
import { Button, IconButton } from "@/components/ui/Button";
import { IconTrash } from "@/app/assets/icons/DashboardIcons";
import { instagramPostUrl, MAX_INSTAGRAM_POSTS } from "@/lib/instagram";

const INPUT = "w-full rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary";

/**
 * Links to the Instagram posts the public site shows. Each pasted link is
 * stored already canonical, so the list shows exactly what the site renders.
 */
export function InstagramPostsEditor({
  posts,
  onChange,
}: {
  posts: string[];
  onChange: (recipe: (posts: string[]) => string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();
  const full = posts.length >= MAX_INSTAGRAM_POSTS;

  function add() {
    const url = instagramPostUrl(draft);
    if (!url) {
      setError("Ese enlace no es de una publicación de Instagram.");
      return;
    }
    if (posts.includes(url)) {
      setError("Esa publicación ya está en la lista.");
      return;
    }
    onChange((current) => (current.includes(url) ? current : [...current, url].slice(0, MAX_INSTAGRAM_POSTS)));
    setDraft("");
    setError(null);
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-outline-variant/20 p-3">
      <p className="text-xs leading-relaxed text-on-surface-variant">
        En Instagram, abre la publicación, toca <strong>···</strong> y elige <strong>Copiar enlace</strong>. Luego pégalo aquí.
      </p>
      {posts.length ? (
        <ul className="space-y-2">
          {posts.map((post) => (
            <li key={post} className="flex items-center gap-2 rounded-lg bg-surface-container px-3 py-1">
              <a href={post} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-xs text-on-surface hover:underline">
                {post.replace("https://www.", "")}
              </a>
              <IconButton
                aria-label="Quitar publicación"
                icon={<IconTrash width={16} height={16} />}
                size="sm"
                onClick={() => onChange((current) => current.filter((item) => item !== post))}
                className="text-error"
              />
            </li>
          ))}
        </ul>
      ) : null}
      {full ? (
        <p className="text-xs text-on-surface-variant">Ya tienes {MAX_INSTAGRAM_POSTS} publicaciones, el máximo. Quita una para agregar otra.</p>
      ) : (
        <div className="space-y-1.5">
          <label htmlFor={inputId} className="block text-xs font-bold text-on-surface-variant">
            Enlace de la publicación
          </label>
          <div className="flex gap-2">
            <input
              id={inputId}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  add();
                }
              }}
              placeholder="https://www.instagram.com/p/…"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              className={INPUT}
            />
            <Button variant="secondary" onClick={add} disabled={!draft.trim()}>
              Agregar
            </Button>
          </div>
          {error ? (
            <p id={errorId} role="alert" className="text-xs font-semibold text-error">
              {error}
            </p>
          ) : (
            <p className="text-xs text-on-surface-variant">Puedes mostrar hasta {MAX_INSTAGRAM_POSTS} publicaciones.</p>
          )}
        </div>
      )}
    </div>
  );
}
