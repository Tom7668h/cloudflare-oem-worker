# CrazyPartSnatcher Edge API & OEM Cross-Reference Microservice

High-performance, globally distributed Cloudflare Worker microservice providing real-time OEM normalization, search variant generation, catalog brand identification, and direct price-comparison routes for commercial vehicles (trucks, buses, trailers, agricultural and construction machinery).

Runs on Cloudflare V8 isolates across 300+ edge data centers worldwide with sub-millisecond execution times.

---

## ⚡ Live Features

1. **JSON API (`GET /?oem={number}` or `GET /api?oem={number}`)**:
   - Strips non-alphanumeric noise into canonical hashes (`[A-Z0-9]`).
   - Generates brand-specific search variants (MAN, Mercedes-Benz, Bosch, DAF, Scania, Volvo, BPW, SAF-HOLLAND, Knorr-Bremse, Hella, etc.).
   - Detects vehicle manufacturer catalog schemas and confidence ratings.
   - Outputs live comparison route: `https://www.crazypartsnatcher.com/?q={normalized_oem}`.
   - CORS enabled for unrestricted frontend and ERP integration.

2. **Developer & SEO Authority Landing Page (`GET /`)**:
   - 100% unique Dark-Mode developer UI styled with Tailwind CSS.
   - Live interactive in-browser tester with execution latency benchmark.
   - Schema.org `WebAPI` structured data.
   - Technical catalog architecture and edge-caching hub with dofollow backlinks to CrazyPartSnatcher platforms.
   - `robots.txt` endpoint allowing search engines to index `*.workers.dev`.

---

## 🚀 Quick Deployment to Cloudflare

Ensure you have authenticated with Cloudflare:
```bash
npx wrangler login
```

Deploy to Cloudflare Workers (`crazypartsnatcher-oem-api.workers.dev`):
```bash
npm run deploy
# or: npx wrangler deploy
```

For local testing:
```bash
npm run dev
# or: npx wrangler dev
```

---

## 📡 API Usage Examples

### cURL
```bash
curl -s "https://crazypartsnatcher-oem-api.workers.dev/?oem=81.50110.0144" | jq .
```

### Response
```json
{
  "raw_input": "81.50110.0144",
  "normalized_oem": "81501100144",
  "search_variants": [
    "81501100144",
    "81.50110.0144",
    "81.50110-0144",
    "81 50110 0144",
    "81-50110-0144"
  ],
  "detected_brands": [
    "MAN"
  ],
  "live_price_comparison_url": "https://www.crazypartsnatcher.com/?q=81501100144",
  "formatted_display": "81.50110.0144",
  "is_likely_oem": true,
  "catalog_matches": [
    {
      "manufacturer": "MAN",
      "confidence": "high",
      "sampleFormatted": "81.50110.0144",
      "description": "Matches MAN Truck & Bus 11-digit schema (main assembly group prefix)"
    }
  ],
  "edge_meta": {
    "engine": "CrazyPartSnatcher Edge V8",
    "version": "1.0.0",
    "colo": "FRA",
    "country": "DE",
    "timestamp": "2026-10-29T15:15:00.000Z"
  }
}
```

---

## 🔗 Ecosystem Links
- **Platform:** [CrazyPartSnatcher – Lkw & Nutzfahrzeug-Ersatzteile Preisvergleich](https://www.crazypartsnatcher.com)
- **Live Edge Microservice:** [crazypartsnatcher-oem-api.crazypartsnatcher.workers.dev](https://crazypartsnatcher-oem-api.crazypartsnatcher.workers.dev)
- **Worker GitHub Repository:** [Tom7668h/cloudflare-oem-worker](https://github.com/Tom7668h/cloudflare-oem-worker)
- **Core Normalizer Repository:** [Tom7668h/oem-part-normalizer](https://github.com/Tom7668h/oem-part-normalizer)
- **npm Library:** [@crazypartsnatcher/oem-normalizer](https://www.npmjs.com/package/@crazypartsnatcher/oem-normalizer)
- **Packagist (PHP Composer):** [crazypartsnatcher/oem-normalizer](https://packagist.org/packages/crazypartsnatcher/oem-normalizer)
- **jsDelivr CDN:** [@crazypartsnatcher/oem-normalizer](https://www.jsdelivr.com/package/npm/@crazypartsnatcher/oem-normalizer)
- **Socket.dev Audit:** [@crazypartsnatcher/oem-normalizer](https://socket.dev/npm/package/@crazypartsnatcher/oem-normalizer)
- **UNPKG Browser:** [@crazypartsnatcher/oem-normalizer](https://unpkg.com/browse/@crazypartsnatcher/oem-normalizer/)
- **Bundlephobia:** [@crazypartsnatcher/oem-normalizer](https://bundlephobia.com/package/@crazypartsnatcher/oem-normalizer)
- **Documentation Hub:** [OEM Part Normalizer Specification](https://tom7668h.github.io/oem-part-normalizer/)
- **Author & Maintainer:** [CrazyPartSnatcher Engineering](https://www.crazypartsnatcher.com)
