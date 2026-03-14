import type { TechId } from '../../src/core/types.ts';
import { fmtMoney } from './engine.ts';
import type { SimProfile, SimRunResult } from './types.ts';

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function line(label: string, value: string): string {
  return `  ${label.padEnd(24)} ${value}`;
}

export function printSingleRun(result: SimRunResult): void {
  const final = result.snapshots[result.snapshots.length - 1]!;
  console.log('═'.repeat(76));
  console.log(`Sim Run — ${result.profile.name}`);
  console.log('═'.repeat(76));
  console.log(line('Seed', String(result.seed)));
  console.log(line('Ticks', String(result.ticks)));
  console.log(line('Final money', fmtMoney(final.money)));
  console.log(line('Total earned', fmtMoney(final.totalEarned)));
  console.log(line('Deliveries', String(final.deliveries)));
  console.log(line('Routes active', String(final.routes)));
  console.log(line('Vehicles active', String(final.trucks)));
  console.log(line('Tech unlocked', `${final.techUnlocked}/${result.state.tech.length}`));
  console.log(line('Objectives', `${final.objectivesCompleted}/${result.state.objectives.length}`));
  console.log(line('First delivery', result.firstDeliveryTick === -1 ? 'never' : `tick ${result.firstDeliveryTick}`));
  console.log(line('Score', `${result.score} (${result.verdict})`));

  console.log('\nSpend breakdown:');
  console.log(line('Roads', fmtMoney(result.spends.roads)));
  console.log(line('Stations', fmtMoney(result.spends.stations)));
  console.log(line('Depots', fmtMoney(result.spends.depots)));
  console.log(line('Vehicles', fmtMoney(result.spends.vehicles)));
  console.log(line('Tech', fmtMoney(result.spends.tech)));

  console.log('\nUnlocked techs:');
  if (result.techUnlocks.length === 0) {
    console.log('  none');
  } else {
    for (const unlock of result.techUnlocks) {
      console.log(`  ✓ ${unlock.id} at tick ${unlock.tick} (${fmtMoney(unlock.cost)})`);
    }
  }

  console.log('\nRoutes:');
  if (result.routeRecords.length === 0) {
    console.log('  none');
  } else {
    for (const route of result.routeRecords) {
      const active = result.state.vehicles.filter((vehicle) => vehicle.routeId === route.routeId).length;
      console.log(`  ${route.label.padEnd(28)} tick ${String(route.setupTick).padStart(4)}  trucks:${active}`);
    }
  }
}

function groupByProfile(results: SimRunResult[]): Map<string, SimRunResult[]> {
  const grouped = new Map<string, SimRunResult[]>();
  for (const result of results) {
    const key = result.profile.id;
    grouped.set(key, [...(grouped.get(key) ?? []), result]);
  }
  return grouped;
}

function summarizeProfile(profile: SimProfile, runs: SimRunResult[]): string[] {
  const finalMoney = avg(runs.map((run) => run.snapshots[run.snapshots.length - 1]!.money));
  const deliveries = avg(runs.map((run) => run.snapshots[run.snapshots.length - 1]!.deliveries));
  const score = avg(runs.map((run) => run.score));
  const firstDelivery = avg(runs.filter((run) => run.firstDeliveryTick !== -1).map((run) => run.firstDeliveryTick));
  const techSpendRate = avg(runs.map((run) => run.spends.tech / Math.max(run.state.economy.totalEarned, 1)));
  return [
    `${profile.name} (${profile.id})`,
    `    avg score ${score.toFixed(0)} | avg money ${fmtMoney(finalMoney)} | avg deliveries ${deliveries.toFixed(0)}`,
    `    first delivery ${Number.isFinite(firstDelivery) && firstDelivery > 0 ? `~tick ${firstDelivery.toFixed(0)}` : 'never'} | tech spend ratio ${(techSpendRate * 100).toFixed(1)}%`,
    `    ${profile.description}`,
  ];
}

