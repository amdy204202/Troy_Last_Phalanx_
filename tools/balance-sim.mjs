import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Deterministic combat-model regression. This does not replace browser play;
// it rapidly searches build combinations for obvious power and survival outliers.
const RUNS_PER_PATH = Number(process.argv[2] || 120);
const RUN_SECONDS = 500;
const bossWaves = [
  { at: 65, hp: 7200, pressure: 2.4 },
  { at: 135, hp: 4300, pressure: 2.0 },
  { at: 205, hp: 5900, pressure: 2.7 },
  { at: 275, hp: 7900, pressure: 3.1 },
  { at: 345, hp: 8800, pressure: 3.6 },
  { at: 415, hp: 9800, pressure: 4.1 },
  { at: 485, hp: 11800, pressure: 4.8 }
];

// dps = reliable single-target output, clear = crowd coverage,
// boss = boss conversion, guard = pressure reduction, control = breathing room.
const paths = {
  'spear/thrust':  { dps: 35, clear: .60, boss: 1.20, guard: .02, control: .20 },
  'spear/spin':    { dps: 26, clear: .82, boss: .82, guard: .05, control: .32 },
  'sword/melee':   { dps: 30, clear: .72, boss: 1.00, guard: .06, control: .25 },
  'sword/throw':   { dps: 28, clear: .68, boss: 1.14, guard: .02, control: .18 },
  'javelin/volley':{ dps: 29, clear: .88, boss: .88, guard: .00, control: .20 },
  'javelin/hunter':{ dps: 34, clear: .65, boss: 1.40, guard: .00, control: .25 },
  'shield/fortress':{dps: 20, clear: .66, boss: .70, guard: .16, control: .36 },
  'shield/assault':{ dps: 23, clear: .68, boss: .86, guard: .10, control: .42 },
  'discus/swarm':  { dps: 24, clear: .85, boss: .78, guard: .06, control: .22 },
  'discus/razor':  { dps: 34, clear: .64, boss: 1.38, guard: .03, control: .22 },
  'firepot/spread':{ dps: 26, clear: .91, boss: .78, guard: .00, control: .28 },
  'firepot/furnace':{dps: 35, clear: .60, boss: 1.34, guard: .00, control: .18 },
  'sling/ricochet':{ dps: 27, clear: .90, boss: .92, guard: .00, control: .18 },
  'sling/heavy':   { dps: 34, clear: .58, boss: 1.40, guard: .00, control: .32 },
  'bow/volley':    { dps: 28, clear: .88, boss: .90, guard: .00, control: .16 },
  'bow/hunter':    { dps: 35, clear: .57, boss: 1.34, guard: .00, control: .20 },
  'flail/orbit':   { dps: 27, clear: .86, boss: .86, guard: .04, control: .38 },
  'flail/impact':  { dps: 39, clear: .60, boss: 1.38, guard: .02, control: .44 },
  'thunder/chain': { dps: 29, clear: .93, boss: .82, guard: .00, control: .23 },
  'thunder/burst': { dps: 36, clear: .59, boss: 1.36, guard: .00, control: .19 },
  'caltrops/control':{dps: 24,clear:.90,boss:.72,guard:.05,control:.48},
  'caltrops/trap': { dps: 31, clear: .78, boss: 1.02, guard: .02, control: .35 },
  'ram/line':      { dps: 30, clear: .84, boss: .96, guard: .03, control: .34 },
  'ram/break':     { dps: 38, clear: .52, boss: 1.43, guard: .02, control: .32 }
};
const names = Object.keys(paths);

