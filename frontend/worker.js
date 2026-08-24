// Proxies /api/* to the backend on the VPS (api.flowguard.cash), mirroring the
// Vercel rewrite `{"src":"/api/(.*)","dest":"https://api.flowguard.cash/api/$1"}`.
// Everything else is served from static assets (SPA). `run_worker_first: ["/api/*"]`
// in wrangler.jsonc ensures only /api/* reaches this Worker.
const API_ORIGIN = 'https://api.flowguard.cash';

// Read by the backend's rate limiter. See backend/src/middleware/rateLimiter.ts.
const CLIENT_IP_HEADER = 'x-flowguard-client-ip';
const EDGE_SECRET_HEADER = 'x-flowguard-edge-secret';

// Security headers for the SPA live in public/_headers, not here: asset requests
// never reach this Worker (see run_worker_first in wrangler.jsonc), so they are
// applied by Workers Static Assets at the edge instead.

function proxyToApi(request, url, env) {
  // Deriving the outbound request from the inbound one keeps method, body and
  // streaming semantics identical to the original pass-through; only headers change.
  const proxied = new Request(API_ORIGIN + url.pathname + url.search, request);

  // Never relay a caller-supplied value for either header — a direct visitor could
  // otherwise set them and pick their own rate-limit bucket.
  proxied.headers.delete(CLIENT_IP_HEADER);
  proxied.headers.delete(EDGE_SECRET_HEADER);

  // CF-Connecting-IP is set by Cloudflare on the inbound request and cannot be
  // forged by the visitor. Forward it under our own name with a secret the backend
  // checks, since api.flowguard.cash is reachable without passing through here.
  const clientIp = request.headers.get('CF-Connecting-IP');
  if (clientIp && env.EDGE_PROXY_SECRET) {
    proxied.headers.set(CLIENT_IP_HEADER, clientIp);
    proxied.headers.set(EDGE_SECRET_HEADER, env.EDGE_PROXY_SECRET);
  }

  return fetch(proxied);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return proxyToApi(request, url, env);
    }
    return env.ASSETS.fetch(request);
  },
};
