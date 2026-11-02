# Landing page and unit finder

A static landing page for your server plus a small **unit finder** ("where do I get this unit?"),
served by one Cloudflare Worker with static assets, and a second Worker that redirects the `www`
hostname.

The landing page is plain HTML with inline CSS: no JavaScript, trackers or third-party requests.
Its call-to-action link points at your community page; replace the `https://discord.gg/<invite>`
placeholder `href` in `public/index.html` with your own link (or a GitHub Discussions URL).

```
site/
  public/                 what gets served
    index.html            the landing page (all CSS inline)
    _headers              security and cache headers (applied by Workers static assets)
    robots.txt
    units/                the unit finder (index.html + app.js, read-only, no storage)
    assets/, og.jpg,      generated locally by tools/build_assets.py; not in git
    favicon.ico
  src/worker.js           runs only for /units/data.json: proxies it from your game server
  tools/build_assets.py   builds public/assets, og.jpg and the favicon from your copy of the game files
  wrangler.jsonc          Worker "bf-site": static assets on example.com
  www-redirect/           Worker "bf-site-www": 301 www.example.com -> example.com
```

> The page's images and font are derived from game files, which this repository does not
> distribute. You generate them from game data you obtained separately; `public/assets/` is
> gitignored, and the generated `og.jpg` and `favicon.ico` should not be committed either. See the
> [root README](../README.md).

## Requirements

- For the assets: Python 3 with Pillow and numpy; the font subset step also needs `fonttools` and
  `brotli` (without them an existing `public/assets/rodin-eb.woff2` is kept).
- For deploying: the `wrangler` installed in `cdn-worker/` (`cd cdn-worker && npm ci`) and a
  Cloudflare account.

## Build the assets

```bash
BF_CONTENT=/path/to/assets/content BF_APK=/path/to/extracted-apk/assets \
    python3 site/tools/build_assets.py
```

`BF_CONTENT` is the game archive's `content` folder and `BF_APK` the extracted APK's `assets`
folder (the font comes from there). The script only crops, resizes and re-encodes (WebP) the
illustrations, backgrounds, effects and UI pieces it selects, and composes the logo and the
1200x630 link-preview image. The selected files are listed at the top of the script.

## Preview locally

```bash
python3 -m http.server 8787 --bind 127.0.0.1 -d site/public
```

This serves the static page only; `/units/data.json` is produced by the Worker (below), so the unit
finder needs `wrangler dev` or a deployment to show data.

## The unit finder

`public/units/` is a small read-only app. It loads `/units/data.json`, which `src/worker.js`
fetches from `UNIT_FINDER` (a JSON endpoint on your game server, `/bf/gme/unitFinder.php`) and
caches for 5 minutes. The proxy exists because a game server that uses a private root CA (as the
HTTPS client build does) presents a certificate browsers do not trust.

Note that the `unitFinder.php` endpoint is not part of the server source in this repository; without
it the page shows "The game server did not answer." Set `UNIT_FINDER` in `src/worker.js` to your
endpoint, and the CDN host in the `/units/*` Content-Security-Policy in `public/_headers` and in
`public/units/app.js` (`ICON`) to your CDN.

## Configure and deploy (Cloudflare Workers)

Replace `example.com` / `www.example.com` in `wrangler.jsonc` and `www-redirect/wrangler.jsonc`
(and in `www-redirect/index.js`) with your hostnames. Both Workers claim their hostname as a
Worker custom domain, which creates the DNS record and certificate.

```bash
cd site && ../cdn-worker/node_modules/.bin/wrangler deploy --config wrangler.jsonc
```

```bash
cd site/www-redirect && ../../cdn-worker/node_modules/.bin/wrangler deploy --config wrangler.jsonc
```

Unknown paths fall back to the landing page (`not_found_handling: single-page-application`).

## Headers

`public/_headers` sends a strict Content-Security-Policy, `X-Frame-Options: DENY`,
`nosniff`, a restrictive `Permissions-Policy`, and `Cache-Control: no-transform` on everything. The
latter stops Cloudflare from rewriting responses, which includes injecting the Web Analytics beacon
into the HTML, so the page stays tracker-free. The unit finder gets its own CSP from a `/units/*`
rule in the same file, which detaches the site-wide one (`! Content-Security-Policy`), so its page
and script are served as static assets too: only `/units/data.json` runs the Worker, and Worker
requests are billed while static asset requests are free.

## Related documents

- [Root README](../README.md): project overview, data sources, legal notice
- [cdn-worker/README.md](../cdn-worker/README.md): the asset CDN the unit icons come from
- [CONTRIBUTING.md](../CONTRIBUTING.md)