let seed = 0x12f4a11;
const random = () => ((seed = Math.imul(seed ^ seed >>> 15, 1 | seed), seed ^= seed + Math.imul(seed ^ seed >>> 7, 61 | seed), ((seed ^ seed >>> 14) >>> 0) / 4294967296));
const pick = a => a[Math.floor(random() * a.length)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function compatibleBuild(anchor) {
  const result = [anchor];
  const used = new Set([anchor.split('/')[0]]);
  while (result.length < 3) {
    const candidate = pick(names);
    const family = candidate.split('/')[0];
    if (!used.has(family)) { used.add(family); result.push(candidate); }
  }
  return result;
}

function simulate(anchor, runIndex) {
  const build = compatibleBuild(anchor);
  const meta = .2 + random() * .62;
  const difficulty = .93 + random() * .18;
  const maxHp = 108 * (1 + meta * .30);
  let hp = maxHp, bossIndex = 0, activeBoss = null, kills = 0, totalDamage = 0;
  let weakestHp = hp, deathAt = RUN_SECONDS, bosses = 0;

  for (let t = 1; t <= RUN_SECONDS; t++) {
    if (!activeBoss && bossIndex < bossWaves.length && t >= bossWaves[bossIndex].at) {
      activeBoss = { ...bossWaves[bossIndex], hp: bossWaves[bossIndex].hp * difficulty };
      bossIndex++;
    }
    const rank = 1 + Math.min(6, t / 75);
    const evolution = t >= 335 ? 1.16 : 1;
    const might = (1 + meta * .25) * evolution;
    const cadence = 1 + meta * .05;
    let dps = 0, clear = 0, guard = 0, control = 0, bossFactor = 0;
    for (const key of build) {
      const p = paths[key];
      const growth = 1 + rank * (.076 + random() * .006);
      dps += p.dps * growth; clear += p.clear; guard += p.guard; control += p.control; bossFactor += p.boss;
    }
    dps *= might * cadence * (.92 + random() * .16);
    clear /= build.length; control /= build.length; bossFactor /= build.length;
    guard = clamp(guard, 0, .48);
    const crowdPressure = (1.62 + t * .0205 + Math.max(0, t - 260) * .0105) * difficulty;
    const leak = clamp(1.03 - clear * .52 - control * .22 - dps / 720, .10, .88);
    // Pressure is a danger budget, not guaranteed contact every second. The
    // 0.31 contact factor approximates circling, dash windows and invulnerability.
    let incoming = crowdPressure * leak * (1 - guard) * .31;

    if (activeBoss) {
      // Real attacks can overlap a boss (pierce, zones, orbitals and crits).
      const converted = dps * bossFactor * 2.65;
      activeBoss.hp -= converted;
      totalDamage += converted;
      incoming += activeBoss.pressure * difficulty * (1 - guard) * (1 - control * .18) * .20;
      if (activeBoss.hp <= 0) {
        activeBoss = null; bosses++; hp = Math.min(maxHp, hp + 14 + maxHp * .04);
      }
    } else {
      totalDamage += dps * (.42 + clear * .34);
      kills += dps * clear / 36;
    }
    const recovery = .05 + meta * .68;
    hp = Math.min(maxHp, hp - incoming + recovery);
    if (random() < .035 + meta * .012) hp = Math.min(maxHp, hp + 2.5);
    weakestHp = Math.min(weakestHp, hp);
    if (hp <= 0) { deathAt = t; break; }
  }
  return { anchor, build, survived: deathAt === RUN_SECONDS, deathAt, bosses, kills, totalDamage, weakestHp };
}

const all = [];
for (const path of names) for (let i = 0; i < RUNS_PER_PATH; i++) all.push(simulate(path, i));
const summarize = key => {
  const rows = all.filter(r => r.anchor === key);
  return {
    runs: rows.length,
    survivalRate: rows.filter(r => r.survived).length / rows.length,
    avgSeconds: rows.reduce((n, r) => n + r.deathAt, 0) / rows.length,
    avgBosses: rows.reduce((n, r) => n + r.bosses, 0) / rows.length,
    avgDamage: rows.reduce((n, r) => n + r.totalDamage, 0) / rows.length
  };
};
const byPath = Object.fromEntries(names.map(n => [n, summarize(n)]));
const overall = {
  runs: all.length,
  survivalRate: all.filter(r => r.survived).length / all.length,
  avgSeconds: all.reduce((n, r) => n + r.deathAt, 0) / all.length,
  crashCount: 0
};
const flags = [];
for (const [name, row] of Object.entries(byPath)) {
  const delta = row.survivalRate - overall.survivalRate;
  if (Math.abs(delta) >= .15) flags.push({ path: name, issue: delta > 0 ? 'overperforming' : 'underperforming', delta: Number(delta.toFixed(3)) });
}
const report = { version: 14, seed: '0x12f4a11', model: 'deterministic-combat-regression-v1', overall, flags, byPath };
const outPath = resolve('BALANCE-REPORT-V14.json');
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`runs=${overall.runs} survival=${(overall.survivalRate * 100).toFixed(1)}% avg=${overall.avgSeconds.toFixed(1)}s flags=${flags.length}`);
for (const [name, r] of Object.entries(byPath)) console.log(`${name.padEnd(19)} survive=${(r.survivalRate*100).toFixed(1).padStart(5)}% bosses=${r.avgBosses.toFixed(2)} time=${r.avgSeconds.toFixed(1)}`);
if (flags.length) console.log('FLAGS', JSON.stringify(flags));
