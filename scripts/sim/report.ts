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

function modeLabel(mode: string): string {
  if (mode === 'road') return 'Road';
  if (mode === 'rail') return 'Rail';
  if (mode === 'air') return 'Air';
  if (mode === 'sea') return 'Sea';
  return mode;
}

export function formatSingleRun(result: SimRunResult): string {
  const final = result.snapshots[result.snapshots.length - 1]!;
  const modeCounts = result.routeRecords.reduce<Record<string, number>>((acc, route) => {
    acc[route.mode] = (acc[route.mode] ?? 0) + 1;
    return acc;
  }, {});
  const lines: string[] = [];
  lines.push('═'.repeat(76));
  lines.push(`Sim Run — ${result.profile.name}`);
  lines.push('═'.repeat(76));
  lines.push(line('Seed', String(result.seed)));
  lines.push(line('Ticks', String(result.ticks)));
  lines.push(line('Final money', fmtMoney(final.money)));
  lines.push(line('Total earned', fmtMoney(final.totalEarned)));
  lines.push(line('Deliveries', String(final.deliveries)));
  lines.push(line('Routes active', String(final.routes)));
  lines.push(line('Vehicles active', String(final.trucks)));
  lines.push(line('Tech unlocked', `${final.techUnlocked}/${result.state.tech.length}`));
  lines.push(line('Objectives', `${final.objectivesCompleted}/${result.state.objectives.length}`));
  lines.push(line('First delivery', result.firstDeliveryTick === -1 ? 'never' : `tick ${result.firstDeliveryTick}`));
  lines.push(line('Score', `${result.score} (${result.verdict})`));
  lines.push(line('Modes used', Object.entries(modeCounts).map(([mode, count]) => `${mode}:${count}`).join(', ') || 'road:0'));

  lines.push('');
  lines.push('Spend breakdown:');
  lines.push(line('Roads', fmtMoney(result.spends.roads)));
  lines.push(line('Stations', fmtMoney(result.spends.stations)));
  lines.push(line('Depots', fmtMoney(result.spends.depots)));
  lines.push(line('Vehicles', fmtMoney(result.spends.vehicles)));
  lines.push(line('Tech', fmtMoney(result.spends.tech)));

  lines.push('');
  lines.push('Unlocked techs:');
  if (result.techUnlocks.length === 0) {
    lines.push('  none');
  } else {
    for (const unlock of result.techUnlocks) {
      lines.push(`  ✓ ${unlock.id} at tick ${unlock.tick} (${fmtMoney(unlock.cost)})`);
    }
  }

  lines.push('');
  lines.push('Routes:');
  if (result.routeRecords.length === 0) {
    lines.push('  none');
  } else {
    for (const route of result.routeRecords) {
      const active = result.state.vehicles.filter((vehicle) => vehicle.routeId === route.routeId).length;
      lines.push(`  [${route.mode}] ${route.label.padEnd(22)} tick ${String(route.setupTick).padStart(4)}  units:${active}`);
    }
  }
  return lines.join('\n');
}

