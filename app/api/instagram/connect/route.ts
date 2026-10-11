import { type NextRequest, NextResponse } from "next/server";
import { requireSelectedWorkspaceOwner } from "@/services/workspace.server";
import { instagramAppConfig } from "@/services/instagram.server";
import {
  INSTAGRAM_STATE_COOKIE,
  INSTAGRAM_STATE_MAX_AGE_SECONDS,
  buildAuthorizeUrl,
  newOAuthState,
  stateCookieValue,
} from "@/services/instagram-protocol";

/**
 * Starts "Conectar Instagram": owner only. Sets a short-lived, httpOnly state
 * cookie (CSRF) and sends the browser to Instagram's consent screen.
 */
export async function GET(request: NextRequest) {
  const back = (result: string) => {
    const url = new URL("/dashboard/landing", request.nextUrl.origin);
    url.searchParams.set("instagram", result);
    return NextResponse.redirect(url);
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
  response.cookies.set(INSTAGRAM_STATE_COOKIE, stateCookieValue(state, owner.workspaceId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/instagram",
    maxAge: INSTAGRAM_STATE_MAX_AGE_SECONDS,
  });
  return response;
}
