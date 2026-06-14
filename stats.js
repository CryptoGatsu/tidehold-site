/* ============================================================================
   Ledger, fetches the public stats feed and renders it.

   Expected JSON shape at TIDEHOLD_CONFIG.statsUrl (all fields optional; missing
   ones simply render as "0"). Shell amounts are whole $SHELLS.

   {
     "updated": "2026-06-13T22:00:00Z",
     "totals": {
       "materialsGathered": 0,      // GameStats MaterialsTotal
       "craftsCompleted":   0,      // GameStats CraftsCompleted
       "marketVolumeShells":0,      // GameStats MarketVolume
       "marketTaxShells":   0,      // GameStats MarketTax (-> reserve)
       "withdrawnShells":   0,      // GameStats ShellsWithdrawn
       "totalPlayers":     0,      // total accounts ever
       "onlinePlayers":    0,      // currently connected (live count)
       "peakConcurrent":   0,      // all-time peak simultaneous players
       "islandsClaimed":    0,      // owned islands (needs server tally)
       "convertibleInPlay": 0       // backing reserve, in shells (optional)
     },
     "token": { "symbol":"$SHELLS", "priceUsd": 0, "marketCapUsd": 0 },   // live market figures
     "topPlayers": [ { "name":"Mara", "wallet":"9wXp…wYoo", "valueShells":0, "metric":"net worth" } ],
     "biggestSale": { "item":"Lumber Mill", "priceShells":0, "seller":"…", "buyer":"…", "when":"…" },
     "topMaterials": [ { "name":"Wood", "count":0 } ]
   }

   To serve it from the droplet, expose the game's stats.json read-only, e.g. a
   Caddy route returning /root/tidehold-data/stats.json with permissive CORS, or
   add a small read endpoint to the payout sidecar. Until then this page shows
   clearly-labelled sample figures so the layout is reviewable.
   ========================================================================== */