export function printSingleRun(result: SimRunResult): void {
  console.log(formatSingleRun(result));
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

function summarizeNarrative(results: SimRunResult[]): string[] {
  if (results.length === 0) return ['No results were available.'];
  const grouped = groupByProfile(results);
  const rankedProfiles = [...grouped.entries()]
    .map(([profileId, runs]) => ({
      profileId,
      profile: runs[0]!.profile,
      avgScore: avg(runs.map((run) => run.score)),
      avgDeliveries: avg(runs.map((run) => run.snapshots[run.snapshots.length - 1]!.deliveries)),
      avgMoney: avg(runs.map((run) => run.snapshots[run.snapshots.length - 1]!.money)),
      avgFirstDelivery: avg(runs.filter((run) => run.firstDeliveryTick !== -1).map((run) => run.firstDeliveryTick)),
    }))
    .sort((a, b) => b.avgScore - a.avgScore);

  const winner = rankedProfiles[0]!;
  const runnerUp = rankedProfiles[1] ?? null;
  const loser = rankedProfiles[rankedProfiles.length - 1]!;
  const scoreGap = runnerUp ? winner.avgScore - runnerUp.avgScore : 0;

  const modeTotals = new Map<string, number>();
  for (const result of results) {
    for (const route of result.routeRecords) {
      modeTotals.set(route.mode, (modeTotals.get(route.mode) ?? 0) + 1);
    }
  }
  const rankedModes = [...modeTotals.entries()].sort((a, b) => b[1] - a[1]);
  const dominantMode = rankedModes[0] ? `${modeLabel(rankedModes[0][0])} (${rankedModes[0][1]} routes)` : 'none';

  const noDeliveryRuns = results.filter((run) => run.firstDeliveryTick === -1).length;
  const slowRampRuns = results.filter((run) => run.firstDeliveryTick > 450).length;
  const techHeavyRuns = results.filter((run) => run.spends.tech > run.state.economy.totalEarned * 0.45).length;
  const strongRuns = results.filter((run) => run.verdict === 'strong').length;
  const deadRuns = results.filter((run) => run.snapshots[run.snapshots.length - 1]!.money <= 0 && run.snapshots[run.snapshots.length - 1]!.deliveries < 25).length;
  const topScore = Math.max(...results.map((run) => run.score));
  const bottomScore = Math.min(...results.map((run) => run.score));

  const conclusions: string[] = [];
  conclusions.push(
    `${winner.profile.name} performed best overall with an average score of ${winner.avgScore.toFixed(0)}, ` +
    `${winner.avgDeliveries.toFixed(0)} deliveries, and ${fmtMoney(winner.avgMoney)} final money.`,
  );
  if (runnerUp) {
    conclusions.push(
      `${runnerUp.profile.name} came second, trailing by about ${scoreGap.toFixed(0)} score points. ` +
      `The weakest profile in this batch was ${loser.profile.name}.`,
    );
  }
  conclusions.push(
    `The most-used transport mode across the suite was ${dominantMode}, which gives a quick read on what the simulation naturally trusted in this scenario.`,
  );
  conclusions.push(
    `This suite was ${topScore - bottomScore > 5000 ? 'highly seed-sensitive' : 'fairly consistent'}: ` +
    `scores ranged from ${bottomScore} to ${topScore}, with ${strongRuns}/${results.length} run(s) ending in a strong state.`,
  );
  if (Number.isFinite(winner.avgFirstDelivery) && winner.avgFirstDelivery > 0) {
    conclusions.push(
      `The best-performing profile started delivering around tick ${winner.avgFirstDelivery.toFixed(0)} on average, ` +
      `which is a useful proxy for early-game ramp speed.`,
    );
  }
  if (noDeliveryRuns > 0 || slowRampRuns > 0 || techHeavyRuns > 0) {
    const riskParts: string[] = [];
    if (noDeliveryRuns > 0) riskParts.push(`${noDeliveryRuns} run(s) never reached a first delivery`);
    if (slowRampRuns > 0) riskParts.push(`${slowRampRuns} run(s) had a slow opening ramp`);
    if (techHeavyRuns > 0) riskParts.push(`${techHeavyRuns} run(s) overspent on tech`);
    if (deadRuns > 0) riskParts.push(`${deadRuns} run(s) effectively stalled at zero cash`);
    conclusions.push(`Main risk signals: ${riskParts.join('; ')}.`);
  } else {
    conclusions.push('No major suite-wide risk signals stood out: delivery ramp, tech spending, and completion pace were all within a healthy range.');
  }
  return conclusions;
}

function summarizeRecommendations(results: SimRunResult[]): string[] {
  if (results.length === 0) return ['No recommendations available.'];
  const grouped = groupByProfile(results);
  const profiles = [...grouped.values()].map((runs) => ({
    profile: runs[0]!.profile,
    avgScore: avg(runs.map((run) => run.score)),
    avgDeliveries: avg(runs.map((run) => run.snapshots[run.snapshots.length - 1]!.deliveries)),
  })).sort((a, b) => b.avgScore - a.avgScore);
  const best = profiles[0]!;
  const worst = profiles[profiles.length - 1]!;
  const notes: string[] = [];
  notes.push(`If you are comparing balance branches, treat ${best.profile.id} as the current benchmark to beat on this scenario.`);
  if (best.profile.id !== worst.profile.id) {
    notes.push(`${worst.profile.id} is the branch most likely to need tuning or better route opportunities here.`);
  }

  const modeTotals = new Map<string, number>();
  for (const result of results) {
    for (const route of result.routeRecords) {
      modeTotals.set(route.mode, (modeTotals.get(route.mode) ?? 0) + 1);
    }
  }
  if ((modeTotals.get('air') ?? 0) === 0) notes.push('Air never activated in this suite, so this scenario did not meaningfully validate airport late game.');
  if ((modeTotals.get('sea') ?? 0) === 0) notes.push('Sea never activated in this suite, so maritime balance remains unproven for these settings.');
  if ((modeTotals.get('rail') ?? 0) === 0) notes.push('Rail never activated in this suite, so land-only late-game scaling may still be under-tested.');
  const deadRuns = results.filter((run) => run.snapshots[run.snapshots.length - 1]!.money <= 0 && run.snapshots[run.snapshots.length - 1]!.deliveries < 25).length;
  if (deadRuns > 0) notes.push('Several runs stalled with no cash buffer left, so benchmark averages should be read alongside consistency, not in isolation.');
  return notes;
}

export function formatSuiteReport(results: SimRunResult[]): string {
  const lines: string[] = [];
  lines.push('═'.repeat(76));
  lines.push('TransportSim Benchmark Suite');
  lines.push('═'.repeat(76));

  const sample = results[0];
  if (sample) {
    lines.push(`Scenario: ${sample.state.mapSize} map | ${sample.state.difficulty} difficulty | theme ${sample.state.theme}`);
  }

  lines.push('');
  lines.push('Conclusions:');
  for (const item of summarizeNarrative(results)) lines.push(`  - ${item}`);

  lines.push('');
  lines.push('Recommendations:');
  for (const item of summarizeRecommendations(results)) lines.push(`  - ${item}`);

  lines.push('');
  lines.push('Runs:');
  for (const result of results) {
    const final = result.snapshots[result.snapshots.length - 1]!;
    lines.push(
      `  ${result.profile.id.padEnd(10)} seed ${String(result.seed).padStart(7)}  ` +
      `score ${String(result.score).padStart(4)}  money ${fmtMoney(final.money).padStart(10)}  ` +
      `deliv ${String(final.deliveries).padStart(4)}  tech ${String(final.techUnlocked).padStart(2)}  ${result.verdict}`,
    );
  }

  lines.push('');
  lines.push('Profiles:');
  const firstByProfile = new Map<string, SimProfile>();
  for (const result of results) {
    if (!firstByProfile.has(result.profile.id)) firstByProfile.set(result.profile.id, result.profile);
  }
  for (const [profileId, runs] of groupByProfile(results)) {
    const profile = firstByProfile.get(profileId)!;
    for (const reportLine of summarizeProfile(profile, runs)) lines.push(reportLine);
  }

  lines.push('');
  lines.push('Mode usage:');
  const modeTotals = new Map<string, number>();
  for (const result of results) {
    for (const route of result.routeRecords) {
      modeTotals.set(route.mode, (modeTotals.get(route.mode) ?? 0) + 1);
    }
  }
  for (const [mode, count] of [...modeTotals.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${mode.padEnd(12)} ${count}`);
  }

  lines.push('');
  lines.push('Exclusive branch correlation:');
  for (const reportLine of summarizeExclusiveChoices(results)) lines.push(reportLine);

  lines.push('');
  lines.push('Tech correlation (not causation):');
  for (const reportLine of summarizeTechCorrelations(results)) lines.push(reportLine);

  lines.push('');
  lines.push('Warnings:');
  for (const warning of summarizeWarnings(results)) lines.push(warning);
  return lines.join('\n');
}

export function printSuiteReport(results: SimRunResult[]): void {
  console.log(formatSuiteReport(results));
}
