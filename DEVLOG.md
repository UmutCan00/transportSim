# TransportSim — Development Guide

A runbook for AI-assisted and human development of this browser transport-logistics game.

---

## Quick Start

```bash
nvm use 22
npm run dev          # localhost:5173 — hot-reload dev server
npm run sim          # headless AI sim, 3 000 ticks, seed 42
npm run sim:long     # headless AI sim, 10 000 ticks, seed 42
npm run sim -- --seed 7 --ticks 5000 --verbose
```

TypeScript check (no emit):
```bash
npx tsc --noEmit
```

---

## Architecture at a glance

```
src/
  constants.ts        — all magic numbers (costs, capacities, tick rates)
  core/               — pure simulation, zero DOM
    types.ts          — all interfaces & enums (single source of truth)
    GameState.ts      — factory + generateId()
    GameLoop.ts       — simulationTick() — wires everything together
    RouteExecution.ts — vehicle route state machine (load → move → unload → repeat)
    Industry.ts       — production & consumption ticks
    Economy.ts        — money helpers (canAfford, spend, earn)
    Building.ts       — station/depot creation, autoLinkStation
    Route.ts          — createRoute()
    Vehicle.ts        — createVehicle()
    MapGen.ts         — seeded procedural map, forces all industries on one land mass
    Pathfinding.ts    — BFS road pathfinder
    TechTree.ts       — tech definitions + canUnlock / prereqsMet / unlockTech
    Objectives.ts     — 12 objectives with reward payouts
    Save.ts           — JSON save/load stubs
  render/             — Canvas 2D drawing, reads state, never writes
  input/
    InputHandler.ts   — mouse/keyboard → uiState mutations + executeToolAction()
    ToolActions.ts    — per-tool logic (build road, place station/depot, select)
    Tools.ts          — ToolType enum
  ui/
    UIManager.ts      — DOM panels (HUD, toolbar, depot, tech, objectives, toasts)
  Game.ts             — orchestrator: owns GameState + UIManager + Renderer + InputHandler
  main.ts             — entry point

scripts/
  sim.ts              — headless AI runner (no DOM, no canvas)
```

---

## How the simulation tick works

```
GameLoop.simulationTick(state)
  1. tickIndustries(industries, tick)   — produce raw goods, drain consumers
  2. tickVehicleMovement(vehicles)      — advance position along path
  3. tickRoutes(state)                  — vehicle FSM: idle→load→move→unload→idle
```

`RouteExecution.tickRoutes` is the heart of gameplay. Each vehicle follows its
assigned `Route` (list of `RouteOrder`s — load from station A, unload at station B).
The station buffers are the coupling point between industries and vehicles.

---

## Key data flows

```
Industry produces → Station buffer
(vehicle loads from station buffer)
Vehicle loads → travels road path → unloads at destination station
(destination station drains into linked industry's stock)
Industry consumes → earn money → check objectives
```

---

## Adding a new feature — checklist

1. **New industry type**: Add to `IndustryType` enum in `types.ts`, add constants in
   `constants.ts`, add `case` in `Industry.ts` `createIndustry()` and `tickIndustries()`,
   add a spawn call in `MapGen.ts`, add a color/label in `Industry.ts` `industryLabel()`.

2. **New cargo type**: Add to `CargoType` enum, add reward in `DELIVERY_REWARDS` in
   `constants.ts`, add producing/consuming industry pairing.

3. **New tech**: Add `TechId` entry, add node in `createTechTree()`, add effect in the
   relevant multiplier function in `TechTree.ts`.

4. **New objective**: Add an entry in `createObjectives()` in `Objectives.ts`, add a
   case in `getObjectiveProgress()` in `UIManager.ts` if the `type` is new.

5. **New UI panel**: Add a case to the `activePanel` union type in `types.ts` (UIState),
   add a toggle button in `UIManager.buildDOM()`, add rendering in `UIManager.update()`.

---

## The headless feedback loop

`scripts/sim.ts` contains a full AI player that runs the simulation headlessly.
Use it to verify balance after any change to economy constants or industry parameters.

### What the AI does
- Discovers all production chains (raw → processor → final consumer)
- BFS road-builds from each industry to its chain neighbors
- Places stations adjacent to each industry
- Places a depot and buys trucks
- Assigns one truck per chain, load at raw supplier → deliver to consumer
- Unlocks techs when affordable

### Balance verdicts
```
✓ BALANCE LOOKS REASONABLE   — first delivery ≤ 400 ticks, revenue ≥ $100k by tick 3000
✗ TOO SLOW                   — first delivery took too long
✗ TOO LITTLE REVENUE         — economy didn't grow, likely routing bug or map issue
```

### When to run it
- After changing any constant in `constants.ts`
- After modifying `RouteExecution.ts` or `Industry.ts`
- After adding a new industry type or objective
- Before committing a significant feature

### Multi-seed sweep
```bash
for s in 1 7 12 42 99 123 777; do
  npm run sim -- --seed $s --ticks 4000 2>&1 | tail -3
done
```
All seeds should show `BALANCE LOOKS REASONABLE`.

---

## Known balance parameters (validated across 7 seeds, tick 10 000)

| Metric                     | Target range      |
|----------------------------|-------------------|
| First delivery             | 50–400 ticks      |
| Revenue at tick 3 000      | $100k – $500k     |
| Revenue at tick 10 000     | $800k – $2M       |
| Objectives by tick 4 000   | 8–10 / 12         |
| All objectives complete    | by tick 10 000    |

---

## Common pitfalls

| Symptom | Likely cause |
|---|---|
| 0 deliveries, trucks idle | Route not in `state.routes` — check `vehicle.routeId` doesn't use the old fake `fromId * 10_000 + toId` pattern; use `createRoute()` |
| Trucks never find path | Industry on a water-isolated island; check `buildMainLandSet()` in MapGen |
| Station buffers full, trucks idle | Production outpaces consumption — add more consumer industries or raise drain rate in `Industry.ts` |
| Tech buttons unresponsive | `renderTechPanel` called every frame replaces DOM mid-click — use `_lastTechHash` dirty check |
| Depot panel empty | `uiState.selectedEntityId` not set before opening panel — always set it from the building reference, not assumed from prior selection |

---

## UIState panel lifecycle

`uiState.activePanel` drives which panel is shown:
- `'none'` — panel hidden
- `'tech'` — tech tree (toggle with T key or button)
- `'objectives'` — goal list (toggle with O key or button)
- `'depot'` — depot management (opens automatically when clicking a depot with Select tool)

Closing: `Escape` key or ✕ button. Clicking a non-depot entity with Select tool
auto-closes the depot panel.

---

## File edit safety

- `src/core/types.ts` — changing an interface cascades everywhere; run `npx tsc --noEmit` after
- `src/core/RouteExecution.ts` — changes here affect live sim AND headless sim
- `scripts/sim.ts` — AI-only code, does not affect the browser game
- `src/render/` — read-only view layer; bugs here don't corrupt state
- `src/constants.ts` — changing costs here requires re-running the headless sim to validate balance

---

## Session workflow (AI-assisted)

1. **Identify** the problem (user report or simulation output)
2. **Reproduce** with `npm run sim` or by reading the relevant core file
3. **Fix** the minimal change needed
4. **Validate** — `npx tsc --noEmit` + `npm run sim`
5. **Commit** a concise description of what changed and why

When the AI writes a fix, it should always:
- Read the file before editing (avoid guessing structure)
- Run `npx tsc --noEmit` after editing to catch type errors
- Run `npm run sim -- --seed 42` if any economy/routing logic changed
