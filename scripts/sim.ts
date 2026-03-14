import { getProfiles } from './sim/profiles.ts';
import { runSimulation } from './sim/engine.ts';
import { printSingleRun, printSuiteReport } from './sim/report.ts';

const args = process.argv.slice(2);

function getArg(name: string, fallback: string): string {
  const index = args.indexOf(name);
  return index !== -1 && args[index + 1] ? args[index + 1]! : fallback;
}

function hasFlag(name: string): boolean {
  return args.includes(name);
}

const baseSeed = parseInt(getArg('--seed', String(Math.floor(Math.random() * 999999))), 10);
const ticks = parseInt(getArg('--ticks', hasFlag('--single') ? '3000' : '1500'), 10);
const runs = parseInt(getArg('--runs', hasFlag('--single') ? '1' : '2'), 10);
const profileFilter = getArg('--profile', hasFlag('--single') ? 'balanced' : 'all');
const verbose = hasFlag('--verbose');
const singleMode = hasFlag('--single') || verbose;

const profiles = getProfiles(profileFilter);
if (profiles.length === 0) {
  console.error(`No simulation profile matched "${profileFilter}".`);
  process.exit(1);
}

const seedList = Array.from({ length: Math.max(1, runs) }, (_, index) => baseSeed + index * 7919);

if (singleMode) {
  const result = runSimulation({
    seed: seedList[0]!,
    ticks,
    verbose,
    profile: profiles[0]!,
  });
  printSingleRun(result);
  process.exit(0);
}

const results = [];
for (const profile of profiles) {
  for (const seed of seedList) {
    results.push(runSimulation({ seed, ticks, profile }));
  }
}

results.sort((a, b) => b.score - a.score);
printSuiteReport(results);
