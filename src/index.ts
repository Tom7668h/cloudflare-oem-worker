/**
 * CrazyPartSnatcher Edge API & OEM Cross-Reference Microservice
 * Cloudflare Worker running on edge V8 isolates across 300+ global locations.
 *
 * Provides real-time OEM normalization, search variant generation,
 * brand catalog detection, and live price comparison routing.
 */

import {
  normalizeOem,
  isLikelyOem,
  generateSearchVariants,
  detectManufacturerFormat,
  detectManufacturerDetails,
  formatOemDisplay,
} from './normalizer';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, X-Requested-With',
  'Access-Control-Max-Age': '86400',
};

export interface Env {
  // Cloudflare Worker Environment Bindings
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const host = url.host || 'crazypartsnatcher-oem-api.crazypartsnatcher.workers.dev';

    // 1. Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    // 2. Serve robots.txt with sitemap reference
    if (pathname === '/robots.txt') {
      const robotsTxt = `User-agent: *\nAllow: /\n\nSitemap: https://${host}/sitemap.xml\n`;
      return new Response(robotsTxt, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }

    // 3. Serve dynamic XML Sitemap
    if (pathname === '/sitemap.xml') {
      const today = new Date().toISOString().split('T')[0];
      const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://${host}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://${host}/robots.txt</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>
</urlset>`;
      return new Response(sitemapXml, {
        status: 200,
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          'Cache-Control': 'public, max-age=3600, s-maxage=86400',
        },
      });
    }

    // 4. Health check endpoint
    if (pathname === '/health') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'CrazyPartSnatcher Edge API',
          version: '1.0.0',
          runtime: 'cloudflare-worker-v8',
          host,
          timestamp: new Date().toISOString(),
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ...CORS_HEADERS,
          },
        }
      );
    }

    // 5. Resolve ?oem= query parameter (or /api?oem=... or POST payload)
    let oemParam: string | null = url.searchParams.get('oem');
    if (oemParam === null && pathname.startsWith('/api')) {
      oemParam = url.searchParams.get('q');
    }

    if (request.method === 'POST' && oemParam === null) {
      try {
        const contentType = request.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const body = (await request.json()) as Record<string, unknown>;
          if (typeof body.oem === 'string') oemParam = body.oem;
          else if (typeof body.q === 'string') oemParam = body.q;
        } else if (
          contentType.includes('application/x-www-form-urlencoded') ||
          contentType.includes('multipart/form-data')
        ) {
          const form = await request.formData();
          oemParam = (form.get('oem') || form.get('q')) as string | null;
        }
      } catch {
        // Fallback to null
      }
    }

    // MODUS A: JSON API when oem parameter is provided
    if (oemParam !== null) {
      const rawInput = oemParam.trim();
      const normalized = normalizeOem(rawInput);
      const variants = generateSearchVariants(rawInput);
      const brands = detectManufacturerFormat(rawInput);
      const brandDetails = detectManufacturerDetails(rawInput);
      const displayFormatted = formatOemDisplay(rawInput);
      const isValid = isLikelyOem(rawInput);
      const liveUrl = `https://www.crazypartsnatcher.com/?q=${encodeURIComponent(normalized)}`;

      const cfData = (request as unknown as { cf?: { colo?: string; country?: string; city?: string } }).cf;

      const payload = {
        raw_input: rawInput,
        normalized_oem: normalized,
        search_variants: variants,
        detected_brands: brands,
        live_price_comparison_url: liveUrl,
        formatted_display: displayFormatted,
        is_likely_oem: isValid,
        catalog_matches: brandDetails,
        ecosystem: {
          platform: 'https://www.crazypartsnatcher.com',
          pages_directory: 'https://crazypartsnatcher.pages.dev',
          surge_guide: 'https://crazypartsnatcher.surge.sh',
          repository: 'https://github.com/Tom7668h/oem-part-normalizer',
          npm: 'https://www.npmjs.com/package/@crazypartsnatcher/oem-normalizer',
          packagist: 'https://packagist.org/packages/crazypartsnatcher/oem-normalizer',
          jsdelivr: 'https://www.jsdelivr.com/package/npm/@crazypartsnatcher/oem-normalizer',
          socket: 'https://socket.dev/npm/package/@crazypartsnatcher/oem-normalizer',
          unpkg: 'https://unpkg.com/browse/@crazypartsnatcher/oem-normalizer/',
          bundlephobia: 'https://bundlephobia.com/package/@crazypartsnatcher/oem-normalizer',
          docs: 'https://tom7668h.github.io/oem-part-normalizer/',
        },
        edge_meta: {
          engine: 'CrazyPartSnatcher Edge V8',
          version: '1.0.0',
          colo: cfData?.colo || 'edge',
          city: cfData?.city || 'Global PoP',
          country: cfData?.country || 'global',
          timestamp: new Date().toISOString(),
        },
      };

      return new Response(JSON.stringify(payload, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
          ...CORS_HEADERS,
        },
      });
    }

    // MODUS B: High-performance HTML Landingpage & GUI Dashboard
    const html = generateLandingHtml(host);

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=1800, s-maxage=86400',
        ...CORS_HEADERS,
      },
    });
  },
};

/**
 * Generates the standalone, 100% unique Dark-Mode Developer/API Landingpage & Interactive GUI Dashboard
 */
