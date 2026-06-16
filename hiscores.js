/* RuneScape-style Hiscores for the homepage.

   Reads data.hiscores from the stats feed — each entry is { name, wallet, totalLevel, totalXp,
   skills:[{skill, level, xp}] }. Renders a ranked table with an "Overall" view (by total level, then
   total xp) plus a tab per skill that re-ranks by that skill's level/xp. Highlights the connected
   wallet's row. No build step, no deps. */
(function () {
  var CFG = window.TIDEHOLD_CONFIG || {};
  var host = document.querySelector("#hiscores");
  if (!host || !CFG.statsUrl) return;

  // Canonical Tidehold skill order (matches the SkillType enum). Unknown skills get appended.
  var ORDER = ["Mining", "Woodcutting", "Fishing", "Foraging", "Crafting", "Building", "Sailing"];
  var rows = [];
  var view = "Overall";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function nf(n) { return (n == null || isNaN(n)) ? "0" : Math.round(n).toLocaleString("en-US"); }
  function short(w) { return (!w || w.length <= 8) ? (w || "") : w.slice(0, 4) + "\u2026" + w.slice(-4); }
  function myShort() { return window.__tideholdWallet ? short(window.__tideholdWallet) : null; }

  function skillsPresent() {
    var seen = {};
    rows.forEach(function (r) { (r.skills || []).forEach(function (s) { if (s) seen[s.skill] = true; }); });
    var list = ORDER.filter(function (s) { return seen[s]; });
    Object.keys(seen).forEach(function (s) { if (ORDER.indexOf(s) < 0) list.push(s); });
    return list;
  }

  // Rows for the current view: [{name, wallet, level, xp}], ranked.
  function ranked() {
    var out;
    if (view === "Overall") {
      out = rows.map(function (r) {
        return { name: r.name, wallet: r.wallet, level: r.totalLevel || 0, xp: r.totalXp || 0 };
      });
    } else {
      out = [];
      rows.forEach(function (r) {
        var s = (r.skills || []).filter(function (x) { return x.skill === view; })[0];
        if (s && s.xp > 0) out.push({ name: r.name, wallet: r.wallet, level: s.level || 1, xp: s.xp });
      });
    }
    return out.sort(function (a, b) { return (b.level - a.level) || (b.xp - a.xp); });
  }

  function render() {
    var tabs = ["Overall"].concat(skillsPresent());
    var tabsHtml = tabs.map(function (t) {
      return '<button class="hs-tab' + (t === view ? " active" : "") + '" data-skill="' + esc(t) + '">' + esc(t) + "</button>";
    }).join("");

    var list = ranked();
    var mine = myShort();
    var lvlLabel = view === "Overall" ? "Total Lvl" : "Lvl";

    var body;
    if (!list.length) {
      body = '<tr><td colspan="4" class="hs-empty">No ranked players yet \u2014 train a skill to climb the board.</td></tr>';
    } else {
      body = list.map(function (p, i) {
        var me = (mine && p.wallet === mine) ? ' class="hs-me"' : "";
        var medal = i < 3 ? ' hs-top' + (i + 1) : "";
        return "<tr" + me + ">" +
          '<td class="hs-rank' + medal + '">' + (i + 1) + "</td>" +
          '<td class="hs-who">' + esc(p.name || p.wallet) + "<small>" + esc(p.wallet) + "</small></td>" +
          '<td class="hs-num">' + nf(p.level) + "</td>" +
          '<td class="hs-num hs-xp">' + nf(p.xp) + "</td></tr>";
      }).join("");
    }

    host.innerHTML =
      '<div class="hs-head"><h3>Hiscores</h3>' +
        '<span class="hs-sub">' + (list.length ? nf(list.length) + " ranked" : "") + "</span></div>" +
      '<div class="hs-tabs">' + tabsHtml + "</div>" +
      '<div class="hs-scroll"><table class="hs-table"><thead><tr>' +
        '<th class="hs-rank">#</th><th>Player</th><th class="hs-num">' + lvlLabel + '</th><th class="hs-num">XP</th>' +
      "</tr></thead><tbody>" + body + "</tbody></table></div>";

    host.querySelectorAll(".hs-tab").forEach(function (b) {
      b.addEventListener("click", function () { view = b.getAttribute("data-skill"); render(); });
    });
  }

  function load() {
    fetch(CFG.statsUrl, { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { rows = (d && d.hiscores) || []; render(); })
      .catch(function () { rows = []; render(); });
  }

  render();              // show the empty shell immediately
  load();
  setInterval(load, 60000);
  document.addEventListener("tidehold:wallet", render);   // re-highlight when a wallet connects
})();
