# Recorded-source walking planner

`createReplayPlanner({ hash, id, now?, evidence? })` implements the shared
`WalkPlanner` interface. It produces a hash-verified canonical WalkBundle for
the complete prepared Bayterek → Nurzhol → Round Square walk, or a bounded
clarification, refusal or dependency error. It is a source-replay implementation:
one real editorial chain, no live generator, hosted service or invented variants.

The ordinary Node entry works after `npm run build:node` from the repository root.
The root private-workspace lock is authoritative; React Native integration is
separate from the Node build. `npm --workspace @astanaai/walk-planner test` runs
the planner regressions with the existing local TypeScript dependency.

## Plan and revise

The planner resolves only the three explicitly selected prepared public anchors,
or an exact manually selected/GPS point on one of them. GPS must be fresh and
accurate. An unproved gap, including a tiny one, returns clarification and never
moves the requested origin. Return-to-start, last-stop and explicit-end rules
retain their exact endpoint. The initial request remains immutable on revision.

Six directed retained-graph paths provide ordered geometry, source provenance,
distance and walking time. No straight connector or shortest-path shortcut is
invented. The complete schedule includes visits and a reserve of
`max(5, ceil(0.1 × remaining budget))`. The 80-minute return walk currently takes
about 62.87 minutes including reserve; spare time is not padded with invented
activities. A hard coffee, indoor or step-free requirement is refused while its
evidence is unknown. Live access, closures and actual street passage are not
proved by the retained graph.

`revise` returns an unapplied proposal tied to the exact parent hash/revision,
with a five-minute proposal expiry. Completed current-parent visits are removed
from the remaining itinerary while their durable progress remains Session-owned.
After all visits it may return a route-only continuation. The selected remaining
window persists as the new active deadline. Extending it requires a matching
explicit deadline proposal and consent. Session must validate again and apply
the proposal using an atomic parent compare-and-swap; this package never applies
it or writes progress.

Narrative chapters separate sourced facts, fictional passages and suggestions.
RU/KK/EN quest questions/options, hints, explanations and six basic cues are
canonical narration entries. Approved editorial content and its fact/source
identity are checked rather than authenticated by a caller-supplied SHA alone.
New revisions do not inherit offline readiness. Until actual audio/map adapters
prepare and verify their durable assets, the complete pack remains partial.

## Evidence and limits

`tools/planner/build_replay_catalog.py --check` reproduces the generated catalog
from pinned prepared content and retained routing evidence. The builder checks
the exact input hashes and paragraph structure; it does not approve translations
or factual entailment automatically. The independent review is recorded in
`docs/delivery/PLANNER-SPEC-REVIEW.md`.

Live RAG/generation, multiple meaningful alternatives, arbitrary-origin routing,
positive indoor adaptation, current weather/hours providers, hosted performance,
mobile preview/consent, durable Session CAS, field passage and physical offline
acceptance remain separate unfinished parts of the full beta plan.
