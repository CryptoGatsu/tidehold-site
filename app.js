/* Shared behaviour for every page. No build step, no dependencies. */
(function () {
  var CFG = window.TIDEHOLD_CONFIG || {};

  /* ---- year + play links ---- */
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });
  document.querySelectorAll("[data-play]").forEach(function (el) {
    if (CFG.playUrl) { el.href = CFG.playUrl; }
    el.target = "_blank"; el.rel = "noopener";
  });
  document.querySelectorAll("[data-token]").forEach(function (el) {
    if (CFG.tokenMint) el.href = "https://pump.fun/coin/" + CFG.tokenMint;
    el.target = "_blank"; el.rel = "noopener";
  });

  /* ---- mobile nav ---- */
  var toggle = document.querySelector(".nav-toggle");
  var links = document.querySelector(".nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", function () {
      var open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  /* ---- Phantom wallet connect ----
     The website connect is a convenience: it proves ownership and lets you carry
     your address to the client. The game itself still does the authoritative
     signed-nonce auth on connect. */
  var btn = document.querySelector("#connectWallet");
  var state = document.querySelector("#walletState");

  function provider() {
    if (window.solana && window.solana.isPhantom) return window.solana;
    return null;
  }
  function short(addr) { return addr.slice(0, 4) + "…" + addr.slice(-4); }

  function setConnected(pubkey) {
    if (btn) { btn.textContent = "Wallet linked"; btn.classList.remove("btn--brass"); }
    if (state) state.textContent = short(pubkey);
    loadProfile(pubkey);
  }

  async function connect() {
    var p = provider();
    if (!p) {
      // No Phantom, send them to install it rather than failing silently.
      window.open("https://phantom.app/", "_blank", "noopener");
      if (state) state.textContent = "Phantom not found";
      return;
    }
    try {
      var res = await p.connect();
      setConnected(res.publicKey.toString());
    } catch (e) {
      if (state) state.textContent = "Connection declined";
    }
  }

  if (btn) {
    btn.addEventListener("click", connect);
    // Reflect an already-trusted session without prompting.
    var p = provider();
    if (p) {
      p.connect({ onlyIfTrusted: true })
       .then(function (res) { setConnected(res.publicKey.toString()); })
       .catch(function () {});
      p.on && p.on("disconnect", function () {
        if (btn) { btn.textContent = "Connect wallet"; btn.classList.add("btn--brass"); }
        if (state) state.textContent = "";
        var ws = document.querySelector("#walletStats"); if (ws) ws.hidden = true;
      });
    }
  }

  /* ---- Codex: highlight the contents entry for the section in view ---- */
  var tocLinks = Array.prototype.slice.call(document.querySelectorAll(".toc a"));
  if (tocLinks.length && "IntersectionObserver" in window) {
    var map = {};
    tocLinks.forEach(function (a) {
      var id = a.getAttribute("href").slice(1);
      var sec = document.getElementById(id);
      if (sec) map[id] = a;
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          tocLinks.forEach(function (a) { a.classList.remove("active"); });
          var a = map[en.target.id];
          if (a) a.classList.add("active");
        }
      });
    }, { rootMargin: "-20% 0px -70% 0px", threshold: 0 });
    Object.keys(map).forEach(function (id) {
      var sec = document.getElementById(id);
      if (sec) io.observe(sec);
    });
  }
  /* ---- small helpers ---- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function nf(n) { return (n == null || isNaN(n)) ? "0" : Math.round(n).toLocaleString("en-US"); }
  function fmtConv(shells) {
    var per = CFG.shellsPerConvertible || 1000000;
    var c = (shells || 0) / per;
    var s = c >= 100 ? c.toFixed(0) : c >= 1 ? c.toFixed(2) : c.toFixed(4);
    return s.replace(/\.?0+$/, "");
  }

  /* ---- a connected player's own stats ---- */
  function renderProfile(wallet, pr) {
    var panel = document.querySelector("#walletStats");
    if (!panel) return;
    if (!pr) {
      panel.innerHTML = '<p class="ws-empty">No record yet for this wallet. Jump in and start playing to build your stats.</p>';
      panel.hidden = false;
      return;
    }
    var skills = (pr.skills || []).slice().sort(function (a, b) { return (b.level || 0) - (a.level || 0); });
    var skillsHtml = skills.map(function (s) {
      return '<li><span>' + esc(s.skill) + '</span><b class="mono">Lv ' + (s.level || 1) + '</b></li>';
    }).join("") || '<li class="ws-empty">No skills trained yet.</li>';

    panel.innerHTML =
      '<div class="ws-head"><h3>' + esc(pr.name || short(wallet)) + '</h3>' +
        '<span class="ws-wallet mono">' + esc(short(wallet)) + '</span></div>' +
      '<div class="ws-figs">' +
        '<div><span class="ws-label">Convertible</span><span class="ws-val mono">' + fmtConv(pr.convertibleShells) + ' C</span></div>' +
        '<div><span class="ws-label">Bound</span><span class="ws-val mono">' + nf(pr.bound) + '</span></div>' +
        '<div><span class="ws-label">Blueprints</span><span class="ws-val mono">' + nf(pr.blueprintsLearned) + '</span></div>' +
      '</div>' +
      '<h4 class="ws-sub">Skills</h4><ul class="ws-skills">' + skillsHtml + '</ul>';
    panel.hidden = false;
  }

  function loadProfile(wallet) {
    if (!CFG.playerStatsBase || !document.querySelector("#walletStats")) return;
    fetch(CFG.playerStatsBase + encodeURIComponent(wallet) + ".json", { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (pr) { renderProfile(wallet, pr); })
      .catch(function () { renderProfile(wallet, null); });
  }

  /* ---- live player count + $SHELLS market cap (homepage badges) ---- */
  var liveEl = document.querySelector("#livePlayers");
  var capEl  = document.querySelector("#marketCap");
  if ((liveEl || capEl) && CFG.statsUrl) {
    var fmtUsd = function (n) {
      if (!n || isNaN(n)) return "";
      if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
      if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
      if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
      return "$" + n.toFixed(2);
    };
    var pollLive = function () {
      fetch(CFG.statsUrl, { cache: "no-store" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d) return;
          if (liveEl && d.totals && typeof d.totals.onlinePlayers === "number")
            liveEl.textContent = d.totals.onlinePlayers;
          if (capEl && d.token && d.token.marketCapUsd)
            capEl.textContent = " · $SHELLS " + fmtUsd(d.token.marketCapUsd);
        })
        .catch(function () {});
    };
    pollLive();
    setInterval(pollLive, 30000);
  }

  /* ---- embedded game (game.html) ---- */
  var frame = document.querySelector("#gameFrame");
  if (frame && CFG.playUrl && !frame.getAttribute("src")) frame.setAttribute("src", CFG.playUrl);
  var fsBtn = document.querySelector("#gameFullscreen");
  if (fsBtn && frame) {
    fsBtn.addEventListener("click", function () {
      var el = frame;
      if (el.requestFullscreen) el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    });
  }
})();
