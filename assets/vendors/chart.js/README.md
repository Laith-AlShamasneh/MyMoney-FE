# Chart.js — self-host scaffold (FH3)

Chart.js is currently loaded from the jsdelivr CDN, now pinned with a
**Subresource Integrity (SRI)** hash so the browser refuses to run the file if
its bytes don't match — protecting against CDN tampering:

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"
        integrity="sha384-JUh163oCRItcbPme8pYnROHQMC6fNKTBWtRG3I3I0erJkzNgL7uxKlNwcrcFKeqF"
        crossorigin="anonymous"></script>
```

This tag appears in 5 pages: `pages/budgets/detail.html`, `pages/budgets/index.html`,
`pages/cash-flow/index.html`, `pages/dashboard/index.html`, `pages/transactions/index.html`.

## To self-host (drop the CDN entirely)

1. Fetch the file into this folder:

   ```bash
   bash assets/vendors/chart.js/download-chart.sh
   ```

   (downloads `chart.umd.min.js` here — the exact 4.4.3 build the SRI hash was
   computed from, so the hash stays valid even after the swap.)

2. In each of the 5 pages above, change the `src` to the local path and drop the
   now-unnecessary `crossorigin` (keep `integrity` if you like — it still
   validates a same-origin file):

   ```html
   <script src="/assets/vendors/chart.js/chart.umd.min.js"></script>
   ```

3. Remove `https://cdn.jsdelivr.net` from `script-src` in the CSP `<meta>` of
   every page head (and you can drop the `dns-prefetch` hint for jsdelivr too).

After that the app loads zero third-party scripts.
