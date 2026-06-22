/* Tidehold admin console (client). All authorization happens server-side in /api/admin via wallet-signature
   verification — this file only collects the signature and renders what the function returns. */
(function () {
  var auth = null; // { pubkey, message, signature }

  function el(id) { return document.getElementById(id); }
  function status(t, ok) {
    el("statusText").textContent = t;
    var d = el("statusDot"); if (d) d.style.background = ok ? "var(--positive,#4caf50)" : "var(--faint,#789)";
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function shortW(w) { return w && w.length > 12 ? w.slice(0, 4) + "…" + w.slice(-4) : (w || ""); }
  function nf(n) { return (n == null || isNaN(n)) ? "0" : Number(n).toLocaleString(); }

  function provider() { return (window.solana && window.solana.isPhantom) ? window.solana : null; }

  async function signIn() {
    var p = provider();
    if (!p) { status("Phantom wallet not found.", false); return; }
    try {
      var resp = await p.connect();
      var pubkey = resp.publicKey.toString();
      var message = "Tidehold Admin Access\n" + new Date().toISOString();
      var enc = new TextEncoder().encode(message);
      var sig = await p.signMessage(enc, "utf8");
      // Phantom returns { signature: Uint8Array }; encode base58 for the server.
      auth = { pubkey: pubkey, message: message, signature: bs58encode(sig.signature || sig) };
      status("Signed in as " + shortW(pubkey) + " — loading…", true);
      el("refreshBtn").style.display = "";
      await load();
    } catch (e) { status("Sign-in cancelled or failed.", false); }
  }

  async function api(action, extra) {
    var r = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ auth: auth, action: action }, extra || {}))
    });
    if (r.status === 401) { status("Not authorized — that wallet isn't the admin.", false); el("gated").style.display = "none"; return null; }
    return r.json().catch(function () { return null; });
  }

  async function load() {
    var data = await api("overview");
    if (!data) return;
    if (data.error) { status("Error: " + data.error, false); return; }
    render(data);
    status("Signed in — last updated " + (data.updated ? new Date(data.updated).toLocaleString() : "?"), true);
    el("gated").style.display = "";
  }

  function render(d) {
    var stats = d.stats || [];
    el("gauges").innerHTML = stats.map(function (s) {
      return '<div class="gauge"><div class="label">' + esc(s.label) + '</div><div class="value">' + nf(s.value) + '</div></div>';
    }).join("");

    var fl = d.flagged || [];
    el("flagged").innerHTML = fl.length ? fl.map(function (a) {
      var hist = (a.history || []).map(function (h) {
        return '<li style="font-family:\'JetBrains Mono\',monospace; font-size:.72rem; color:var(--faint);">' +
          esc(h.when ? new Date(h.when).toLocaleString() : "") + " · <b>" + esc(h.kind) + "</b> " + esc(h.detail) + "</li>";
      }).join("");
      return '<div class="sale" style="margin:.6rem 0; padding:.6rem 0; border-top:1px solid rgba(255,255,255,.06);">' +
        '<div><b>' + esc(a.name || "(unnamed)") + '</b> <span style="color:var(--faint); font-family:\'JetBrains Mono\',monospace;">' + esc(shortW(a.wallet)) + '</span>' +
        ' — ' + nf(a.flagCount) + ' flag(s)' + (a.banned ? ' · <span style="color:var(--negative,#e57)">BANNED</span>' : '') + '</div>' +
        '<ul style="margin:.4rem 0 0; padding-left:1rem;">' + hist + '</ul>' +
        '<div style="margin-top:.5rem; display:flex; gap:.5rem;">' +
        (a.banned
          ? '<button class="btn btn--sm btn--ghost" data-unban="' + esc(a.wallet) + '">Unban</button>'
          : '<button class="btn btn--sm" data-ban="' + esc(a.wallet) + '">Ban</button>') +
        '</div></div>';
    }).join("") : '<p style="color:var(--faint)">No flagged accounts.</p>';

    var bn = d.banned || [];
    el("banned").innerHTML = bn.length ? bn.map(function (a) {
      return '<div style="margin:.4rem 0; display:flex; gap:.6rem; align-items:center; flex-wrap:wrap;">' +
        '<span style="font-family:\'JetBrains Mono\',monospace;">' + esc(shortW(a.wallet)) + '</span>' +
        '<span style="color:var(--faint)">' + esc(a.reason || "") + '</span>' +
        '<button class="btn btn--sm btn--ghost" data-unban="' + esc(a.wallet) + '">Unban</button></div>';
    }).join("") : '<p style="color:var(--faint)">No banned accounts.</p>';

    wireActionButtons();
  }

  function wireActionButtons() {
    document.querySelectorAll("[data-ban]").forEach(function (b) {
      b.onclick = function () { doBan(b.getAttribute("data-ban"), prompt("Ban reason?") || ""); };
    });
    document.querySelectorAll("[data-unban]").forEach(function (b) {
      b.onclick = function () { doUnban(b.getAttribute("data-unban")); };
    });
  }

  async function doBan(wallet, reason) {
    if (!wallet || !confirm("Ban " + shortW(wallet) + "?")) return;
    var r = await api("ban", { wallet: wallet, reason: reason });
    if (r && r.error) { alert(r.error); return; }
    await load();
  }
  async function doUnban(wallet) {
    if (!wallet || !confirm("Unban " + shortW(wallet) + "?")) return;
    var r = await api("unban", { wallet: wallet });
    if (r && r.error) { alert(r.error); return; }
    await load();
  }

  // minimal base58 (Bitcoin alphabet) encoder for the signature bytes
  function bs58encode(bytes) {
    var A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    var d = [], s = "", i, j = 0, c, n;
    bytes = Array.prototype.slice.call(bytes);
    for (i = 0; i < bytes.length; i++) {
      for (c = bytes[i], j = 0; j < d.length; j++) { c += d[j] << 8; d[j] = c % 58; c = (c / 58) | 0; }
      while (c > 0) { d.push(c % 58); c = (c / 58) | 0; }
    }
    for (i = 0; i < bytes.length && bytes[i] === 0; i++) s += A[0];
    for (i = d.length - 1; i >= 0; i--) s += A[d[i]];
    return s;
  }

  window.addEventListener("DOMContentLoaded", function () {
    el("authBtn").onclick = signIn;
    el("refreshBtn").onclick = load;
    el("banBtn").onclick = function () { doBan(el("banWallet").value.trim(), el("banReason").value.trim()); };
  });
})();
