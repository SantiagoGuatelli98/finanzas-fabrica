import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth-token";

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const authenticated = verifySession(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/login") {
    return authenticated ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
  }
  if (!authenticated) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new NextResponse("No autorizado", { status: 401 });
    }
    const login = new URL("/login", request.url);
    if (request.method === "GET" && pathname !== "/") login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: "/((?!_next/|icon.svg|favicon.ico|manifest.webmanifest|huracan-embroidered.jpg).*)",
};
