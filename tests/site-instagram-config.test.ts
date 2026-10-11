import assert from "node:assert/strict";
import test from "node:test";
import {
  INSTAGRAM_COUNTS,
  instagramPostList,
  instagramPostUrl,
  instagramShownPosts,
  MAX_INSTAGRAM_POSTS,
} from "../lib/instagram";
import { defaultLandingConfig, normalizeLandingConfig } from "../services/public-site.types";

test("instagramPostUrl canonicalizes post, reel and tv links", () => {
  assert.equal(instagramPostUrl("https://www.instagram.com/p/ABC123/?igsh=xyz"), "https://www.instagram.com/p/ABC123/");
  assert.equal(instagramPostUrl("instagram.com/p/ABC123"), "https://www.instagram.com/p/ABC123/");
  assert.equal(instagramPostUrl("  www.instagram.com/p/A_b-9/#comments  "), "https://www.instagram.com/p/A_b-9/");
  assert.equal(instagramPostUrl("http://instagram.com/reel/XyZ987/"), "https://www.instagram.com/reel/XyZ987/");
  assert.equal(instagramPostUrl("https://www.instagram.com/tv/Tv123"), "https://www.instagram.com/tv/Tv123/");
  assert.equal(instagramPostUrl("https://www.instagram.com/minegocio/p/ABC123/"), "https://www.instagram.com/p/ABC123/");
  assert.equal(instagramPostUrl("HTTPS://WWW.INSTAGRAM.COM/p/ABC123/"), "https://www.instagram.com/p/ABC123/");
});

test("instagramPostUrl rejects anything that is not an Instagram post", () => {
  for (const raw of [
    "",
    "   ",
    "https://www.instagram.com/minegocio/",
    "https://www.instagram.com/",
    "https://instagram.com.evil.com/p/ABC123/",
    "https://evil.com/instagram.com/p/ABC123/",
    "https://evilinstagram.com/p/ABC123/",
    "https://www.instagram.com/stories/minegocio/123/",
    "https://www.instagram.com/p/",
    "https://www.instagram.com/p/AB%20C/",
    "javascript:alert(1)//instagram.com/p/ABC123/",
    "ftp://www.instagram.com/p/ABC123/",
    "https://user:pass@www.instagram.com/p/ABC123/",
    "@minegocio",
  ]) {
    assert.equal(instagramPostUrl(raw), null, raw);
  }
});

test("instagramPostList keeps valid canonical links, drops junk and duplicates, caps at the limit", () => {
  const raw = [
    "https://www.instagram.com/p/A1/?igsh=1",
    "instagram.com/p/A1",
    "https://evil.com/p/X/",
    42,
    ...Array.from({ length: 10 }, (_, index) => `https://www.instagram.com/p/B${index}/`),
  ];
  const list = instagramPostList(raw);
  assert.equal(MAX_INSTAGRAM_POSTS, 9);
  assert.equal(list.length, 9);
  assert.equal(list[0], "https://www.instagram.com/p/A1/");
  assert.equal(list[8], "https://www.instagram.com/p/B7/");
  assert.deepEqual(instagramPostList("x"), []);
});

test("instagram layout defaults to a grid and only accepts the known layouts", () => {
  assert.equal(defaultLandingConfig().instagramLayout, "grid");
  assert.equal(normalizeLandingConfig({}).instagramLayout, "grid");
  assert.equal(normalizeLandingConfig({ instagramLayout: "carousel" }).instagramLayout, "carousel");
  assert.equal(normalizeLandingConfig({ instagramLayout: "grid" }).instagramLayout, "grid");
  assert.equal(normalizeLandingConfig({ instagramLayout: "CAROUSEL" }).instagramLayout, "grid");
  assert.equal(normalizeLandingConfig({ instagramLayout: 1 }).instagramLayout, "grid");
});

test("instagram count defaults to 6 and only accepts 3, 6 or 9", () => {
  assert.deepEqual(INSTAGRAM_COUNTS, [3, 6, 9]);
  assert.equal(defaultLandingConfig().instagramCount, 6);
  assert.equal(normalizeLandingConfig({}).instagramCount, 6);
  for (const count of [3, 6, 9]) {
    assert.equal(normalizeLandingConfig({ instagramCount: count }).instagramCount, count);
  }
  for (const junk of [0, 4, 12, "9", null, Number.NaN]) {
    assert.equal(normalizeLandingConfig({ instagramCount: junk }).instagramCount, 6, String(junk));
  }
});

test("configs saved with the old manual mode still load and drop the manual keys", () => {
  const config = normalizeLandingConfig({
    instagramSource: "manual",
    instagramPosts: ["https://www.instagram.com/p/A1/"],
  });
  assert.equal("instagramSource" in config, false);
  assert.equal("instagramPosts" in config, false);
  assert.equal(config.instagramLayout, "grid");
  assert.equal(config.instagramCount, 6);
});

test("instagramShownPosts re-validates the cached links and slices to the chosen count", () => {
  const posts = [
    "https://www.instagram.com/p/A1/",
    "javascript:alert(1)",
    ...Array.from({ length: 8 }, (_, index) => `https://www.instagram.com/p/B${index}/`),
  ];
  assert.deepEqual(instagramShownPosts(posts, 3), [
    "https://www.instagram.com/p/A1/",
    "https://www.instagram.com/p/B0/",
    "https://www.instagram.com/p/B1/",
  ]);
  assert.equal(instagramShownPosts(posts, 9).length, 9);
  assert.deepEqual(instagramShownPosts([], 6), []);
});

test("existing configs get the instagram section appended", () => {
  const config = normalizeLandingConfig({
    sections: [{ id: "services", visible: false, title: "Servicios", subtitle: "x" }],
  });
  assert.equal(config.sections[0].id, "services");
  const instagram = config.sections.find((section) => section.id === "instagram");
  assert.ok(instagram);
  assert.equal(instagram.visible, true);
  assert.equal(instagram.title, "Síguenos en Instagram");
});
