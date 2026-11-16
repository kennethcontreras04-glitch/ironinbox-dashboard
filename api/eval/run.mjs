// Measures IronInbox detection against the controlled email sets.
//
//   npm --prefix api run eval                      # both sets, default settings
//   npm --prefix api run eval -- --set scoring     # held-out set only
//   npm --prefix api run eval -- --verbose         # every email with its score and signals
//   npm --prefix api run eval -- --threshold 40    # a different sensitivity setting
//   npm --prefix api run eval -- --classifier ../old/classify.mjs   # compare another version
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildEmail } from './build.mjs';
import tuning from './emails-tuning.mjs';
import scoring from './emails-scoring.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const verbose = args.includes('--verbose');
const json = args.includes('--json');
const which = arg('set', 'all');
const threshold = Number(arg('threshold', 40)); // the app's default (Balanced)
const classifierPath = arg('classifier', resolve(here, '../src/classify.mjs'));
const { gradeEmail } = await import(pathToFileURL(resolve(classifierPath)).href);

// The same keywords a new IronInbox user starts with.
const keywordSource = readFileSync(resolve(here, '../../src/data/defaultKeywords.ts'), 'utf8');
const keywords = [...keywordSource.matchAll(/value:\s*'([^']+)'/g)].map(match => match[1]);
const options = { caseInsensitive: true, matchInSubject: true, matchInBody: true, wholeWordOnly: false };

const TARGETS = { detection: 90, falsePositive: 10 };
const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);

function evaluate(name, set) {
  const rows = set.map((spec, index) => {
    const grade = gradeEmail(buildEmail(spec, index), { keywords, options });
    // Threat detection uses the risk score only. Keyword matches are reported
    // separately: they flag an email as a "keyword match", not as a threat.
    const keywordMatch = grade.signals.some(s => s.detector === 'user-keyword');
    return { ...spec, score: grade.riskScore, level: grade.riskLevel, flagged: grade.riskScore >= threshold, keywordOnly: keywordMatch && grade.riskScore < threshold,
      signals: grade.signals.map(s => `${s.detector}${s.weight >= 0 ? '+' : ''}${s.weight}`) };
  });
  const suspicious = rows.filter(row => row.label === 'suspicious');
  const normal = rows.filter(row => row.label === 'normal');
  const caught = suspicious.filter(row => row.flagged);
  const falsePositives = normal.filter(row => row.flagged);
  const result = {
    set: name, threshold, total: rows.length,
    detectionRate: pct(caught.length, suspicious.length), detected: caught.length, suspicious: suspicious.length,
    falsePositiveRate: pct(falsePositives.length, normal.length), falsePositives: falsePositives.length, normal: normal.length,
    missed: suspicious.filter(row => !row.flagged).map(row => ({ id: row.id, note: row.note, score: row.score, signals: row.signals })),
    wronglyFlagged: falsePositives.map(row => ({ id: row.id, note: row.note, score: row.score, signals: row.signals })),
    rows,
  };
  result.keywordOnlyNormal = normal.filter(row => row.keywordOnly).length;
  result.keywordOnlySuspicious = suspicious.filter(row => row.keywordOnly).length;
  result.meetsDetection = result.detectionRate >= TARGETS.detection;
  result.meetsFalsePositive = result.falsePositiveRate < TARGETS.falsePositive;
  return result;
}

const sets = { tuning, scoring };
const results = Object.entries(sets).filter(([name]) => which === 'all' || which === name).map(([name, set]) => evaluate(name, set));

if (json) {
  console.log(JSON.stringify(results.map(({ rows, ...rest }) => (verbose ? { ...rest, rows } : rest)), null, 2));
} else {
  for (const r of results) {
    console.log(`\n=== ${r.set.toUpperCase()} SET (${r.total} emails, flag threshold ${r.threshold}) ===`);
    console.log(`Detection rate:      ${r.detectionRate}%  (${r.detected}/${r.suspicious})  target >= ${TARGETS.detection}%  ${r.meetsDetection ? 'MET' : 'NOT MET'}`);
    console.log(`False-positive rate: ${r.falsePositiveRate}%  (${r.falsePositives}/${r.normal})  target < ${TARGETS.falsePositive}%  ${r.meetsFalsePositive ? 'MET' : 'NOT MET'}`);
    console.log(`Keyword matches only:  ${r.keywordOnlyNormal}/${r.normal} normal, ${r.keywordOnlySuspicious}/${r.suspicious} suspicious (listed as "Keyword match", not threats)`);
    for (const row of r.missed) console.log(`  MISSED   ${row.id} (${row.score}) ${row.note}  [${row.signals.join(', ')}]`);
    for (const row of r.wronglyFlagged) console.log(`  FALSE+   ${row.id} (${row.score}) ${row.note}  [${row.signals.join(', ')}]`);
    if (verbose) {
      for (const row of r.rows) {
        const verdict = row.flagged === (row.label === 'suspicious') ? 'ok ' : 'BAD';
        console.log(`  ${verdict} ${row.id} ${String(row.score).padStart(3)} ${row.level.padEnd(8)} ${row.label.padEnd(10)} ${row.note}  [${row.signals.join(', ')}]`);
      }
    }
  }
}
