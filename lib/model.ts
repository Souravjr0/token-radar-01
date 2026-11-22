// Token Launch Radar — valuation model, board builder and farm plans.
// Original work for token-radar-01. Every figure comes from the sealed
// snapshot passed in; no protocol name is special-cased anywhere below.
// A protocol "records no token" when DefiLlama records none for it —
// that is a statement about the record, never a claim it has no token.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  comp_ratio: number;
  growth_mult: number;
  maturity_mult: number;
  breadth_mult: number;
  watchlist: boolean;
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
  ratio: number;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: string;
  model_note: string;
  global_ratio: number;
  rows: BoardRow[];
  live: LiveRow[];
  categories: { name: string; n: number; ratio: number }[];
}

export const MODEL_VERSION = "radar-2-comps";
export const MODEL_NOTE =
  "implied = TVL x category comparables ratio x growth x maturity x chain breadth. " +
  "The ratio is the median market-cap/TVL of token-bearing protocols in the same " +
  "category in this snapshot (only where at least 5 exist, else the global median " +
  "0.205), clipped to 0.10-0.45. Growth uses the 7-day TVL change, clamped to " +
  "-40%..+60% at 0.6 weight. Maturity rises 0.70-1.00 over 0-1095 days since " +
  "listed_at (365 days when unlisted). Breadth adds 2% per extra chain, to 1.20.";

// ---- snapshot parsing -------------------------------------------------

export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Record<string, unknown>;
  if (!raw || typeof raw !== "object") throw new Error("snapshot is not an object");
  const protocols = (raw.protocols as Record<string, unknown>[]).map((v) => ({
    slug: String(v.slug),
    name: String(v.name),
    category: (v.category as string | null) ?? null,
    chains: Array.isArray(v.chains) ? (v.chains as string[]) : [],
    tvl_usd: Number(v.tvl_usd),
    change_7d: (v.change_7d as number | null) ?? null,
    mcap_usd: (v.mcap_usd as number | null) ?? null,
    listed_at: (v.listed_at as string | null) ?? null,
    gecko_id: (v.gecko_id as string | null) ?? null,
    symbol: (v.symbol as string | null) ?? null,
  }));
  return {
    as_of: String(raw.as_of),
    source: String(raw.source),
    floor_usd: Number(raw.floor_usd),
    protocols,
    watchlist: (raw.watchlist as string[]).slice(),
  };
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (!listedAt) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((a - b) / 86_400_000));
}

// ---- eligibility: pre-token, not a wrapped / staked / bridged product --

const EXCLUDED_CATEGORIES = new Set([
  "Bridge", "Canonical Bridge", "Liquid Staking",
  "Liquid Restaking", "Restaked BTC", "CEX",
]);
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

// ---- comparables calibration ------------------------------------------

export function median(values: number[]): number {
  const s = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface CompTable {
  global: number;
  byCategory: Map<string, number>;
  table: { name: string; n: number; ratio: number }[];
}

export function buildCompTable(snapshot: Snapshot): CompTable {
  const byCat = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd && p.tvl_usd > 0) {
      const r = p.mcap_usd / p.tvl_usd;
      all.push(r);
      const key = p.category ?? "Unknown";
      if (!byCat.has(key)) byCat.set(key, []);
      byCat.get(key)!.push(r);
    }
  }
  const global = median(all);
  const byCategory = new Map<string, number>();
  const table: { name: string; n: number; ratio: number }[] = [];
  for (const [cat, vals] of [...byCat.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const ratio = vals.length >= 5
      ? Math.min(0.45, Math.max(0.1, median(vals)))
      : global;
    byCategory.set(cat, ratio);
    table.push({ name: cat, n: vals.length, ratio: Math.round(ratio * 1000) / 1000 });
  }
  return { global, byCategory, table };
}

export function compRatio(p: SnapshotProtocol, comps: CompTable): number {
  return comps.byCategory.get(p.category ?? "Unknown") ?? comps.global;
}

// ---- implied value ------------------------------------------------------

