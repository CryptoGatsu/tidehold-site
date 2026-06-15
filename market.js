/* Live $SHELLS market cap + price.

   Fetched client-side from Dexscreener (CORS-open, no API key), with the public stats feed
   (TIDEHOLD_CONFIG.statsUrl token.marketCapUsd) as a fallback for when the token isn't on a DEX
   yet (e.g. still on the pump.fun bonding curve). Fills every element on the page that carries:
     data-shells-mcap   -> formatted market cap (e.g. "$228K"), or an em dash if unknown
     data-shells-price  -> formatted price sub-line (e.g. "$0.00023 / token")
   and refreshes on an interval. Exposes window.TideholdMarket.pull() so pages that render their
   market-cap element asynchronously (the Ledger gauges) can request an immediate repaint. */
(function () {
  var CFG = window.TIDEHOLD_CONFIG || {};
  var MINT = CFG.tokenMint;

  function fmtUsd(n) {
    if (n == null || isNaN(n) || n <= 0) return "\u2014"; // em dash
    if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
    return "$" + n.toFixed(2);
  }
  function fmtPrice(p) {
    if (!p || isNaN(p)) return "";
    return (p < 0.01 ? "$" + p.toPrecision(2) : "$" + p.toFixed(4)) + " / token";
  }

  function paint(mcap, price) {
    var m = fmtUsd(mcap), pr = fmtPrice(price);
    var a = document.querySelectorAll("[data-shells-mcap]");
    for (var i = 0; i < a.length; i++) a[i].textContent = m;
    var b = document.querySelectorAll("[data-shells-price]");
    for (var j = 0; j < b.length; j++) b[j].textContent = pr;
    window.TideholdMarket.last = { marketCapUsd: mcap || 0, priceUsd: price || 0 };
  }

  // Fallback: the server's stats feed (populated by StatsExporter, if/when it carries token figures).
  function fromStatsFeed() {
    if (!CFG.statsUrl) { paint(null, null); return; }
    fetch(CFG.statsUrl, { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { var t = (d && d.token) || {}; paint(t.marketCapUsd, t.priceUsd); })
      .catch(function () { paint(null, null); });
  }

  function pull() {
    if (!MINT) { fromStatsFeed(); return; }
    fetch("https://api.dexscreener.com/latest/dex/tokens/" + encodeURIComponent(MINT), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var pairs = (d && d.pairs) || [];
        var best = null, bestLiq = -1;
        for (var i = 0; i < pairs.length; i++) {
          var liq = (pairs[i].liquidity && pairs[i].liquidity.usd) || 0;
          if (liq > bestLiq) { bestLiq = liq; best = pairs[i]; }
        }
        if (best) {
          var mcap = best.marketCap || best.fdv || null;
          var price = best.priceUsd ? parseFloat(best.priceUsd) : null;
          if (mcap || price) { paint(mcap, price); return; }
        }
        fromStatsFeed(); // not indexed on a DEX yet -> use the server figure
      })
      .catch(fromStatsFeed);
  }

  window.TideholdMarket = { pull: pull, last: null };

  if (MINT || CFG.statsUrl) {
    pull();
    setInterval(pull, 60000);
  }
})();
