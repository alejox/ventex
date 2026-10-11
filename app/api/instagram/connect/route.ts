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
import { INSTAGRAM_POPUP_COOKIE, instagramPopupHtml, popupRequested } from "@/lib/instagram-popup";

/**
 * Starts "Conectar Instagram": owner only. Sets a short-lived, httpOnly state
 * cookie (CSRF) and sends the browser to Instagram's consent screen. `?site=`
 * (the site being edited) is remembered so the callback returns to that editor;
 * `?popup=1` is remembered so the callback answers the opener instead.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const siteId = returnSiteId(params.get("site"));
  const popup = popupRequested(params.get("popup"));
  const back = (result: InstagramConnectResult) => {
    const path = editorReturnPath(result, siteId);
    if (!popup) return NextResponse.redirect(new URL(path, request.nextUrl.origin));
    // Inside the popup: report to the editor and close, never load the editor here.
    return new NextResponse(instagramPopupHtml({ result, origin: request.nextUrl.origin, editorPath: path }), {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  };

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
  if (popup) response.cookies.set(INSTAGRAM_POPUP_COOKIE, "1", cookie);
  else response.cookies.delete({ name: INSTAGRAM_POPUP_COOKIE, path: "/api/instagram" });
  return response;
}
