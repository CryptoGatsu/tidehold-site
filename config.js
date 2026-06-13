/* Tidehold website configuration.
   Edit these, then redeploy. Nothing here is secret, it's all public-facing. */
window.TIDEHOLD_CONFIG = {
  // The WebGL client (your Vercel deployment). The "Enter the Harbor" / Play buttons point here.
  playUrl: "https://play.tidehold.world",

  // Public stats feed. The Ledger page fetches this JSON. See ledger.html footer note for the
  // expected shape and how to expose it from the droplet (Caddy serving the public stats file).
  statsUrl: "https://game.tidehold.world/stats.json",

  // Per-wallet public profiles (players/<wallet>.json). Used to show a player their own stats on connect.
  // Serve the public dir's players/ subfolder via Caddy (see the /players/ route in the Caddy setup).
  playerStatsBase: "https://game.tidehold.world/players/",

  // $SHELLS token (pump.fun). Used for the "view token" link and display only.
  tokenMint: "7BsaJwmcg6cdwPxiUkrbiGHq7qiCEDjG2SvJcXCDpump",
  tokenSymbol: "$SHELLS",

  // Economy constant, must match TokenConfig.TokensPerConvertible in the game.
  shellsPerConvertible: 1000000
};
