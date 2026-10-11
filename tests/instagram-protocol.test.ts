import assert from "node:assert/strict";
import test from "node:test";
import {
  INSTAGRAM_SCOPE,
  newOAuthState,
  stateCookieValue,
  verifyOAuthState,
  buildAuthorizeUrl,
  cleanAuthorizationCode,
  editorReturnPath,
  expiresAtFrom,
  instagramRedirectUri,
  mediaPermalinks,
  needsRefresh,
  parseInstagramJson,
  parseLongLivedToken,
  parseProfile,
  parseShortLivedToken,
} from "../services/instagram-protocol";

// Instagram-scoped user IDs are 17 digits, beyond Number.MAX_SAFE_INTEGER, and
// the code exchange returns them as bare JSON numbers.
test("real-size numeric ids survive parsing without losing digits", () => {
  const short = parseShortLivedToken(
    parseInstagramJson('{"access_token":"tok","user_id":17841405822304914,"permissions":"instagram_business_basic"}'),
  );
  assert.deepEqual(short, { accessToken: "tok", userId: "17841405822304914" });

  const wrapped = parseShortLivedToken(
    parseInstagramJson('{"data":[{"access_token":"tok","user_id":17841405822304914}]}'),
  );
  assert.deepEqual(wrapped, { accessToken: "tok", userId: "17841405822304914" });

  const profile = parseProfile(parseInstagramJson('{"user_id":17841405822304914,"username":"ventex.app","id":"9"}'));
  assert.deepEqual(profile, { userId: "17841405822304914", username: "ventex.app" });
});

test("parseInstagramJson leaves strings, small numbers and other keys alone", () => {
  assert.deepEqual(parseInstagramJson('{"user_id":"17841405822304914","expires_in":5183944,"note":"user_id: 17841405822304914"}'), {
    user_id: "17841405822304914",
    expires_in: 5183944,
    note: "user_id: 17841405822304914",
  });
  assert.throws(() => parseInstagramJson("not json"));
});

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

test("authorize URL carries the exact client, redirect, scope and state", () => {
  const url = new URL(
    buildAuthorizeUrl({
      appId: "123",
      redirectUri: "https://ventex.app/api/instagram/callback",
      state: "s t&ate",
    }),
  );
  assert.equal(url.origin + url.pathname, "https://www.instagram.com/oauth/authorize");
  assert.equal(url.searchParams.get("client_id"), "123");
  assert.equal(url.searchParams.get("redirect_uri"), "https://ventex.app/api/instagram/callback");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("scope"), INSTAGRAM_SCOPE);
  assert.equal(INSTAGRAM_SCOPE, "instagram_business_basic");
  assert.equal(url.searchParams.get("state"), "s t&ate");
});

test("redirect URI is built from the site base without a doubled slash", () => {
  assert.equal(instagramRedirectUri("https://ventex.app"), "https://ventex.app/api/instagram/callback");
  assert.equal(instagramRedirectUri("https://ventex.app/"), "https://ventex.app/api/instagram/callback");
  assert.equal(instagramRedirectUri("  https://ventex.app//  "), "https://ventex.app/api/instagram/callback");
});

test("authorization code drops Instagram's trailing #_", () => {
  assert.equal(cleanAuthorizationCode("AQBx#_"), "AQBx");
  assert.equal(cleanAuthorizationCode(" AQBx "), "AQBx");
  assert.equal(cleanAuthorizationCode("#_"), null);
  assert.equal(cleanAuthorizationCode(null), null);
});

test("short-lived token: plain and data-wrapped shapes", () => {
  assert.deepEqual(parseShortLivedToken({ access_token: "tok", user_id: 17841400000, permissions: "instagram_business_basic" }), {
    accessToken: "tok",
    userId: "17841400000",
  });
  assert.deepEqual(parseShortLivedToken({ data: [{ access_token: "tok", user_id: "42" }] }), {
    accessToken: "tok",
    userId: "42",
  });
});

test("short-lived token fails closed on missing or odd fields", () => {
  for (const body of [
    null,
    "tok",
    {},
    { access_token: "", user_id: "1" },
    { access_token: "tok" },
    { access_token: 5, user_id: "1" },
    { user_id: "1" },
    { data: [] },
    { error_type: "OAuthException", code: 400, error_message: "bad" },
  ]) {
    assert.equal(parseShortLivedToken(body), null, JSON.stringify(body));
  }
});

test("long-lived and refreshed token parse to token + absolute expiry", () => {
  const now = new Date("2026-10-10T00:00:00.000Z");
  const parsed = parseLongLivedToken({ access_token: "long", token_type: "bearer", expires_in: 5184000 }, now);
  assert.ok(parsed);
  assert.equal(parsed.accessToken, "long");
  assert.equal(parsed.expiresAt.toISOString(), "2026-12-09T00:00:00.000Z");
});

test("long-lived token fails closed", () => {
  const now = new Date("2026-10-10T00:00:00.000Z");
  for (const body of [
    null,
    {},
    { access_token: "long" },
    { access_token: "long", expires_in: 0 },
    { access_token: "long", expires_in: -5 },
    { access_token: "long", expires_in: "5184000" },
    { access_token: "long", expires_in: Number.NaN },
    { access_token: "", expires_in: 100 },
    { error: { message: "x" } },
  ]) {
    assert.equal(parseLongLivedToken(body, now), null, JSON.stringify(body));
  }
});

