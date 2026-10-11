import { type NextRequest, NextResponse } from "next/server";
import { requireSelectedWorkspaceOwner } from "@/services/workspace.server";
import { instagramAppConfig } from "@/services/instagram.server";
import {
  INSTAGRAM_RETURN_COOKIE,
  INSTAGRAM_STATE_COOKIE,
  INSTAGRAM_STATE_MAX_AGE_SECONDS,
  type InstagramConnectResult,
  buildAuthorizeUrl,
  editorReturnPath,
  newOAuthState,
  returnSiteId,
  stateCookieValue,
} from "@/services/instagram-protocol";

/**
 * Starts "Conectar Instagram": owner only. Sets a short-lived, httpOnly state
 * cookie (CSRF) and sends the browser to Instagram's consent screen. `?site=`
 * (the site being edited) is remembered so the callback returns to that editor.
 */
export async function GET(request: NextRequest) {
  const siteId = returnSiteId(request.nextUrl.searchParams.get("site"));
  const back = (result: InstagramConnectResult) =>
    NextResponse.redirect(new URL(editorReturnPath(result, siteId), request.nextUrl.origin));

  const owner = await requireSelectedWorkspaceOwner();
  // Workers and workspace admins cannot connect: the account becomes the
  // business's public face, so only the owner decides it.
  if (!owner) return back("forbidden");

  const config = instagramAppConfig(request.nextUrl.origin);
  if (!config) return back("unconfigured");

  const state = newOAuthState();
  const response = NextResponse.redirect(
    buildAuthorizeUrl({ appId: config.appId, redirectUri: config.redirectUri, state }),
  );
  const cookie = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/instagram",
    maxAge: INSTAGRAM_STATE_MAX_AGE_SECONDS,
  };
  response.cookies.set(INSTAGRAM_STATE_COOKIE, stateCookieValue(state, owner.workspaceId), cookie);
  if (siteId) response.cookies.set(INSTAGRAM_RETURN_COOKIE, siteId, cookie);
  else response.cookies.delete({ name: INSTAGRAM_RETURN_COOKIE, path: "/api/instagram" });
  return response;
}