function generateLandingHtml(host: string): string {
  const currentYear = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en" class="dark scroll-smooth">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CrazyPartSnatcher Edge API – Real-Time Commercial Vehicle & Truck OEM Number Resolver (v1.0)</title>
  <meta name="description" content="High-performance Cloudflare Edge API resolving heavy-duty truck, bus, and trailer OEM part references (MAN, Mercedes-Benz, Scania, Volvo, DAF, Knorr-Bremse, BPW) in sub-millisecond latency. Open-source core by CrazyPartSnatcher Engineering." />
  <meta name="keywords" content="OEM resolver API, truck parts cross reference, commercial vehicle OE normalizer, MAN TGX parts, Mercedes Actros OEM, Scania parts lookup, Knorr-Bremse cross reference, Cloudflare Edge API, CrazyPartSnatcher" />
  <meta name="author" content="CrazyPartSnatcher Engineering (https://www.crazypartsnatcher.com)" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="https://${host}/" />

  <!-- OpenGraph / Social Meta -->
  <meta property="og:type" content="website" />
  <meta property="og:title" content="CrazyPartSnatcher Edge API – Truck & Commercial Vehicle OEM Resolver" />
  <meta property="og:description" content="Instant edge normalization, search variant generation, and catalog detection for heavy-duty commercial vehicle fleet maintenance and multi-supplier price comparisons." />
  <meta property="og:url" content="https://${host}/" />
  <meta property="og:site_name" content="CrazyPartSnatcher Edge Microservices" />

  <!-- Tailwind CSS via CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            brand: {
              50: '#ecfdf5',
              400: '#34d399',
              500: '#10b981',
              600: '#059669',
            },
            edge: {
              dark: '#030712',
              card: '#0b1329',
              border: '#1e293b'
            }
          }
        }
      }
    }
  </script>

  <!-- Typography: Inter & JetBrains Mono -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">

  <style>
    html, body {
      overflow-x: hidden;
      max-width: 100vw;
    }
    body { font-family: 'Inter', sans-serif; }
    code, pre, .font-mono { font-family: 'JetBrains Mono', monospace; }
    .glow-emerald {
      box-shadow: 0 0 50px -10px rgba(16, 185, 129, 0.3);
    }
    .glow-cyan {
      box-shadow: 0 0 50px -10px rgba(6, 182, 212, 0.25);
    }
    .edge-grid {
      background-size: 36px 36px;
      background-image: linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
                        linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
    }
    .tab-btn.active {
      background-color: rgba(16, 185, 129, 0.15);
      border-color: rgba(16, 185, 129, 0.5);
      color: #34d399;
    }
  </style>

  <!-- Schema.org JSON-LD (WebAPI & SoftwareSourceCode) -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebAPI",
        "@id": "https://${host}/#webapi",
        "name": "CrazyPartSnatcher Edge API – Real-Time Commercial Vehicle & Truck OEM Number Resolver",
        "description": "High-performance edge microservice for parsing, normalizing, and resolving automotive and heavy-duty truck OEM part numbers (MAN, Mercedes-Benz, Scania, Volvo, DAF, Iveco, Bosch, Knorr-Bremse, WABCO, BPW).",
        "url": "https://${host}",
        "documentation": "https://www.crazypartsnatcher.com/about",
        "provider": {
          "@type": "Organization",
          "name": "CrazyPartSnatcher",
          "url": "https://www.crazypartsnatcher.com"
        },
        "isPartOf": {
          "@type": "WebSite",
          "name": "CrazyPartSnatcher",
          "url": "https://www.crazypartsnatcher.com"
        },
        "termsOfService": "https://www.crazypartsnatcher.com",
        "potentialAction": {
          "@type": "SearchAction",
          "target": {
            "@type": "EntryPoint",
            "urlTemplate": "https://${host}/?oem={oem}"
          },
          "query-input": "required name=oem"
        }
      },
      {
        "@type": "SoftwareSourceCode",
        "@id": "https://${host}/#sourcecode",
        "name": "@crazypartsnatcher/oem-normalizer",
        "programmingLanguage": {
          "@type": "ComputerLanguage",
          "name": "TypeScript"
        },
        "runtimePlatform": "Cloudflare Workers V8",
        "codeRepository": "https://github.com/Tom7668h/oem-part-normalizer",
        "author": {
          "@type": "Organization",
          "name": "CrazyPartSnatcher Engineering",
          "url": "https://www.crazypartsnatcher.com"
        },
        "maintainer": {
          "@type": "Organization",
          "name": "CrazyPartSnatcher Engineering",
          "url": "https://www.crazypartsnatcher.com"
        },
        "license": "https://opensource.org/licenses/MIT"
      }
    ]
  }
  </script>
</head>

