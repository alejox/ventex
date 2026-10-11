import { type NextRequest, NextResponse } from "next/server";
import { requireSelectedWorkspaceOwner } from "@/services/workspace.server";
import {
  InstagramSyncError,
  connectInstagramAccount,
  instagramAppConfig,
} from "@/services/instagram.server";
import {
  INSTAGRAM_RETURN_COOKIE,
  INSTAGRAM_STATE_COOKIE,
  type InstagramConnectResult,
  cleanAuthorizationCode,
  editorReturnPath,
  verifyOAuthState,
} from "@/services/instagram-protocol";

/**
 * Instagram redirects here after the consent screen. Verifies the state cookie
 * (constant time, bound to the tenant), re-checks that the caller is still the
 * owner, and exchanges the code. Always clears the state cookie and always
 * lands back on the site editor with `?instagram=<result>`.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const stateCookie = request.cookies.get(INSTAGRAM_STATE_COOKIE)?.value;

  const siteId = request.cookies.get(INSTAGRAM_RETURN_COOKIE)?.value;

  const back = (result: InstagramConnectResult) => {
    const response = NextResponse.redirect(new URL(editorReturnPath(result, siteId), request.nextUrl.origin));
    // Single use: both cookies go away whatever the outcome.
    for (const name of [INSTAGRAM_STATE_COOKIE, INSTAGRAM_RETURN_COOKIE]) {
      response.cookies.set(name, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/api/instagram",
        maxAge: 0,
      });
    }
    return response;
  };

  const owner = await requireSelectedWorkspaceOwner();
  if (!owner) return back("forbidden");

  if (!verifyOAuthState(stateCookie, params.get("state"), owner.workspaceId)) {
    return back("error");
  }

  // The owner pressed "Cancel" on Instagram (or Instagram refused the request).
  if (params.get("error")) {
    return back(params.get("error_reason") === "user_denied" ? "denied" : "error");
  }

  const code = cleanAuthorizationCode(params.get("code"));
  if (!code) return back("error");

  const config = instagramAppConfig(request.nextUrl.origin);
  if (!config) return back("unconfigured");

  try {
    await connectInstagramAccount(owner.workspaceId, code, config);
  } catch (error) {
    // Only the step name and status: never the URL, which carries a token.
    console.warn(
      "[instagram] connect failed:",
      error instanceof InstagramSyncError ? error.message : "unexpected error",
    );
    return back("error");
  }

  return back("connected");
}