(function () {
  var CFG = window.TIDEHOLD_CONFIG || {};
  var PER = CFG.shellsPerConvertible || 1000000;

  /* ---------- formatting ---------- */
  function nf(n) {
    if (n == null || isNaN(n)) return "0";
    return Math.round(n).toLocaleString("en-US");
  }
  function conv(shells) {
    if (shells == null || isNaN(shells)) return "0";
    var c = shells / PER;
    var s = c >= 100 ? c.toFixed(0) : c >= 1 ? c.toFixed(2) : c.toFixed(4);
    return s.replace(/\.?0+$/, "");
  }
  function shellsSub(shells) {
    if (shells == null || isNaN(shells)) return "";
    return nf(shells) + " $SHELLS";
  }
  function fmtUsd(n) {
    if (!n || isNaN(n)) return "n/a";
    if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
    return "$" + n.toFixed(2);
  }
  function priceSub(p) {
    if (!p || isNaN(p)) return "";
    return (p < 0.01 ? "$" + p.toPrecision(2) : "$" + p.toFixed(4)) + " / token";
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /* ---------- render ---------- */
  function gauge(label, value, sub) {
    return '<div class="gauge"><div class="label">' + esc(label) + '</div>' +
           '<div class="value">' + value + '</div>' +
           (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div>';
  }

  function render(data, live) {
    var t = data.totals || {};
    var tok = data.token || {};

    document.getElementById("gauges").innerHTML = [
      gauge("$SHELLS market cap", fmtUsd(tok.marketCapUsd), priceSub(tok.priceUsd)),
      gauge("Online now", nf(t.onlinePlayers)),
      gauge("Peak concurrent", nf(t.peakConcurrent), "all-time high"),
      gauge("Total players", nf(t.totalPlayers)),
      gauge("Materials gathered", nf(t.materialsGathered)),
      gauge("Items crafted", nf(t.craftsCompleted)),
      gauge("Market volume", conv(t.marketVolumeShells) + " C", shellsSub(t.marketVolumeShells)),
      gauge("Tax to reserve", conv(t.marketTaxShells) + " C", shellsSub(t.marketTaxShells)),
      gauge("Withdrawn", conv(t.withdrawnShells) + " C", shellsSub(t.withdrawnShells)),
      gauge("Convertible in play", conv(t.convertibleInPlay) + " C", shellsSub(t.convertibleInPlay)),
      gauge("Islands claimed", nf(t.islandsClaimed))
    ].join("");

    // leaderboard
    var rank = document.getElementById("rank");
    var players = (data.topPlayers || []).slice(0, 8);
    if (!players.length) {
      rank.innerHTML = '<li><span class="who" style="color:var(--faint)">No players ranked yet.</span></li>';
    } else {
      rank.innerHTML = players.map(function (p, i) {
        var who = esc(p.name || p.wallet || "Unknown");
        var sub = (p.name && p.wallet) ? ' <small>' + esc(p.wallet) + '</small>' : '';
        return '<li><span class="pos">' + (i + 1).toString().padStart(2, "0") + '</span>' +
               '<span class="who">' + who + sub + '</span>' +
               '<span class="amt">' + conv(p.valueShells) + ' C</span></li>';
      }).join("");
    }

    // biggest sale
    var sale = document.getElementById("sale");
    var s = data.biggestSale;
    if (s && s.priceShells) {
      sale.innerHTML =
        '<div class="item">' + esc(s.item || "Unknown") + '</div>' +
        '<div class="price">' + conv(s.priceShells) + ' C</div>' +
        '<div class="parties">' + shellsSub(s.priceShells) +
        (s.seller ? ' · sold by ' + esc(s.seller) : '') + '</div>';
    } else {
      sale.innerHTML = '<div class="parties" style="color:var(--faint)">No sales recorded yet.</div>';
    }

    // materials bars
    var mats = (data.topMaterials || []).slice(0, 6);
    var max = mats.reduce(function (m, x) { return Math.max(m, x.count || 0); }, 0) || 1;
    var bars = document.getElementById("materials");
    if (!mats.length) {
      bars.innerHTML = '<li class="row" style="color:var(--faint)">Nothing gathered yet.</li>';
    } else {
      bars.innerHTML = mats.map(function (m) {
        var pct = Math.max(3, Math.round((m.count || 0) / max * 100));
        return '<li><div class="row"><span>' + esc(m.name) + '</span><b>' + nf(m.count) + '</b></div>' +
               '<div class="track"><div class="fill" style="width:' + pct + '%"></div></div></li>';
      }).join("");
    }

    // status line
    var dot = document.getElementById("statusDot");
    var txt = document.getElementById("statusText");
    if (live) {
      dot.className = "dot live";
      var on = (data.totals && data.totals.onlinePlayers) || 0;
      txt.textContent = on + " online · " + (data.updated
        ? "live · updated " + new Date(data.updated).toLocaleString()
        : "live");
    } else {
      dot.className = "dot sample";
      txt.textContent = "Sample figures, connect the stats feed to go live (see config.js).";
    }
  }

  /* ---------- demo fallback so the page is reviewable before the feed exists ---------- */
  var DEMO = {
    updated: null,
    totals: {
      materialsGathered: 184320, craftsCompleted: 12774,
      marketVolumeShells: 9450000000, marketTaxShells: 189000000,
      withdrawnShells: 3120000000, convertibleInPlay: 14200000000,
      totalPlayers: 327, onlinePlayers: 18, peakConcurrent: 64, islandsClaimed: 291
    },
    token: { symbol: "$SHELLS", priceUsd: 0.00023, marketCapUsd: 228000 },
    topPlayers: [
      { name: "Saltgrave", wallet: "9wXpf3go…wYoo", valueShells: 4800000000, metric: "net worth" },
      { name: "Mara Quill", wallet: "5BiCib1q…aMde", valueShells: 3120000000 },
      { name: "Driftwright", wallet: "7BsaJwmc…pump", valueShells: 2010000000 },
      { name: "Coralkeep", wallet: "64aB12cd…9f0e", valueShells: 1550000000 },
      { name: "Tern", wallet: "A1b2C3d4…X9y0", valueShells: 980000000 }
    ],
    biggestSale: { item: "Lumber Mill", priceShells: 620000000, seller: "Driftwright" },
    topMaterials: [
      { name: "Wood", count: 86200 }, { name: "Metal", count: 51340 },
      { name: "Fish", count: 29880 }, { name: "Planks", count: 14110 },
      { name: "Forage", count: 9650 }, { name: "Gears", count: 7020 }
    ]
  };

  /* ---------- fetch ---------- */
  if (!CFG.statsUrl) { render(DEMO, false); return; }

  fetch(CFG.statsUrl, { cache: "no-store" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) { render(data, true); })
    .catch(function () { render(DEMO, false); });
})();
