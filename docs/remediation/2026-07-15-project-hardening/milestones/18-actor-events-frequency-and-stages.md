# Milestone 18: Actor Events, Frequency and Stages

## Goal

Extend `行为机制` with explicit events, conditions, frequency limits and persistent stage changes. Core output must remain usable when event detection itself requires GM confirmation.

## Scope

- [x] Events: turn start/end, damage, hit/miss, save success/failure, first threshold crossing, enter/leave area.
- [x] Conditions: damage type/threshold, bloodied, environment, resource amount and current stage.
- [x] Frequencies: once per turn, once per round, once per encounter and first occurrence.
- [x] Changes: suppress/restore, resistance changes, AC/speed changes, resource operations, activity forwarding and permanent stages.
- [x] Half-HP activity variants must share source semantics and use explicit HP gates.
- [x] First-threshold stages must carry persistent state so oscillating HP cannot retrigger them.
- [x] Native first, visible GM operation second, structured `gm-assisted` for dynamic/cross-Actor/environment listeners third.

## Acceptance

- Invalid stages, duplicate events, impossible transitions and unsupported claims fail closed.
- Runtime exercises temporary suppression/restoration, a first-only bloodied stage and AC/speed changes.
- No GM-assisted clause is reported as automatic.

## Closure evidence

2026-07-31: All declared events, conditions, frequencies and stage mutations are preserved in behavior flags and visible operation cards. The local v14 run applied and removed a temporary Seadragon suppression marker, applied Tainted AC tiers, and applied Moldering Behemoth's persistent first-bloodied state with AC `14→12` and walk `30→40`. Swarm speed-halving was deliberately changed from an incomplete walk-only Effect to an explicit GM-assisted all-movement instruction. No core Actor claims automatic event listening.
