import { NextResponse, type NextRequest } from "next/server";

/** Basic auth for the manager dashboard when DASHBOARD_PASSWORD is set. The webhook stays public for Meta. */
export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-shiftpilot-pathname", request.nextUrl.pathname);
  const continueRequest = () => NextResponse.next({ request: { headers: requestHeaders } });
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return continueRequest();
  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    if (decoded.slice(decoded.indexOf(":") + 1) === password) return continueRequest();
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="ShiftPilot manager"' },
  });
}

export const config = {
  matcher: ["/((?!api/whatsapp|api/telegram|_next/static|_next/image|favicon.ico).*)"],
};