test("expiresAtFrom adds seconds to the injected clock", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(expiresAtFrom(3600, now).toISOString(), "2026-01-01T01:00:00.000Z");
});

test("profile needs a user id; username is optional", () => {
  assert.deepEqual(parseProfile({ user_id: "1784", username: "minegocio" }), { userId: "1784", username: "minegocio" });
  assert.deepEqual(parseProfile({ user_id: 1784 }), { userId: "1784", username: null });
  assert.equal(parseProfile({ username: "x" }), null);
  assert.equal(parseProfile(null), null);
});

test("needsRefresh: only tokens at least 24h old that expire within 20 days", () => {
  const now = new Date("2026-10-10T00:00:00.000Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const inFuture = (ms: number) => new Date(now.getTime() + ms);

  // Fresh 60-day token: nothing to do.
  assert.equal(needsRefresh(ago(2 * DAY), inFuture(58 * DAY), now), false);
  // Old enough and close to expiry: refresh.
  assert.equal(needsRefresh(ago(45 * DAY), inFuture(15 * DAY), now), true);
  // Exactly at the 20-day window: refresh.
  assert.equal(needsRefresh(ago(40 * DAY), inFuture(20 * DAY), now), true);
  // Close to expiry but issued less than 24h ago: Instagram refuses the refresh.
  assert.equal(needsRefresh(ago(23 * HOUR), inFuture(5 * DAY), now), false);
  // Exactly 24h old is allowed.
  assert.equal(needsRefresh(ago(24 * HOUR), inFuture(5 * DAY), now), true);
  // Already expired: cannot be refreshed, the owner must reconnect.
  assert.equal(needsRefresh(ago(70 * DAY), ago(1 * HOUR), now), false);
  assert.equal(needsRefresh(ago(70 * DAY), now, now), false);
  // Invalid dates fail closed.
  assert.equal(needsRefresh(new Date("nope"), inFuture(5 * DAY), now), false);
});

test("media response → canonical permalinks, order kept, junk skipped, capped", () => {
  const permalinks = mediaPermalinks({
    data: [
      { id: "1", permalink: "https://www.instagram.com/p/A1/", media_type: "IMAGE" },
      { id: "2", permalink: "https://www.instagram.com/reel/A2/?utm_source=ig_web", media_type: "VIDEO" },
      { id: "3", media_type: "IMAGE" },
      { id: "4", permalink: "https://evil.com/p/X/" },
      null,
      { id: "5", permalink: "https://www.instagram.com/p/A1/" },
      { id: "6", permalink: "https://www.instagram.com/p/A3/" },
      { id: "7", permalink: "https://www.instagram.com/p/A4/" },
      { id: "8", permalink: "https://www.instagram.com/p/A5/" },
      { id: "9", permalink: "https://www.instagram.com/p/A6/" },
      { id: "10", permalink: "https://www.instagram.com/p/A7/" },
      { id: "11", permalink: "https://www.instagram.com/p/A8/" },
      { id: "12", permalink: "https://www.instagram.com/p/A9/" },
      { id: "13", permalink: "https://www.instagram.com/p/A10/" },
    ],
  });
  assert.deepEqual(permalinks, [
    "https://www.instagram.com/p/A1/",
    "https://www.instagram.com/reel/A2/",
    "https://www.instagram.com/p/A3/",
    "https://www.instagram.com/p/A4/",
    "https://www.instagram.com/p/A5/",
    "https://www.instagram.com/p/A6/",
    "https://www.instagram.com/p/A7/",
    "https://www.instagram.com/p/A8/",
    "https://www.instagram.com/p/A9/",
  ]);
});

test("media response without a data array is an error, an empty one is not", () => {
  assert.equal(mediaPermalinks({}), null);
  assert.equal(mediaPermalinks(null), null);
  assert.equal(mediaPermalinks({ data: "x" }), null);
  assert.deepEqual(mediaPermalinks({ data: [] }), []);
});

test("oauth state is random, url-safe and bound to the tenant", () => {
  const a = newOAuthState();
  const b = newOAuthState();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);

  const cookie = stateCookieValue(a, "tenant-1");
  assert.equal(verifyOAuthState(cookie, a, "tenant-1"), true);
  assert.equal(verifyOAuthState(cookie, b, "tenant-1"), false);
  assert.equal(verifyOAuthState(cookie, a, "tenant-2"), false);
  assert.equal(verifyOAuthState(cookie, `${a}x`, "tenant-1"), false);
  assert.equal(verifyOAuthState(undefined, a, "tenant-1"), false);
  assert.equal(verifyOAuthState(cookie, null, "tenant-1"), false);
  assert.equal(verifyOAuthState(cookie, "", "tenant-1"), false);
});

test("the round trip returns to the editor of a real site id, or to the list", () => {
  const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
  assert.equal(editorReturnPath("connected", id), `/dashboard/landing?site=${id}&tab=sections&instagram=connected`);
  assert.equal(editorReturnPath("denied", null), "/dashboard/landing?instagram=denied");
  assert.equal(editorReturnPath("error", "../../evil"), "/dashboard/landing?instagram=error");
  assert.equal(editorReturnPath("error", `${id}&x=1`), "/dashboard/landing?instagram=error");
});