<body class="bg-slate-950 text-slate-100 min-h-screen antialiased selection:bg-emerald-500 selection:text-slate-950 relative overflow-x-hidden">

  <!-- Subtle Edge Background Gradients -->
  <div class="fixed inset-0 edge-grid pointer-events-none z-0"></div>
  <div class="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-[1100px] h-[350px] sm:h-[450px] bg-gradient-to-b from-emerald-500/10 via-teal-500/5 to-transparent blur-3xl pointer-events-none z-0"></div>

  <!-- Top Navigation & Live Edge Status -->
  <header class="relative z-50 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md sticky top-0">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4">
      <div class="flex items-center gap-2 sm:gap-3 shrink-0">
        <a href="/" class="flex items-center gap-2 sm:gap-2.5 group">
          <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform shrink-0">
            ⚡
          </div>
          <div>
            <div class="font-extrabold text-sm sm:text-base tracking-tight text-white flex items-center gap-1.5 sm:gap-2">
              <span>CrazyPartSnatcher</span>
              <span class="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider px-1.5 sm:px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">Edge API</span>
            </div>
            <div class="text-[10px] sm:text-[11px] text-slate-400 font-medium hidden xs:block">OEM Cross-Reference Microservice</div>
          </div>
        </a>
      </div>

      <!-- Desktop Navigation Links (Hidden on < lg) -->
      <nav class="hidden lg:flex items-center gap-4 xl:gap-6 text-xs font-semibold">
        <div class="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-300">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span id="navEdgeStatus">Cloudflare V8 Edge · Sub-millisecond Execution</span>
        </div>
        <a href="#gui" class="text-slate-300 hover:text-white transition-colors">Interactive GUI</a>
        <a href="#author" class="text-slate-300 hover:text-white transition-colors">Open Source</a>
        <a href="#architecture" class="text-slate-300 hover:text-white transition-colors">Catalog Architecture</a>
        <a href="#endpoints" class="text-slate-300 hover:text-white transition-colors">API Docs</a>
      </nav>

      <!-- Right Action Area (Portal CTA & Mobile Menu Toggle) -->
      <div class="flex items-center gap-2 sm:gap-3 shrink-0">
        <a href="https://www.crazypartsnatcher.com" class="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all shadow-md shadow-emerald-500/20 shrink-0">
          <span class="hidden sm:inline">CrazyPartSnatcher.com</span>
          <span class="sm:hidden font-mono text-[11px]">Portal ↗</span>
          <svg class="w-3.5 h-3.5 hidden sm:inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
        </a>

        <!-- Hamburger Toggle Button (< lg) -->
        <button id="mobileMenuBtn" onclick="toggleMobileMenu()" aria-label="Menü ein-/ausklappen" class="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white lg:hidden flex items-center justify-center">
          <svg id="menuIconClosed" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
          <svg id="menuIconOpen" class="w-5 h-5 hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
    </div>

    <!-- Mobile Collapsible Menu Drawer (< lg) -->
    <div id="mobileMenu" class="hidden lg:hidden border-t border-slate-800 bg-slate-950/98 px-4 py-3 space-y-2 font-mono text-xs shadow-2xl backdrop-blur-xl">
      <a href="#gui" onclick="toggleMobileMenu()" class="block py-2.5 px-3 rounded-xl text-slate-300 hover:text-white hover:bg-slate-900 transition-colors">⚡ Interactive GUI Cockpit</a>
      <a href="#author" onclick="toggleMobileMenu()" class="block py-2.5 px-3 rounded-xl text-slate-300 hover:text-white hover:bg-slate-900 transition-colors">📦 Open Source &amp; GitHub Author</a>
      <a href="#architecture" onclick="toggleMobileMenu()" class="block py-2.5 px-3 rounded-xl text-slate-300 hover:text-white hover:bg-slate-900 transition-colors">🚛 Catalog Architecture &amp; Brands</a>
      <a href="#endpoints" onclick="toggleMobileMenu()" class="block py-2.5 px-3 rounded-xl text-slate-300 hover:text-white hover:bg-slate-900 transition-colors">📖 API Endpoints &amp; Docs</a>
      <a href="https://www.crazypartsnatcher.com/about" class="block py-2 px-3 rounded-xl text-cyan-400 hover:bg-slate-900 transition-colors">Über Uns Technologie-Plattform ↗</a>
    </div>
  </header>

  <!-- Hero Section -->
  <section class="relative z-10 pt-10 sm:pt-14 pb-6 sm:pb-8 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto w-full">
    <div class="text-center max-w-4xl mx-auto">
      <div class="inline-flex items-center gap-2 px-3 sm:px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] sm:text-xs font-semibold tracking-wide mb-4 sm:mb-6">
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
        Zero-Latency V8 Runtime · Global Edge Nodes across 300+ Cities
      </div>

      <h1 class="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white leading-tight mb-4 sm:mb-6">
        CrazyPartSnatcher Edge API – <br class="hidden sm:inline" />
        <span class="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
          Real-Time Commercial Vehicle &amp; Truck OEM Number Resolver (v1.0)
        </span>
      </h1>

      <p class="text-sm sm:text-base lg:text-lg text-slate-300 leading-relaxed max-w-3xl mx-auto mb-6 sm:mb-8 font-normal">
        High-performance public microservice resolving heavy-duty commercial truck, bus, trailer, and agricultural OEM part numbers into canonical hashes, catalog schemas, and live multi-supplier price comparisons.
      </p>

      <!-- Key Performance Badges -->
      <div class="flex flex-wrap justify-center gap-2 sm:gap-4 text-[11px] sm:text-xs text-slate-300 font-mono">
        <div class="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center gap-1.5 sm:gap-2 shadow-sm">
          <span class="text-emerald-400 font-bold">&lt; 2 ms</span> Roundtrip Execution
        </div>
        <div class="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center gap-1.5 sm:gap-2 shadow-sm">
          <span class="text-cyan-400 font-bold">300+</span> Edge PoPs
        </div>
        <div class="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center gap-1.5 sm:gap-2 shadow-sm">
          <span class="text-amber-400 font-bold">14+</span> Truck &amp; Trailer Systems
        </div>
        <div class="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center gap-1.5 sm:gap-2 shadow-sm">
          <span class="text-purple-400 font-bold">100%</span> CORS Enabled
        </div>
      </div>
    </div>
  </section>

  <!-- Section 2: Interactive GUI Dashboard & Live Edge Tester -->
  <section id="gui" class="relative z-10 py-8 sm:py-10 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto w-full scroll-mt-20">
    <div class="rounded-2xl sm:rounded-3xl border border-slate-800 bg-slate-900/90 backdrop-blur-2xl p-4 sm:p-7 lg:p-9 glow-emerald w-full">
      
      <!-- Cockpit Header: Title & View Switcher -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-4 sm:pb-6 border-b border-slate-800 gap-3 sm:gap-4">
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-lg sm:text-2xl font-black text-white">⚡ Interactive Edge GUI Cockpit</h2>
            <span class="px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">LIVE</span>
          </div>
          <p class="text-xs text-slate-400 mt-1">Instant in-browser normalization, schema detection, and live price comparison routing.</p>
        </div>

        <!-- View Mode Switcher -->
        <div class="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950 border border-slate-800 self-start sm:self-auto shrink-0">
          <button id="btnTabGui" onclick="switchTab('gui')" class="tab-btn active px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
            <span>Visual GUI</span>
          </button>
          <button id="btnTabJson" onclick="switchTab('json')" class="tab-btn px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition-all flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/></svg>
            <span>Raw JSON</span>
          </button>
          <div id="latencyBadge" class="ml-1 px-2 py-1 rounded-md text-[10px] sm:text-[11px] font-mono font-bold bg-slate-900 text-slate-400 border border-slate-800">
            ⚡ Ready
          </div>
        </div>
      </div>

      <!-- Quick Preset Filter Chips -->
      <div class="pt-5 sm:pt-6">
        <div class="flex items-center justify-between mb-2">
          <label class="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Commercial Vehicle Quick-Presets:</label>
          <span class="text-[10px] sm:text-[11px] text-slate-500 font-mono hidden xs:inline">Click to test instant resolution</span>
        </div>
        <div class="flex flex-wrap gap-1.5 sm:gap-2 text-[11px] sm:text-xs">
          <button onclick="applySample('81.50110.0144')" class="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-emerald-300 border border-slate-800 hover:border-emerald-500/40 font-mono transition-all flex items-center gap-1.5 shadow-sm">
            <span>🚛 MAN TGX:</span> <strong>81.50110.0144</strong>
          </button>
          <button onclick="applySample('A 000 420 00 20')" class="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-cyan-300 border border-slate-800 hover:border-cyan-500/40 font-mono transition-all flex items-center gap-1.5 shadow-sm">
            <span>🚚 Actros:</span> <strong>A 000 420 00 20</strong>
          </button>
          <button onclick="applySample('0 281 002 461')" class="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-amber-300 border border-slate-800 hover:border-amber-500/40 font-mono transition-all flex items-center gap-1.5 shadow-sm">
            <span>⚙️ Bosch CR:</span> <strong>0 281 002 461</strong>
          </button>
          <button onclick="applySample('K000123')" class="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-purple-300 border border-slate-800 hover:border-purple-500/40 font-mono transition-all flex items-center gap-1.5 shadow-sm">
            <span>🛑 Knorr:</span> <strong>K000123</strong>
          </button>
          <button onclick="applySample('20 512 891')" class="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-blue-300 border border-slate-800 hover:border-blue-500/40 font-mono transition-all flex items-center gap-1.5 shadow-sm">
            <span>🚜 Volvo FH:</span> <strong>20 512 891</strong>
          </button>
          <button onclick="applySample('05.801.00.00.0')" class="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-teal-300 border border-slate-800 hover:border-teal-500/40 font-mono transition-all flex items-center gap-1.5 shadow-sm">
            <span>🛞 BPW Axle:</span> <strong>05.801.00.00.0</strong>
          </button>
          <button onclick="applySample('1405525')" class="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-rose-300 border border-slate-800 hover:border-rose-500/40 font-mono transition-all flex items-center gap-1.5 shadow-sm">
            <span>🚛 DAF XF:</span> <strong>1405525</strong>
          </button>
        </div>
      </div>

      <!-- Real-Time Input Field -->
      <div class="mt-5 sm:mt-6">
        <div class="relative flex items-center">
          <div class="hidden sm:flex absolute inset-y-0 left-0 pl-4 items-center pointer-events-none text-slate-500 font-mono text-sm">
            GET /?oem=
          </div>
          <input
            id="oemInput"
            type="text"
            value="81.50110.0144"
            placeholder="Type any OEM number (e.g. 81.50110.0144, A0004200020)..."
            class="w-full pl-3.5 sm:pl-28 pr-16 sm:pr-24 py-3 sm:py-3.5 bg-slate-950 border border-slate-700 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl sm:rounded-2xl text-white font-mono text-sm sm:text-base placeholder-slate-600 outline-none transition-all shadow-inner"
            oninput="handleInputDebounced()"
          />
          <button
            onclick="clearInput()"
            id="clearBtn"
            title="Clear input"
            class="absolute right-2 sm:right-3 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white text-xs font-mono transition-colors"
          >
            Clear ✕
          </button>
        </div>
      </div>

      <!-- TAB 1: VISUAL GUI DASHBOARD -->
      <div id="viewGui" class="mt-6 sm:mt-8 space-y-4 sm:space-y-6">
        
        <!-- Status & Canonical Key Row -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          
          <!-- Canonical Hash Card -->
          <div class="p-4 sm:p-5 rounded-2xl bg-slate-950 border border-slate-800 relative group hover:border-emerald-500/40 transition-colors">
            <div class="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
              <span class="uppercase tracking-wider font-semibold text-emerald-400 flex items-center gap-1.5 text-[11px] sm:text-xs">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                Canonical Hash (Database / SQL)
              </span>
              <button onclick="copyToClipboard('guiNormalized', this)" class="text-slate-500 hover:text-white transition-colors text-xs">
                Copy
              </button>
            </div>
            <div id="guiNormalized" class="text-lg sm:text-2xl font-black font-mono text-white tracking-wider select-all break-all">
              81501100144
            </div>
            <div class="text-[10px] sm:text-[11px] text-slate-500 mt-2">
              Sanitized alphanumeric key for exact Elasticsearch and MySQL queries.
            </div>
          </div>

          <!-- Beautified Display Card -->
          <div class="p-4 sm:p-5 rounded-2xl bg-slate-950 border border-slate-800 relative group hover:border-cyan-500/40 transition-colors">
            <div class="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
              <span class="uppercase tracking-wider font-semibold text-cyan-400 flex items-center gap-1.5 text-[11px] sm:text-xs">
                <span class="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                Formatted Display (Workshop UI)
              </span>
              <button onclick="copyToClipboard('guiFormatted', this)" class="text-slate-500 hover:text-white transition-colors text-xs">
                Copy
              </button>
            </div>
            <div id="guiFormatted" class="text-lg sm:text-2xl font-black font-mono text-cyan-300 tracking-wider select-all break-all">
              81.50110.0144
            </div>
            <div class="text-[10px] sm:text-[11px] text-slate-500 mt-2">
              Manufacturer catalog spacing standard for invoices and mechanic printouts.
            </div>
          </div>
        </div>

        <!-- Detected Brand Hierarchy & Structural Matches -->
        <div class="p-5 rounded-2xl bg-slate-950 border border-slate-800">
          <div class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center justify-between">
            <span>Detected Manufacturer &amp; Catalog Schemas:</span>
            <span id="guiLikelyBadge" class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              ✓ Valid OE Reference
            </span>
          </div>
          <div id="guiBrandTags" class="flex flex-wrap gap-2.5">
            <!-- Dynamic Brand Badges -->
          </div>
          <div id="guiBrandDescription" class="mt-3 text-xs text-slate-400 leading-relaxed font-mono">
            <!-- Dynamic Schema Explanations -->
          </div>
        </div>

        <!-- Search Variations Cloud -->
        <div class="p-5 rounded-2xl bg-slate-950 border border-slate-800">
          <div class="flex items-center justify-between text-xs font-mono text-slate-400 mb-3">
            <span class="uppercase font-bold tracking-wider text-slate-300">
              Generated Search Variations &amp; Catalog Notations (<span id="variantCount">0</span>):
            </span>
            <span class="text-[11px] text-slate-500">Click any pill to copy</span>
          </div>
          <div id="guiVariantsGrid" class="flex flex-wrap gap-2">
            <!-- Dynamic Variant Chips -->
          </div>
        </div>

      </div>

      <!-- TAB 2: RAW JSON CODE VIEW -->
      <div id="viewJson" class="mt-8 hidden">
        <div class="rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden">
          <div class="px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs">
            <div class="flex items-center gap-2 font-mono text-slate-400">
              <span class="w-2.5 h-2.5 rounded-full bg-rose-500/80"></span>
              <span class="w-2.5 h-2.5 rounded-full bg-amber-500/80"></span>
              <span class="w-2.5 h-2.5 rounded-full bg-emerald-500/80"></span>
              <span class="ml-2 text-slate-300 font-semibold" id="terminalTitle">HTTP 200 OK · Content-Type: application/json</span>
            </div>
            <button onclick="copyRawJson(this)" class="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[11px] transition-colors flex items-center gap-1.5">
              <span>Copy JSON</span>
            </button>
          </div>
          <pre class="p-5 text-xs font-mono overflow-x-auto leading-relaxed text-slate-200" id="jsonResult">Loading...</pre>
        </div>
      </div>

      <!-- Prominent Live Price Comparison Call-To-Action Bar -->
      <div class="mt-8 pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <div class="text-sm font-bold text-white flex items-center gap-2">
            <span>Commercial Spare Parts Multi-Supplier Availability</span>
            <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          </div>
          <p class="text-xs text-slate-400 mt-0.5">Compare live distributor stocks, pricing tiers, and alternative cross-references.</p>
        </div>

        <a
          id="livePriceComparisonBtn"
          href="https://www.crazypartsnatcher.com"
          target="_blank"
          rel="noopener"
          class="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-black text-sm transition-all shadow-xl shadow-emerald-500/20 group hover:scale-[1.02] active:scale-95 whitespace-nowrap"
        >
          <span>🔎 Live-Preisvergleich auf CrazyPartSnatcher.com</span>
          <svg class="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
        </a>
      </div>

    </div>
  </section>

  <!-- Section 3: Open Source Core & Engineering Author (Dofollow Ecosystem Network) -->
  <section id="author" class="relative z-10 py-8 sm:py-12 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto w-full scroll-mt-20">
    <div class="rounded-2xl sm:rounded-3xl border border-slate-800 bg-slate-900/70 p-5 sm:p-8 lg:p-10 glow-cyan w-full">
      <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sm:gap-6 pb-6 sm:pb-8 border-b border-slate-800">
        <div>
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-semibold mb-2 sm:mb-3">
            <span>Author &amp; Open Source Core</span>
          </div>
          <h2 class="text-xl sm:text-3xl font-extrabold text-white tracking-tight">
            Maintained by <a href="https://www.crazypartsnatcher.com" target="_blank" class="text-cyan-400 hover:text-cyan-300 underline decoration-cyan-500/50">CrazyPartSnatcher Engineering</a>
          </h2>
          <p class="text-xs sm:text-sm text-slate-400 mt-2 max-w-2xl leading-relaxed">
            Open-source engineering team behind CrazyPartSnatcher. Built with zero-dependency TypeScript &amp; PHP, distributed edge V8 isolates, and deep domain algorithms for commercial vehicle logistics.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
          <a href="https://github.com/Tom7668h/oem-part-normalizer" target="_blank" class="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-white border border-slate-700 font-semibold text-xs transition-all shadow-md">
            <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            <span>GitHub Repository</span>
          </a>
          <a href="https://packagist.org/packages/crazypartsnatcher/oem-normalizer" target="_blank" class="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-amber-300 border border-amber-500/40 font-semibold text-xs transition-all shadow-md">
            <span>Packagist (PHP)</span>
          </a>
        </div>
      </div>

      <!-- Ecosystem Cards Grid (100% Dofollow) -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mt-6 sm:mt-8">
        
        <a href="https://crazypartsnatcher.pages.dev" target="_blank" class="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-amber-500/50 transition-all group">
          <div class="flex items-center justify-between text-xs font-mono text-slate-400 mb-1">
            <span class="text-amber-400 font-bold">Cloudflare Pages</span>
            <span>Directory</span>
          </div>
          <div class="font-bold text-white text-sm group-hover:text-amber-300 transition-colors">OEM Prefix Directory</div>
          <div class="text-[11px] text-slate-400 mt-1">Interactive commercial vehicle &amp; truck numbering schema directory (MAN, Daimler, DAF, BPW).</div>
        </a>

        <a href="https://crazypartsnatcher.surge.sh" target="_blank" class="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-emerald-500/50 transition-all group">
          <div class="flex items-center justify-between text-xs font-mono text-slate-400 mb-1">
            <span class="text-emerald-400 font-bold">Surge Cloud</span>
            <span>Maintenance</span>
          </div>
          <div class="font-bold text-white text-sm group-hover:text-emerald-300 transition-colors">Truck Component Reference</div>
          <div class="text-[11px] text-slate-400 mt-1">Heavy-duty truck &amp; trailer aftermarket maintenance, wear parts matrix, and cross-references.</div>
        </a>

        <a href="https://github.com/Tom7668h/oem-part-normalizer" target="_blank" class="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-emerald-500/50 transition-all group">
          <div class="flex items-center justify-between text-xs font-mono text-slate-400 mb-1">
            <span class="text-emerald-400 font-bold">GitHub Repository</span>
            <span>MIT License</span>
          </div>
          <div class="font-bold text-white text-sm group-hover:text-emerald-300 transition-colors">oem-part-normalizer</div>
          <div class="text-[11px] text-slate-400 mt-1">Open source TypeScript and PHP engine for parsing, normalizing, and format detection.</div>
        </a>

        <a href="https://www.npmjs.com/package/@crazypartsnatcher/oem-normalizer" target="_blank" class="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-rose-500/50 transition-all group">
          <div class="flex items-center justify-between text-xs font-mono text-slate-400 mb-1">
            <span class="text-rose-400 font-bold">npm Registry</span>
            <span>v1.0.2</span>
          </div>
          <div class="font-bold text-white text-sm group-hover:text-rose-300 transition-colors">@crazypartsnatcher/oem-normalizer</div>
          <div class="text-[11px] text-slate-400 mt-1">Published npm package ready for Node.js backends and browser applications.</div>
        </a>

        <a href="https://packagist.org/packages/crazypartsnatcher/oem-normalizer" target="_blank" class="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-amber-500/50 transition-all group">
          <div class="flex items-center justify-between text-xs font-mono text-slate-400 mb-1">
            <span class="text-amber-400 font-bold">Packagist (PHP)</span>
            <span>Composer</span>
          </div>
          <div class="font-bold text-white text-sm group-hover:text-amber-300 transition-colors">crazypartsnatcher/oem-normalizer</div>
          <div class="text-[11px] text-slate-400 mt-1">Standalone PHP 8+ Composer package for Shopware, Magento, Sylius &amp; ERP systems.</div>
        </a>

        <a href="https://www.jsdelivr.com/package/npm/@crazypartsnatcher/oem-normalizer" target="_blank" class="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-emerald-500/50 transition-all group">
          <div class="flex items-center justify-between text-xs font-mono text-slate-400 mb-1">
            <span class="text-emerald-400 font-bold">jsDelivr CDN</span>
            <span>Global Edge</span>
          </div>
          <div class="font-bold text-white text-sm group-hover:text-emerald-300 transition-colors">Multi-CDN Edge Mirror</div>
          <div class="text-[11px] text-slate-400 mt-1">Zero-install browser delivery, instant minified scripts, and SRI hash verification.</div>
        </a>

        <a href="https://socket.dev/npm/package/@crazypartsnatcher/oem-normalizer" target="_blank" class="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-cyan-500/50 transition-all group">
          <div class="flex items-center justify-between text-xs font-mono text-slate-400 mb-1">
            <span class="text-cyan-400 font-bold">Socket.dev Audit</span>
            <span>Score: 100</span>
          </div>
          <div class="font-bold text-white text-sm group-hover:text-cyan-300 transition-colors">Security Supply Chain Analysis</div>
          <div class="text-[11px] text-slate-400 mt-1">Verified safe zero-dependency codebase with automated supply chain integrity scanning.</div>
        </a>

        <a href="https://unpkg.com/browse/@crazypartsnatcher/oem-normalizer/" target="_blank" class="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-blue-500/50 transition-all group">
          <div class="flex items-center justify-between text-xs font-mono text-slate-400 mb-1">
            <span class="text-blue-400 font-bold">UNPKG Explorer</span>
            <span>Files &amp; Types</span>
          </div>
          <div class="font-bold text-white text-sm group-hover:text-blue-300 transition-colors">UNPKG Package Browser</div>
          <div class="text-[11px] text-slate-400 mt-1">Inspect compiled CJS/ESM artifacts, tarball contents, and TypeScript declaration trees.</div>
        </a>

        <a href="https://bundlephobia.com/package/@crazypartsnatcher/oem-normalizer" target="_blank" class="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-purple-500/50 transition-all group">
          <div class="flex items-center justify-between text-xs font-mono text-slate-400 mb-1">
            <span class="text-purple-400 font-bold">Bundlephobia</span>
            <span>&lt; 4 KB Minified</span>
          </div>
          <div class="font-bold text-white text-sm group-hover:text-purple-300 transition-colors">Performance &amp; Bundle Size</div>
          <div class="text-[11px] text-slate-400 mt-1">Real-time bundle analysis, tree-shaking verification, and download time benchmarks.</div>
        </a>

        <a href="https://tom7668h.github.io/oem-part-normalizer/" target="_blank" class="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-teal-500/50 transition-all group">
          <div class="flex items-center justify-between text-xs font-mono text-slate-400 mb-1">
            <span class="text-teal-400 font-bold">GitHub Pages</span>
            <span>Live Docs</span>
          </div>
          <div class="font-bold text-white text-sm group-hover:text-teal-300 transition-colors">Interactive Documentation Hub</div>
          <div class="text-[11px] text-slate-400 mt-1">Comprehensive web documentation, API references, and client-side demo tool.</div>
        </a>

        <a href="https://www.crazypartsnatcher.com/about" class="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-purple-500/50 transition-all group">
          <div class="flex items-center justify-between text-xs font-mono text-slate-400 mb-1">
            <span class="text-purple-400 font-bold">Platform Vision</span>
            <span>About Us</span>
          </div>
          <div class="font-bold text-white text-sm group-hover:text-purple-300 transition-colors">Über CrazyPartSnatcher</div>
          <div class="text-[11px] text-slate-400 mt-1">Die technologische Brücke zwischen Lkw-Werkstätten und verifizierten Teilehändlern.</div>
        </a>

      </div>
    </div>
  </section>

  <!-- Section 4: Catalog Architecture & Supported Truck/Trailer Brands (Dofollow Backlink Hub) -->
  <section id="architecture" class="relative z-10 py-10 sm:py-16 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto w-full scroll-mt-20">
    <div class="rounded-2xl sm:rounded-3xl border border-slate-800 bg-slate-900/60 p-5 sm:p-8 lg:p-12 glow-cyan w-full">
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-semibold mb-3 sm:mb-4">
        <span>Commercial Vehicle Aftermarket Engineering</span>
      </div>
      <h2 class="text-xl sm:text-3xl font-extrabold text-white tracking-tight mb-4 sm:mb-6">
        Catalog Architecture &amp; Supported Truck/Trailer Brands: Edge-Resolution for Heavy-Duty Aftermarket Logistics
      </h2>

      <!-- 281+ Words Original Technical Fachtext with Enhanced Deep Links -->
      <div class="prose prose-invert max-w-none text-slate-300 text-sm sm:text-base leading-relaxed space-y-4">
        <p>
          In modern fleet management and commercial vehicle repair, parts procurement latency directly translates into costly vehicle downtime (<em>Standzeiten</em>). The heavy-duty commercial vehicle sector—encompassing long-haul tractor units (SZM), curtain-siders, refrigerated trailers, agricultural machinery (<em>Agrar &amp; Landmaschinen</em>), and construction haulers (<em>Baumaschinen</em>)—suffers from extreme catalog fragmentation. Original equipment manufacturers such as <strong>MAN Truck &amp; Bus</strong>, <strong>Mercedes-Benz (Daimler Truck)</strong>, <strong>Scania</strong>, <strong>Volvo Trucks</strong>, <strong>DAF Trucks</strong>, <strong>Renault Trucks</strong>, and <strong>Iveco</strong> enforce proprietary catalog formats with varying delimiters, assembly grouping prefixes, and supersession chains. Furthermore, trailer running gears and braking assemblies engineered by <strong>BPW Bergische Achsen</strong>, <strong>SAF-HOLLAND</strong>, <strong>Schmitz Cargobull</strong>, and <strong>Gigant</strong>, combined with pneumatic control units from <strong>Knorr-Bremse</strong>, <strong>WABCO</strong>, and <strong>Haldex</strong>, introduce multi-tier cross-referencing challenges.
        </p>

        <p>
          Traditional database architectures fail when fleet workshops, ERP dispatchers, or procurement platforms query unnormalized part numbers containing erratic whitespace, punctuation, or omitted brand prefixes. The <strong>CrazyPartSnatcher Edge API</strong> operates directly on Cloudflare’s globally distributed V8 serverless network across 300+ edge locations. By resolving syntactic structures in sub-millisecond execution times without hitting centralized origin databases, our edge microservice translates ambiguous part tokens into canonical index keys and comprehensive search variant permutations.
        </p>

        <p>
          This instantaneous resolution layer feeds directly into <a href="https://www.crazypartsnatcher.com" class="text-emerald-400 hover:text-emerald-300 font-bold underline decoration-emerald-500/50 hover:decoration-emerald-400 transition-colors">CrazyPartSnatcher – Lkw &amp; Nutzfahrzeug-Ersatzteile Preisvergleich</a> sowie unsere <a href="https://www.crazypartsnatcher.com/about" class="text-cyan-400 hover:text-cyan-300 font-bold underline decoration-cyan-500/50 hover:decoration-cyan-400 transition-colors">Über Uns Technologie- &amp; Open-Source-Plattform</a>, enabling multi-supplier availability cross-referencing and intelligent replacement sourcing. Ob Einspritzpumpen von <a href="https://www.crazypartsnatcher.com/brand/bosch" class="text-amber-400 hover:text-amber-300 font-semibold underline decoration-amber-500/50">Bosch</a>, Beleuchtungssysteme von <a href="https://www.crazypartsnatcher.com/brand/hella" class="text-amber-400 hover:text-amber-300 font-semibold underline decoration-amber-500/50">Hella</a>, Bremsscheiben von <a href="https://www.crazypartsnatcher.com/brand/brembo" class="text-amber-400 hover:text-amber-300 font-semibold underline decoration-amber-500/50">Brembo</a>, Fahrwerkslenker von <a href="https://www.crazypartsnatcher.com/brand/febi-bilstein" class="text-amber-400 hover:text-amber-300 font-semibold underline decoration-amber-500/50">Febi Bilstein</a>, Filtersysteme von <a href="https://www.crazypartsnatcher.com/brand/mahle" class="text-amber-400 hover:text-amber-300 font-semibold underline decoration-amber-500/50">Mahle</a>, Bremsbeläge von <a href="https://www.crazypartsnatcher.com/brand/ate" class="text-amber-400 hover:text-amber-300 font-semibold underline decoration-amber-500/50">ATE</a> oder Schwerlast-Komponenten von <a href="https://www.crazypartsnatcher.com/brand/dt-spare-parts" class="text-amber-400 hover:text-amber-300 font-semibold underline decoration-amber-500/50">DT Spare Parts</a>: Techniker und Disponenten nutzen das <a href="https://www.crazypartsnatcher.com" class="text-cyan-400 hover:text-cyan-300 font-bold underline decoration-cyan-500/50 hover:decoration-cyan-400 transition-colors">CrazyPartSnatcher Werkstatt-Tool &amp; Teilesuche</a>, um Falschbestellungen zu eliminieren und Standzeiten drastisch zu reduzieren. Zur Integration in eigene ERP- und Lagerverwaltungssysteme steht das Paket <a href="https://www.npmjs.com/package/@crazypartsnatcher/oem-normalizer" target="_blank" rel="noopener" class="text-amber-400 hover:text-amber-300 font-semibold underline decoration-amber-500/50 hover:decoration-amber-400 transition-colors">@crazypartsnatcher/oem-normalizer auf npm</a>, das <a href="https://github.com/Tom7668h/oem-part-normalizer" target="_blank" rel="noopener" class="text-slate-200 hover:text-white font-semibold underline decoration-slate-400/50">GitHub Repository</a> sowie der <a href="https://tom7668h.github.io/oem-part-normalizer/" target="_blank" rel="noopener" class="text-teal-400 hover:text-teal-300 font-semibold underline decoration-teal-500/50 hover:decoration-teal-400 transition-colors">OEM Part Normalizer Web Playground</a> bereit.
        </p>
      </div>

      <!-- Supported Brands Breakdown Grid -->
      <div class="mt-8 pt-8 border-t border-slate-800">
        <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Supported Commercial Vehicle &amp; Tier-1 Systems:</h3>
        <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs font-mono">
          <a href="https://www.crazypartsnatcher.com" class="p-3 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-emerald-500/50 text-center transition-all block">
            <div class="font-bold text-emerald-400">MAN</div>
            <div class="text-[10px] text-slate-500">11-digit numeric</div>
          </a>
          <a href="https://www.crazypartsnatcher.com" class="p-3 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-cyan-500/50 text-center transition-all block">
            <div class="font-bold text-cyan-400">Mercedes-Benz</div>
            <div class="text-[10px] text-slate-500">A + 10-digit</div>
          </a>
          <a href="https://www.crazypartsnatcher.com" class="p-3 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-amber-500/50 text-center transition-all block">
            <div class="font-bold text-amber-400">Scania / DAF</div>
            <div class="text-[10px] text-slate-500">7-digit OEM</div>
          </a>
          <a href="https://www.crazypartsnatcher.com" class="p-3 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-purple-500/50 text-center transition-all block">
            <div class="font-bold text-purple-400">Volvo / Renault</div>
            <div class="text-[10px] text-slate-500">8 &amp; 10-digit series</div>
          </a>
          <a href="https://www.crazypartsnatcher.com" class="p-3 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-rose-500/50 text-center transition-all block">
            <div class="font-bold text-rose-400">Knorr-Bremse</div>
            <div class="text-[10px] text-slate-500">K-series &amp; II valves</div>
          </a>
          <a href="https://www.crazypartsnatcher.com" class="p-3 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-teal-500/50 text-center transition-all block">
            <div class="font-bold text-teal-400">BPW / SAF</div>
            <div class="text-[10px] text-slate-500">Trailer axles &amp; hubs</div>
          </a>
        </div>
      </div>
    </div>
  </section>

  <!-- Section 5: API Endpoints & Developer Integration Guide -->
  <section id="endpoints" class="relative z-10 py-10 sm:py-16 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto w-full scroll-mt-20">
    <div class="mb-8 sm:mb-10 text-center">
      <h2 class="text-2xl sm:text-3xl font-extrabold text-white">Edge Microservice API Reference</h2>
      <p class="text-xs sm:text-sm text-slate-400 mt-2 max-w-2xl mx-auto">Zero authentication required for public tier. Unlimited CORS from web applications and ERP backends.</p>
    </div>

    <!-- Endpoint Card -->
    <div class="rounded-2xl border border-slate-800 bg-slate-900/90 overflow-hidden mb-6 sm:mb-8 shadow-xl">
      <div class="p-4 sm:p-6 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 sm:gap-4">
        <div class="flex items-center gap-2 sm:gap-3">
          <span class="px-2 sm:px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-400 font-mono text-xs font-bold border border-emerald-500/30">GET</span>
          <code class="text-white font-mono text-xs sm:text-sm break-all">https://${host}/?oem={query}</code>
        </div>
        <div class="text-[11px] sm:text-xs font-mono text-slate-400">Alias: <code class="text-slate-300">/api?oem={query}</code></div>
      </div>

      <div class="p-4 sm:p-6">
        <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Parameters</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-xs text-left min-w-[320px]">
            <thead class="text-slate-400 border-b border-slate-800 font-mono">
              <tr>
                <th class="py-2 pr-4">Parameter</th>
                <th class="py-2 pr-4">Type</th>
                <th class="py-2 pr-4">Required</th>
                <th class="py-2">Description</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800 text-slate-300">
              <tr>
                <td class="py-2.5 pr-4 font-mono text-emerald-400">oem</td>
                <td class="py-2.5 pr-4 font-mono text-slate-400">string</td>
                <td class="py-2.5 pr-4 text-emerald-400 font-semibold">Yes</td>
                <td class="py-2.5">Raw part number from invoice, packaging, catalog or user input.</td>
              </tr>
              <tr>
                <td class="py-2.5 pr-4 font-mono text-cyan-400">q</td>
                <td class="py-2.5 pr-4 font-mono text-slate-400">string</td>
                <td class="py-2.5 pr-4 text-slate-400">Optional</td>
                <td class="py-2.5">Search query alias accepted on <code class="font-mono text-slate-400">/api?q=...</code></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Code Examples Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
      <!-- cURL -->
      <div class="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
        <div class="flex items-center justify-between mb-3 text-xs font-mono text-slate-400">
          <span class="font-bold text-white">cURL</span>
          <span class="text-emerald-400">CLI</span>
        </div>
        <pre class="bg-slate-950 p-3 sm:p-3.5 rounded-xl text-[11px] sm:text-xs font-mono text-slate-300 overflow-x-auto"><code>curl -s "https://${host}/?oem=81.50110.0144" | jq .</code></pre>
      </div>

      <!-- JavaScript Fetch -->
      <div class="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
        <div class="flex items-center justify-between mb-3 text-xs font-mono text-slate-400">
          <span class="font-bold text-white">JavaScript / TypeScript</span>
          <span class="text-cyan-400">Fetch</span>
        </div>
        <pre class="bg-slate-950 p-3 sm:p-3.5 rounded-xl text-[11px] sm:text-xs font-mono text-slate-300 overflow-x-auto"><code>const res = await fetch(
  "https://${host}/?oem=A0004200020"
);
const data = await res.json();
console.log(data.normalized_oem);</code></pre>
      </div>

      <!-- Python -->
      <div class="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5 md:col-span-2 lg:col-span-1">
        <div class="flex items-center justify-between mb-3 text-xs font-mono text-slate-400">
          <span class="font-bold text-white">Python 3</span>
          <span class="text-amber-400">requests</span>
        </div>
        <pre class="bg-slate-950 p-3 sm:p-3.5 rounded-xl text-[11px] sm:text-xs font-mono text-slate-300 overflow-x-auto"><code>import requests
