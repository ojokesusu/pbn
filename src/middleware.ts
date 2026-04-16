import { NextResponse, type NextRequest } from "next/server"

const PUBLIC_PATHS = ["/login"]
const PUBLIC_API = ["/api/auth/login"]

// Apply hardening security headers to every response.
// CSP is intentionally permissive for inline styles (the dashboard relies on
// inline style attributes for theming) but blocks inline scripts.
function applySecurityHeaders(res: NextResponse): NextResponse {
  // Force HTTPS for 1 year (only effective when served over HTTPS in prod)
  res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
  // Block clickjacking
  res.headers.set("X-Frame-Options", "DENY")
  // Block MIME sniffing
  res.headers.set("X-Content-Type-Options", "nosniff")
  // Don't leak referrer to external origins
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  // Disable risky browser features by default
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()")
  // Cross-origin protections
  res.headers.set("X-XSS-Protection", "1; mode=block")
  return res
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return applySecurityHeaders(NextResponse.next())
  }
  if (PUBLIC_API.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return applySecurityHeaders(NextResponse.next())
  }

  const token = req.cookies.get("pbn_session")?.value
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
    }
    const url = req.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("next", pathname)
    return applySecurityHeaders(NextResponse.redirect(url))
  }

  return applySecurityHeaders(NextResponse.next())
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|txt|woff2?)).*)",
  ],
}
