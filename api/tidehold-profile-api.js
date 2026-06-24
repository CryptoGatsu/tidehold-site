// Tidehold — player profile API
// ──────────────────────────────
// A tiny READ-ONLY HTTP service that serves exactly the JSON that tidehold-profile.html expects. Run it on the
// droplet, right next to Postgres (the Unity dedicated server already writes there), behind nginx + HTTPS.
//
//   GET /profile?wallet=<base58>  ->  { name, wallet, island, joined, combatLevel, boundShells,
//                                       skills[], achievements[], topItems[] }
//   GET /health                   ->  { ok: true }
//
// Install:  npm init -y && npm install express pg cors
// Run:      DATABASE_URL=postgres://reader:PW@localhost:5432/tidehold \
//           ALLOW_ORIGIN=https://tidehold.world \
//           node tidehold-profile-api.js
//
// SECURITY: connect with a READ-ONLY Postgres role (GRANT SELECT only). This endpoint is PUBLIC — anyone can
// read any profile by wallet — so only ever return things you'd put on a public profile. Never private keys,
// Convertible withdrawal internals, ledger rows, or anything sensitive.

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const PORT = process.env.PORT || 8080;
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';   // set to your site origin in production
const USE_SAMPLE = !process.env.DATABASE_URL;           // no DB configured yet -> serve sample data so the page works

const pool = USE_SAMPLE ? null : new Pool({ connectionString: process.env.DATABASE_URL });

const app = express();
app.use(cors({ origin: ALLOW_ORIGIN }));

// Solana base58 sanity check (32–44 chars). Rejects junk before it ever touches the DB.
const WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

app.get('/health', (_req, res) => res.json({ ok: true, sample: USE_SAMPLE }));

app.get('/profile', async (req, res) => {
  const wallet = String(req.query.wallet || '').trim();
  if (!WALLET_RE.test(wallet)) return res.status(400).json({ error: 'bad wallet' });

  try {
    const profile = USE_SAMPLE ? sampleProfile(wallet) : await buildProfile(wallet);
    if (!profile) return res.status(404).json({ error: 'not found' });
    res.set('Cache-Control', 'public, max-age=30');   // light caching; profiles don't change second-to-second
    res.json(profile);
  } catch (err) {
    console.error('[profile]', err);
    res.status(500).json({ error: 'server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Map YOUR Postgres schema to the page's JSON contract here. The four queries below
// are a TEMPLATE — rename the tables/columns to match what the Unity server writes.
// In psql, run `\d+ players` (etc.) to see your real column names, then adjust.
// Send me your schema and I'll finalize these exact queries for you.
// ─────────────────────────────────────────────────────────────────────────────
async function buildProfile(wallet) {
  // 1) the player row
  const p = await pool.query(
    `SELECT name, island, created_at, combat_level, bound_shells
       FROM players
      WHERE wallet = $1`, [wallet]);
  if (p.rowCount === 0) return null;
  const row = p.rows[0];

  // 2) skills — one row per skill. Level caps at 99; xpNext = XP threshold for the next level.
  const sk = await pool.query(
    `SELECT skill AS name, level, xp, xp_next AS "xpNext"
       FROM player_skills
      WHERE wallet = $1
      ORDER BY skill`, [wallet]);

  // 3) achievements — earned + locked. (If you only store earned ones, the page still renders; locked just won't show.)
  const ac = await pool.query(
    `SELECT name, description AS desc,
            (earned_at IS NOT NULL) AS earned,
            to_char(earned_at, 'YYYY-MM-DD') AS date
       FROM player_achievements
      WHERE wallet = $1
      ORDER BY earned_at NULLS LAST, name`, [wallet]);

  // 4) top hauls — most-gathered first. quality 0–4 = Common..Unique.
  const it = await pool.query(
    `SELECT item_name AS name, qty, quality
       FROM player_item_totals
      WHERE wallet = $1
      ORDER BY qty DESC
      LIMIT 8`, [wallet]);

  return {
    name: row.name,
    wallet,
    island: row.island,
    joined: row.created_at ? new Date(row.created_at).toISOString().slice(0, 10) : null,
    combatLevel: row.combat_level,
    boundShells: row.bound_shells,
    skills: sk.rows,
    achievements: ac.rows,
    topItems: it.rows,
  };
}

// Served until DATABASE_URL is set, so you can deploy the service + page and see it end-to-end first.
function sampleProfile(wallet) {
  return {
    name: 'Captain Gatsu', wallet, island: 'Saltmarsh Cay', joined: '2026-01-15',
    combatLevel: 84, boundShells: 18420,
    skills: [
      { name: 'Fishing', level: 92, xp: 6517253, xpNext: 6800000 },
      { name: 'Cooking', level: 88, xp: 4400000, xpNext: 4700000 },
      { name: 'Sailing', level: 80, xp: 2100000, xpNext: 2300000 },
      { name: 'Strength', level: 81, xp: 2400000, xpNext: 2620000 },
    ],
    achievements: [
      { name: 'First Catch', desc: 'Land your first fish', earned: true, date: '2026-01-16' },
      { name: 'Master Angler', desc: 'Reach level 99 Fishing', earned: false, date: null },
    ],
    topItems: [
      { name: 'Silvergill', qty: 4213, quality: 1 },
      { name: 'Abyss Pearl', qty: 312, quality: 4 },
    ],
  };
}

app.listen(PORT, () => console.log(`Tidehold profile API on :${PORT} — origin ${ALLOW_ORIGIN}${USE_SAMPLE ? ' (SAMPLE data; set DATABASE_URL for live)' : ''}`));