r = requests.get(
  "https://${host}/?oem=0281002461"
)
print(r.json()["live_price_comparison_url"])</code></pre>
      </div>
    </div>
  </section>

  <!-- Footer Section -->
  <footer class="relative z-10 border-t border-slate-800/80 bg-slate-950/90 py-8 sm:py-12 px-4 sm:px-6 lg:px-8 mt-12 w-full">
    <div class="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
      <div class="text-center md:text-left">
        <div class="font-extrabold text-white text-sm flex items-center gap-2 justify-center md:justify-start">
          <span>CrazyPartSnatcher Edge Network</span>
          <span class="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">v1.0.0</span>
        </div>
        <p class="text-xs text-slate-500 mt-1">
          Developed &amp; maintained by <a href="https://www.crazypartsnatcher.com" target="_blank" class="text-slate-400 hover:text-white underline">CrazyPartSnatcher Engineering</a>. Open-source core powering commercial vehicle spare parts search.
        </p>
      </div>

      <div class="flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-xs text-slate-400">
        <a href="https://www.crazypartsnatcher.com" class="hover:text-emerald-400 transition-colors font-medium">CrazyPartSnatcher.com</a>
        <a href="https://www.crazypartsnatcher.com/about" class="hover:text-emerald-400 transition-colors font-medium">Über Uns</a>
        <a href="https://crazypartsnatcher.pages.dev" target="_blank" class="hover:text-amber-400 transition-colors font-medium">Pages Directory</a>
        <a href="https://crazypartsnatcher.surge.sh" target="_blank" class="hover:text-emerald-400 transition-colors font-medium">Surge Guide</a>
        <a href="https://github.com/Tom7668h/oem-part-normalizer" target="_blank" class="hover:text-emerald-400 transition-colors font-medium">GitHub Repo</a>
        <a href="https://www.npmjs.com/package/@crazypartsnatcher/oem-normalizer" target="_blank" class="hover:text-emerald-400 transition-colors font-medium">npm</a>
        <a href="https://packagist.org/packages/crazypartsnatcher/oem-normalizer" target="_blank" class="hover:text-amber-400 transition-colors font-medium">Packagist</a>
        <a href="https://www.jsdelivr.com/package/npm/@crazypartsnatcher/oem-normalizer" target="_blank" class="hover:text-emerald-400 transition-colors font-medium">jsDelivr</a>
        <a href="https://socket.dev/npm/package/@crazypartsnatcher/oem-normalizer" target="_blank" class="hover:text-emerald-400 transition-colors font-medium">Socket.dev</a>
        <a href="https://unpkg.com/browse/@crazypartsnatcher/oem-normalizer/" target="_blank" class="hover:text-emerald-400 transition-colors font-medium">UNPKG</a>
        <a href="https://bundlephobia.com/package/@crazypartsnatcher/oem-normalizer" target="_blank" class="hover:text-emerald-400 transition-colors font-medium">Bundlephobia</a>
        <a href="https://tom7668h.github.io/oem-part-normalizer/" target="_blank" class="hover:text-emerald-400 transition-colors font-medium">Playground</a>
        <a href="/sitemap.xml" class="hover:text-emerald-400 transition-colors font-mono">sitemap.xml</a>
        <a href="/robots.txt" class="hover:text-emerald-400 transition-colors font-mono">robots.txt</a>
      </div>
    </div>
    <div class="max-w-5xl mx-auto mt-6 text-center text-[11px] text-slate-600">
      &copy; ${currentYear} CrazyPartSnatcher. All rights reserved. Zero external catalog API dependency · 100% Dofollow Ecosystem Link Network.
    </div>
  </footer>

  <!-- Interactive JavaScript Engine -->
  <script>
    let currentData = null;
    let debounceTimer = null;

    function toggleMobileMenu() {
      const menu = document.getElementById('mobileMenu');
      const iconClosed = document.getElementById('menuIconClosed');
      const iconOpen = document.getElementById('menuIconOpen');
      if (!menu) return;
      if (menu.classList.contains('hidden')) {
        menu.classList.remove('hidden');
        if (iconClosed) iconClosed.classList.add('hidden');
        if (iconOpen) iconOpen.classList.remove('hidden');
      } else {
        menu.classList.add('hidden');
        if (iconClosed) iconClosed.classList.remove('hidden');
        if (iconOpen) iconOpen.classList.add('hidden');
      }
    }

    function switchTab(mode) {
      const btnGui = document.getElementById('btnTabGui');
      const btnJson = document.getElementById('btnTabJson');
      const viewGui = document.getElementById('viewGui');
      const viewJson = document.getElementById('viewJson');

      if (mode === 'gui') {
        btnGui.classList.add('active');
        btnJson.classList.remove('active');
        btnJson.classList.add('text-slate-400');
        viewGui.classList.remove('hidden');
        viewJson.classList.add('hidden');
      } else {
        btnJson.classList.add('active');
        btnGui.classList.remove('active');
        btnGui.classList.add('text-slate-400');
        viewJson.classList.remove('hidden');
        viewGui.classList.add('hidden');
      }
    }

    function handleInputDebounced() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        executeResolver();
      }, 150);
    }

    function applySample(sampleVal) {
      const input = document.getElementById('oemInput');
      input.value = sampleVal;
      executeResolver();
    }

    function clearInput() {
      const input = document.getElementById('oemInput');
      input.value = '';
      input.focus();
    }

    async function executeResolver() {
      const input = document.getElementById('oemInput');
      const rawVal = input.value.trim();
      if (!rawVal) return;

      const latencyBadge = document.getElementById('latencyBadge');
      latencyBadge.textContent = '⚡ Resolving...';
      latencyBadge.className = 'ml-1 px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40';

      const startTime = performance.now();
      try {
        const response = await fetch('/?oem=' + encodeURIComponent(rawVal));
        const duration = (performance.now() - startTime).toFixed(1);
        const data = await response.json();
        currentData = data;

        // Latency & Region display
        const colo = data.edge_meta?.colo || 'edge';
        latencyBadge.textContent = '⚡ ' + duration + ' ms (' + colo + ')';
        latencyBadge.className = 'ml-1 px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';

        // 1. Update GUI Dashboard Fields
        document.getElementById('guiNormalized').textContent = data.normalized_oem || '—';
        document.getElementById('guiFormatted').textContent = data.formatted_display || data.normalized_oem || '—';

        // Validity Badge
        const likelyBadge = document.getElementById('guiLikelyBadge');
        if (data.is_likely_oem) {
          likelyBadge.textContent = '✓ Valid Commercial Vehicle OE';
          likelyBadge.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
        } else {
          likelyBadge.textContent = '⚠️ Ambiguous Reference';
          likelyBadge.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30';
        }

        // Brand Hierarchy Badges
        const brandContainer = document.getElementById('guiBrandTags');
        brandContainer.innerHTML = '';
        if (data.detected_brands && data.detected_brands.length > 0) {
          data.detected_brands.forEach(b => {
            const span = document.createElement('span');
            span.className = 'px-3 py-1 rounded-xl bg-cyan-950/80 text-cyan-300 border border-cyan-700/60 font-mono font-bold text-xs shadow-sm';
            span.textContent = b;
            brandContainer.appendChild(span);
          });
        } else {
          brandContainer.innerHTML = '<span class="text-slate-500 font-mono text-xs">Generic / Multi-Manufacturer Standard</span>';
        }

        // Brand Description
        const descEl = document.getElementById('guiBrandDescription');
        if (data.catalog_matches && data.catalog_matches.length > 0) {
          descEl.innerHTML = data.catalog_matches.map(m => '• ' + m.description + ' (Confidence: <strong class="text-slate-200">' + m.confidence + '</strong>)').join('<br/>');
        } else {
          descEl.textContent = 'Pattern adheres to standardized automotive / commercial vehicle alphanumeric numbering.';
        }

        // Search Variants Grid
        const varGrid = document.getElementById('guiVariantsGrid');
        const varCount = document.getElementById('variantCount');
        varGrid.innerHTML = '';
        if (data.search_variants && data.search_variants.length > 0) {
          varCount.textContent = data.search_variants.length;
          data.search_variants.forEach(variant => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 hover:border-emerald-500/40 font-mono text-xs transition-all flex items-center gap-1.5';
            chip.innerHTML = '<span>' + variant + '</span><span class="text-[9px] text-slate-500">📋</span>';
            chip.onclick = () => {
              navigator.clipboard.writeText(variant);
              chip.classList.add('border-emerald-400', 'text-emerald-300');
              setTimeout(() => chip.classList.remove('border-emerald-400', 'text-emerald-300'), 1000);
            };
            varGrid.appendChild(chip);
          });
        } else {
          varCount.textContent = '0';
        }

        // Update CTA Button
        const ctaBtn = document.getElementById('livePriceComparisonBtn');
        if (data.live_price_comparison_url) {
          ctaBtn.href = data.live_price_comparison_url;
        } else {
          ctaBtn.href = 'https://www.crazypartsnatcher.com/?q=' + encodeURIComponent(data.normalized_oem);
        }

        // 2. Update Raw JSON Tab
        document.getElementById('jsonResult').innerHTML = syntaxHighlight(data);

      } catch (err) {
        latencyBadge.textContent = 'Error';
        latencyBadge.className = 'ml-1 px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30';
      }
    }

    function copyToClipboard(elementId, btn) {
      const el = document.getElementById(elementId);
      if (!el) return;
      navigator.clipboard.writeText(el.textContent.trim()).then(() => {
        const orig = btn.textContent;
        btn.textContent = '✓ Copied';
        btn.classList.add('text-emerald-400');
        setTimeout(() => {
          btn.textContent = orig;
          btn.classList.remove('text-emerald-400');
        }, 1500);
      });
    }

    function copyRawJson(btn) {
      if (!currentData) return;
      navigator.clipboard.writeText(JSON.stringify(currentData, null, 2)).then(() => {
        const orig = btn.innerHTML;
        btn.innerHTML = '<span class="text-emerald-400 font-bold">✓ Copied</span>';
        setTimeout(() => { btn.innerHTML = orig; }, 1500);
      });
    }

    function syntaxHighlight(json) {
      if (typeof json !== 'string') {
        json = JSON.stringify(json, null, 2);
      }
      json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return json.replace(/("(\\\\u[a-zA-Z0-9]{4}|\\\\[^u]|[^\\\\"])*"(\\s*:)?|\\b(true|false|null)\\b|-?\\d+(?:\\.\\d*)?(?:[eE][+\\-]?\\d+)?)/g, function (match) {
        let cls = 'text-emerald-400';
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = 'text-cyan-300 font-medium';
          } else {
            cls = 'text-amber-300';
          }
        } else if (/true|false/.test(match)) {
          cls = 'text-purple-400 font-bold';
        } else if (/null/.test(match)) {
          cls = 'text-rose-400';
        }
        return '<span class="' + cls + '">' + match + '</span>';
      });
    }

    // Auto-run first sample on page load
    window.addEventListener('DOMContentLoaded', () => {
      executeResolver();
    });
  </script>
</body>
</html>`;
}
