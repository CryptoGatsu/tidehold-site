// Tidehold — admin API (Vercel serverless function).
// THIS is the security boundary. The /admin page is just UI; every read and every ban is authorized HERE by
// verifying an ed25519 signature from the admin wallet against ADMIN_PUBKEY. A signed, timestamped message
// can't be forged or replayed, so editing the page's JS or calling this directly gets you nowhere without the key.
//
// Env (set in Vercel project settings):
//   ADMIN_PUBKEY        base58 pubkey of the admin wallet (must match IslandState.adminWallets in-game)
//   ADMIN_DATA_URL      droplet URL of the admin feed, e.g. https://game.tidehold.world/admin/admin.json
//   ADMIN_FETCH_SECRET  secret header value Caddy requires on /admin/* (so the feed isn't public)
//   GAME_ADMIN_WEBHOOK  (optional) receiver that applies bans on the droplet; omit to disable ban-from-web
//   GAME_ADMIN_SECRET   (optional) shared secret sent to the webhook
//
// deps: tweetnacl, bs58  (add to tidehold-site/package.json)
const nacl = require("tweetnacl");
const bs58 = require("bs58");

const FRESH_MS = 120000; // signed-message lifetime (replay window)

function verify(auth) {
  if (!auth || !auth.pubkey || !auth.message || !auth.signature) return false;
  if (auth.pubkey !== process.env.ADMIN_PUBKEY) return false;          // only the configured admin wallet
  const m = /(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/.exec(auth.message);          // message must carry a fresh timestamp
  if (!m) return false;
  if (Math.abs(Date.now() - Date.parse(m[1])) > FRESH_MS) return false;
  try {
    return nacl.sign.detached.verify(
      new TextEncoder().encode(auth.message),
      bs58.decode(auth.signature),
      bs58.decode(auth.pubkey)
    );
  } catch { return false; }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  const body = req.body || {};
  if (!verify(body.auth)) { res.status(401).json({ error: "unauthorized" }); return; }

  const action = body.action;
  try {
    if (action === "overview") {
      const r = await fetch(process.env.ADMIN_DATA_URL, { headers: { "X-Admin-Key": process.env.ADMIN_FETCH_SECRET || "" } });
      if (!r.ok) { res.status(502).json({ error: "feed unavailable (" + r.status + ")" }); return; }
      res.status(200).json(await r.json());
      return;
    }
    if (action === "ban" || action === "unban") {
      if (!body.wallet) { res.status(400).json({ error: "wallet required" }); return; }
      if (!process.env.GAME_ADMIN_WEBHOOK) { res.status(501).json({ error: "ban-from-web not configured (use in-game admin)" }); return; }
      const r = await fetch(process.env.GAME_ADMIN_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Secret": process.env.GAME_ADMIN_SECRET || "" },
        body: JSON.stringify({ action, wallet: body.wallet, reason: body.reason || "", by: body.auth.pubkey })
      });
      res.status(r.ok ? 200 : 502).json({ ok: r.ok });
      return;
    }
    res.status(400).json({ error: "unknown action" });
  } catch (e) {
    res.status(500).json({ error: "server error" });
  }
};