export function impliedValue(
  p: SnapshotProtocol, asOf: string, comps: CompTable,
): { implied: number; ratio: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const ratio = compRatio(p, comps);
  const age = ageDays(asOf, p.listed_at);
  const ageEff = Math.max(0, age ?? 365);
  const maturityMult = 0.7 + 0.3 * (Math.min(ageEff, 1095) / 1095);
  const rawGrowth = p.change_7d ?? 0;
  const clamped = Math.min(60, Math.max(-40, rawGrowth));
  const growthMult = 1 + (clamped / 100) * 0.6;
  const breadthMult = 1 + 0.02 * Math.min(Math.max(p.chains.length - 1, 0), 10);
  const implied = Math.max(1, Math.round(p.tvl_usd * ratio * growthMult * maturityMult * breadthMult));
  return { implied, ratio, growthMult, maturityMult, breadthMult, age };
}

// ---- farm plans ---------------------------------------------------------
// Category-specific, concrete, with a cost and a time on every step.
// Capital tiers follow TVL so a $5m protocol does not ask for $1,000.

function capitalFor(tvl: number): number {
  if (tvl >= 500_000_000) return 1000;
  if (tvl >= 100_000_000) return 500;
  if (tvl >= 20_000_000) return 250;
  return 100;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 60;
  if (age >= 730) return 90;
  if (age >= 365) return 60;
  return 30;
}

function gasFor(chain: string): string {
  const c = chain.toLowerCase();
  if (c.includes("solana")) return "$0.05-$0.50 per transaction on Solana";
  if (c.includes("base") || c.includes("arbitrum") || c.includes("optimism") || c.includes("polygon")) return "$0.10-$1.00 per transaction on a low-fee chain";
  if (c.includes("tron")) return "about $1-$3 in energy or TRX per transaction on Tron";
  if (c.includes("ethereum")) return "$5-$25 gas per transaction on Ethereum mainnet";
  return `$1-$10 gas per transaction on ${chain}`;
}

function actionFor(p: SnapshotProtocol): { verb: string; asset: string; detail: string } {
  const cat = (p.category ?? "").toLowerCase();
  const n = p.name;
  if (cat.includes("lending")) return { verb: "Supply and borrow on", asset: "stablecoins and blue-chip collateral", detail: "supply, then borrow a small amount against it so both sides of the book are used" };
  if (cat.includes("dex")) return { verb: "Provide liquidity and swap on", asset: "its main pool", detail: "add liquidity to the deepest pool, then swap through it weekly" };
  if (cat.includes("rwa")) return { verb: "Hold the tokenised asset on", asset: "its RWA vault or market", detail: "buy and hold the tokenised position, then re-invest any yield it pays" };
  if (cat.includes("risk curator") || cat.includes("capital allocator") || cat.includes("curator")) return { verb: "Deposit into a curated vault on", asset: "a vault run by a named curator", detail: "pick one vault, deposit, and leave it allocated for the full hold period" };
  if (cat.includes("yield")) return { verb: "Stake and compound on", asset: "its yield vault", detail: "deposit, claim any rewards weekly, and re-deposit them" };
  if (cat.includes("cdp")) return { verb: "Open a collateralised position on", asset: "its CDP vault", detail: "lock collateral, mint a small amount of its stable asset, and keep the ratio healthy" };
  if (cat.includes("restak") || cat.includes("staking pool")) return { verb: "Stake through", asset: "its staking pool", detail: "stake, keep the position staked, and do not unstake early" };
  if (cat.includes("deriv") || cat.includes("basis") || cat.includes("perp")) return { verb: "Trade small, regular positions on", asset: "its perps or basis market", detail: "open small hedged positions weekly and close them the same week" };
  if (cat.includes("bridge") || cat.includes("cross chain")) return { verb: "Bridge through", asset: "its cross-chain route", detail: "bridge a small amount each week on a different route" };
  if (cat.includes("payment")) return { verb: "Pay and receive through", asset: "its payments rail", detail: "make a small real payment each week and keep a balance" };
  return { verb: "Use the core product on", asset: "its main feature", detail: `open an account, complete its main flow with real funds, and repeat it weekly on ${n}` };
}

