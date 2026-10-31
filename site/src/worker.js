// example.com: /units/data.json proxied from the game server. Everything else, including the
// unit finder page and its headers (public/_headers), is served as static assets without
// running this Worker (wrangler.jsonc run_worker_first).
// The API's certificate comes from the game's own root CA, which browsers do not trust,
// so the page cannot fetch it directly; this Worker fetches it and caches it 5 minutes.
const UNIT_FINDER = 'http://api.example.com/bf/gme/unitFinder.php';
const DATA_TTL = 300;

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function unitData(request, ctx) {
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  const cache = caches.default;
  const key = new Request('https://example.com/units/data.json');
  const hit = await cache.match(key);
  if (hit)
    return hit;
  let upstream;
  try {
    upstream = await fetch(UNIT_FINDER, { headers: { Accept: 'application/json' } });
  } catch (err) {
    console.error({ unit_finder: String(err) });
    return json(502, { error: 'The game server did not answer.' });
  }
  if (!upstream.ok) {
    console.error({ unit_finder: upstream.status });
    return json(502, { error: 'The game server did not answer.' });
  }
  const res = new Response(await upstream.arrayBuffer(), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${DATA_TTL}`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/units/data.json')
      return unitData(request, ctx);
    return env.ASSETS.fetch(request);
  },
};
