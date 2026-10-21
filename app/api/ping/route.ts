export const dynamic = "force-dynamic";

// No room lookup, authentication, database query or response body.
export function GET() { return new Response(null, { status: 204, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }); }
export const HEAD = GET;
