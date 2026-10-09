import assert from "node:assert/strict";
import test from "node:test";
import { instagramPostUrl, MAX_INSTAGRAM_POSTS } from "../lib/instagram";
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

test("a site without instagram posts shows none", () => {
  assert.deepEqual(defaultLandingConfig().instagramPosts, []);
  assert.deepEqual(normalizeLandingConfig({}).instagramPosts, []);
  assert.deepEqual(normalizeLandingConfig({ instagramPosts: "x" }).instagramPosts, []);
});

test("instagram posts keep valid canonical links, drop junk and duplicates, cap at the limit", () => {
  const { instagramPosts } = normalizeLandingConfig({
    instagramPosts: [
      "https://www.instagram.com/p/A1/?igsh=1",
      "instagram.com/p/A1",
      "https://evil.com/p/X/",
      42,
      "https://www.instagram.com/reel/A2/",
      "https://www.instagram.com/p/A3/",
      "https://www.instagram.com/p/A4/",
      "https://www.instagram.com/p/A5/",
      "https://www.instagram.com/p/A6/",
      "https://www.instagram.com/p/A7/",
    ],
  });
  assert.equal(MAX_INSTAGRAM_POSTS, 6);
  assert.deepEqual(instagramPosts, [
    "https://www.instagram.com/p/A1/",
    "https://www.instagram.com/reel/A2/",
    "https://www.instagram.com/p/A3/",
    "https://www.instagram.com/p/A4/",
    "https://www.instagram.com/p/A5/",
    "https://www.instagram.com/p/A6/",
  ]);
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
