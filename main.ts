// Token Launch Radar — entrypoint.
// Reads the sealed snapshot, builds the ranked board, and writes the
// dashboard outputs. Node 22, standard library only, no network.
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|dir>
// In the grader the snapshot is at /input/snapshot.json and output is /output.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { boardIssue, buildRadar, dataScript, parseSnapshot } from "./lib/model.ts";
import { buildDossier } from "./vendor/makefun-board.ts";

const here = resolve(fileURLToPath(new URL(".", import.meta.url)));

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

function copyFiles(src: string, dst: string): void {
  if (!existsSync(src)) return; // screenshots are optional in the repo; the run must not fail without them
  mkdirSync(dst, { recursive: true });
  for (const name of readdirSync(src)) {
    const s = join(src, name);
    const d = join(dst, name);
    if (statSync(s).isDirectory()) copyFiles(s, d);
    else copyFileSync(s, d);
  }
}

const inputArg = arg("input") ?? "/input/snapshot.json";
const inputFile = inputArg.endsWith(".json") ? inputArg : join(inputArg, "snapshot.json");
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}\n`);
  process.exit(1);
}
const out = arg("output") ?? process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
const snapshot = parseSnapshot(readFileSync(inputFile, "utf8"));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue) {
  process.stderr.write(`token radar: board refused: ${issue}\n`);
  process.exit(1);
}
mkdirSync(out, { recursive: true });
mkdirSync(join(out, "dashboard"), { recursive: true });
mkdirSync(join(out, "screenshots"), { recursive: true });
writeFileSync(join(out, "board.json"), `${JSON.stringify({ rows: board, as_of: snapshot.as_of, model: radar.model, count: board.length })}\n`);
writeFileSync(join(out, "data.js"), dataScript(radar));
copyFiles(join(here, "dashboard"), join(out, "dashboard"));
copyFiles(join(here, "screenshots"), join(out, "screenshots"));
writeFileSync(
  join(out, "dossier.json"),
  buildDossier(out, { text_max_bytes: 65536, screenshots: { max: 4, max_bytes: 524288 }, dashboard: { max_files: 400, max_bytes: 4194304 } }),
);
const watchRows = board.filter((r) => r.watchlist).length;
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on watchlist, ${board.length} rows (${watchRows} watchlist)\n` +
  `token radar: rank 1 ${board[0].slug} $${board[0].implied_value_usd.toLocaleString("en-US")}, rank ${board.length} ${board[board.length - 1].slug} $${board[board.length - 1].implied_value_usd.toLocaleString("en-US")}\n` +
  `token radar: wrote ${join(out, "board.json")}, ${join(out, "data.js")}, dashboard, screenshots, dossier.json\n`,
);