export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = p.chains[0] ?? "Ethereum";
  const second = p.chains[1] ?? chain;
  const capital = capitalFor(p.tvl_usd);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const a = actionFor(p);
  const cat = p.category ?? "DeFi";
  return [
    `Set up a fresh wallet for ${p.name} on ${chain}, fund it with $${capital} plus gas money, and record the wallet address and start date. Cost: ${gas}; time: 15 minutes, once.`,
    `${a.verb} ${p.name} (${cat}): ${a.detail}. Use about $${capital} in total on ${chain}. Cost: ${gas}; time: 20 minutes, once.`,
    `Repeat the core action on ${second} if ${p.name} runs there, or split the position across two vaults or pools, so activity is not a single transaction. Cost: ${gas}; time: 15 minutes, in week 2.`,
    `Stay active for at least ${hold} days: make one real transaction a week on ${p.name}, keep at least $${Math.round(capital / 2)} deployed the whole time, and save a screenshot or transaction hash each week. Cost: ${gas} a week; time: 10 minutes a week.`,
    `Watch for a token announcement from ${p.name}, then check eligibility, claim or register within 7 days if a claim opens, and withdraw only after that check. Cost: ${gas} to claim; time: 30 minutes at claim time.`,
  ];
}

// ---- board --------------------------------------------------------------

export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const comps = buildCompTable(snapshot);
  const watch = new Set(snapshot.watchlist);
  const rows: BoardRow[] = [];
  for (const p of snapshot.protocols) {
    if (!isRankable(p)) continue;
    const v = impliedValue(p, snapshot.as_of, comps);
    rows.push({
      rank: 0,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_days: v.age,
      implied_value_usd: v.implied,
      comp_ratio: Math.round(v.ratio * 1000) / 1000,
      growth_mult: Math.round(v.growthMult * 10000) / 10000,
      maturity_mult: Math.round(v.maturityMult * 10000) / 10000,
      breadth_mult: Math.round(v.breadthMult * 10000) / 10000,
      watchlist: watch.has(p.slug),
      farm_steps: farmSteps(p, v.age),
    });
  }
  rows.sort((a, b) => b.implied_value_usd - a.implied_value_usd || b.tvl_usd - a.tvl_usd || a.slug.localeCompare(b.slug));
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => p.mcap_usd && p.tvl_usd > 0)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0))
    .slice(0, 24)
    .map((p) => ({
      slug: p.slug, name: p.name, category: p.category,
      tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd ?? 0,
      ratio: Math.round(((p.mcap_usd ?? 0) / p.tvl_usd) * 1000) / 1000,
    }));
}

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const comps = buildCompTable(snapshot);
  const board = buildBoard(snapshot);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: MODEL_VERSION,
    model_note: MODEL_NOTE,
    global_ratio: Math.round(comps.global * 1000) / 1000,
    rows: board,
    live: liveRows(snapshot),
    categories: comps.table,
  };
  return { board, radar };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set<string>();
  for (const r of board) {
    if (slugs.has(r.slug)) return `duplicate slug ${r.slug}`;
    slugs.add(r.slug);
  }
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length) return `watchlist missing: ${missing.slice(0, 5).join(", ")}`;
  if (board.length < 100) return `board has ${board.length} rows, need at least 100`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return "ranks are not 1..N";
  for (let i = 1; i < board.length; i++) {
    if (board[i].implied_value_usd > board[i - 1].implied_value_usd) return "implied value rises with rank";
  }
  if (new Set(board.map((r) => r.implied_value_usd)).size < 2) return "all implied values equal";
  for (const r of board) {
    if (!r.farm_steps || r.farm_steps.length < 3 || r.farm_steps.length > 12) return `bad farm_steps for ${r.slug}`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `farm step length out of range for ${r.slug}`;
    }
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}
