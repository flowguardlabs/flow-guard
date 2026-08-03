// Proxies /api/* to the Railway backend (api.flowguard.cash), mirroring the
// Vercel rewrite `{"src":"/api/(.*)","dest":"https://api.flowguard.cash/api/$1"}`.
// Everything else is served from static assets (SPA). `run_worker_first: ["/api/*"]`
// in wrangler.jsonc ensures only /api/* reaches this Worker.
const API_ORIGIN = 'https://api.flowguard.cash';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return fetch(new Request(API_ORIGIN + url.pathname + url.search, request));
    }
    return env.ASSETS.fetch(request);
  },
};