function summarizeExclusiveChoices(results: SimRunResult[]): string[] {
  const groupScores = new Map<string, { picks: number; scores: number[] }>();
  for (const result of results) {
    for (const tech of result.state.tech) {
      if (!tech.exclusiveGroup || !tech.unlocked) continue;
      const key = `${tech.exclusiveGroup}:${tech.id}`;
      const entry = groupScores.get(key) ?? { picks: 0, scores: [] };
      entry.picks += 1;
      entry.scores.push(result.score);
      groupScores.set(key, entry);
    }
  }

  if (groupScores.size === 0) return ['  no exclusive branches were reached'];
  return [...groupScores.entries()]
    .sort((a, b) => avg(b[1].scores) - avg(a[1].scores))
    .map(([key, value]) => {
      const [, techId] = key.split(':') as [string, TechId];
      return `  ${techId.padEnd(24)} picks:${String(value.picks).padStart(2)}  avg score:${avg(value.scores).toFixed(0)}`;
    });
}

function summarizeTechCorrelations(results: SimRunResult[]): string[] {
  const suiteAverage = avg(results.map((result) => result.score));
  const techMap = new Map<string, { count: number; scores: number[]; ticks: number[] }>();
  for (const result of results) {
    for (const unlock of result.techUnlocks) {
      const entry = techMap.get(unlock.id) ?? { count: 0, scores: [], ticks: [] };
      entry.count += 1;
      entry.scores.push(result.score);
      entry.ticks.push(unlock.tick);
      techMap.set(unlock.id, entry);
    }
  }
  return [...techMap.entries()]
    .filter(([, entry]) => entry.count >= 2)
    .sort((a, b) => (avg(b[1].scores) - suiteAverage) - (avg(a[1].scores) - suiteAverage))
    .slice(0, 8)
    .map(([techId, entry]) => {
      const uplift = avg(entry.scores) - suiteAverage;
      return `  ${techId.padEnd(24)} avg tick:${avg(entry.ticks).toFixed(0).padStart(4)}  score drift:${uplift >= 0 ? '+' : ''}${uplift.toFixed(0)}`;
    });
}

function summarizeWarnings(results: SimRunResult[]): string[] {
  const warnings: string[] = [];
  if (results.some((result) => result.firstDeliveryTick === -1)) {
    warnings.push('  Some runs never reached a first delivery.');
  }
  const slowRuns = results.filter((result) => result.firstDeliveryTick > 450).length;
  if (slowRuns > 0) warnings.push(`  ${slowRuns} run(s) had a slow first delivery ramp (>450 ticks).`);
  const techHeavy = results.filter((result) => result.spends.tech > result.state.economy.totalEarned * 0.45).length;
  if (techHeavy > 0) warnings.push(`  ${techHeavy} run(s) spent more than 45% of earnings on tech.`);
  if (warnings.length === 0) warnings.push('  No major suite-wide warnings.');
  return warnings;
}

export function printSuiteReport(results: SimRunResult[]): void {
  console.log('═'.repeat(76));
  console.log('TransportSim Benchmark Suite');
  console.log('═'.repeat(76));

  console.log('\nRuns:');
  for (const result of results) {
    const final = result.snapshots[result.snapshots.length - 1]!;
    console.log(
      `  ${result.profile.id.padEnd(10)} seed ${String(result.seed).padStart(7)}  ` +
      `score ${String(result.score).padStart(4)}  money ${fmtMoney(final.money).padStart(10)}  ` +
      `deliv ${String(final.deliveries).padStart(4)}  tech ${String(final.techUnlocked).padStart(2)}  ${result.verdict}`,
    );
  }

  console.log('\nProfiles:');
  const firstByProfile = new Map<string, SimProfile>();
  for (const result of results) {
    if (!firstByProfile.has(result.profile.id)) firstByProfile.set(result.profile.id, result.profile);
  }
  for (const [profileId, runs] of groupByProfile(results)) {
    const profile = firstByProfile.get(profileId)!;
    for (const reportLine of summarizeProfile(profile, runs)) console.log(reportLine);
  }

  console.log('\nExclusive branch correlation:');
  for (const reportLine of summarizeExclusiveChoices(results)) console.log(reportLine);

  console.log('\nTech correlation (not causation):');
  for (const reportLine of summarizeTechCorrelations(results)) console.log(reportLine);

  console.log('\nWarnings:');
  for (const warning of summarizeWarnings(results)) console.log(warning);
}
