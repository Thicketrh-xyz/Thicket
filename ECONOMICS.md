# Economics — what work actually costs

Measured 2026-08-26 on one machine (Apple Silicon, Ollama, `llama3.2:1b` + `llava:7b`),
warm — model-load time excluded. Raw numbers below are reproducible with the scripts
described at the end.

The handoff said to measure before setting a rate. These are those numbers, and they
say more than expected: two of the four findings are bugs in what buyers are charged
*today*, independent of any reward redesign.

## The question this was meant to answer

Buyers are charged by work done. Operators earn a flat **1 THKT/min** regardless of what
they do. How far apart are those?

**Far.** A 12-item sentiment batch, end to end through a real coordinator and node:

| | |
|---|---|
| Items | 12 |
| Wall clock | 14.2 s (50.7 items/min) |
| Buyer paid | **62.39 THKT** |
| Operator earned | **0.237 THKT** (1 THKT/min × 0.237 min) |
| An **idle** node over the same 14.2 s earned | **0.237 THKT** — identical |

The operator that ground out twelve real inferences earned exactly what a node asleep on
the same network earned. There is no marginal reward for doing work at all.

## Finding 1 — large documents are silently truncated

**This is a correctness bug, and buyers are being overcharged for work that is not done.**

`llama3.2:1b` supports a 131,072-token context. Ollama's *default* `num_ctx` is 2048, and
the node never sets it. Measured on a 48,000-character document:

| `num_ctx` | input tokens actually read | of 13,299 |
|---|---|---|
| default | 2,050 | **15%** |
| 8192 | 4,098 | 31% |
| 32768 | 13,299 | 100% |

At the default, **85% of the buyer's document is discarded silently.** No error, no
warning. The buyer pays `5 + 48 × 2 = 101.08 THKT` for a summary of roughly the first
8,000 characters, presented as a summary of the whole thing.

Doing the job properly is genuinely more expensive — 8.29 s → 24.56 s at `num_ctx=32768`,
about 3× — which is precisely why it has to be priced deliberately rather than discovered
by accident.

## Finding 2 — per-megapixel pricing measures nothing

`quote_job` charges 6 THKT per megapixel, on the stated reasoning that "vision models turn
an image into tokens in proportion to its resolution." That is true of some architectures
(tiled encoders like GPT-4V, Qwen2-VL). It is **false for llava**, which is what the
network actually runs — llava resizes every image to a fixed 336×336 grid.

| Image | Megapixels | Input tokens | Compute | Price |
|---|---|---|---|---|
| 128×128 | 0.02 | 589 | ~6 s | 9.12 THKT |
| 512×512 | 0.26 | 589 | 6.32 s | 10.56 THKT |
| 1024×1024 | 1.05 | 589 | 5.96 s | 15.30 THKT |
| 2048×2048 | 4.19 | 589 | 5.77 s | 34.14 THKT |
| 3072×3072 | 9.44 | 589 | ~6 s | 65.60 THKT |

A **472× range in pixels produces identical compute** and a **7.2× range in price**. The
per-megapixel term is charging buyers for a cost that does not exist.

## Finding 3 — price tracks input size; cost tracks output tokens

Time is dominated by *decode* (generating tokens), not *prefill* (reading them). Measured
throughput: **~95 tokens/s decode** vs **~1,870 tokens/s prefill** — prefill is roughly
20× cheaper per token. Pricing keys entirely on input size, so it prices the cheap half.

| Job | Input chars | Compute | Price | THKT per node-second |
|---|---|---|---|---|
| tiny-output | 31 | 0.06 s | 5.06 | **92.0** |
| doc-200c | 242 | 0.41 s | 5.48 | 13.5 |
| doc-1000c | 1,042 | 0.66 s | 7.08 | 10.8 |
| doc-4000c | 4,042 | 1.56 s | 13.08 | 8.4 |
| doc-16000c | 16,042 | 7.36 s | 37.08 | 5.0 |
| doc-48000c | 48,042 | 5.27 s | 101.08 | 19.2 ⚠ |
| long-output | 51 | 7.08 s | 5.10 | **0.7** |
| vision 512² | — | 6.32 s | 10.56 | 1.7 |
| vision 2048² | — | 5.77 s | 34.14 | 5.9 |

**Spread: 128×** between the cheapest and dearest work per second of real compute.

A one-line prompt that asks for a 500-word essay (`long-output`) costs the node 7.08 s and
earns the network 5.10 THKT. A one-line prompt answered in one word costs 0.06 s and earns
5.06 THKT. Nearly the same price for 118× the work.

⚠ `doc-48000c` looks anomalously profitable only *because* of Finding 1 — it is charged for
48,000 characters while computing 2,050 tokens. Fix the truncation and this row's compute
roughly triples, moving it toward the bottom of the table.

## What this implies for the rate

The unit of work is not minutes, and it is not input characters. It is **tokens, weighted
by kind** — with output tokens costing roughly 20× input tokens on this hardware. That is
the same shape commercial APIs price on, arrived at independently from the measurement.

For **pricing**, the honest formula is `base + a·prompt_tokens + b·completion_tokens`
with `b ≈ 20a`. This requires quoting a *maximum* output length up front, since completion
length isn't knowable before the work runs — either cap it and price the cap, or quote a
range and settle on actuals.

For **rewards**, pay for the same thing that is charged for.

## Rewards: built

`reward = contribution_minutes × REWARD_PER_MINUTE + work_thkt`, settled together each
epoch. `work_thkt` is a share of what the buyer actually paid for the jobs that node
completed: `OPERATOR_REVENUE_SHARE`, default **0.7**.

**Revenue share rather than a per-work-unit rate.** The pool is finite — 350M, transferred
and never minted — so an independent rate is an unbounded claim on it: emission would scale
with demand, and nothing caps it. `RewardsDistributor` exposes `poolBalance()` but nothing
ties published roots to it, so the failure mode is claims silently reverting on-chain. Paying
out of money that actually came in makes the pool a subsidy buffer instead of the source.

**Work is derived at the coordinator, never self-reported.** Ollama returns exact token
counts, and the obvious design is to have the node send them up. That is a lie-to-earn
vector — the node would be reporting the number it gets paid for. The coordinator already
holds the prompt and receives the result, and prices the job server-side, so it needs
nothing from the node it would have to trust.

**Quorum jobs split one share.** The buyer paid once; `QUORUM_SPLIT_REWARD` (default on)
divides the operator share between the nodes that agreed rather than paying each in full.
Paying k nodes in full for one payment drains the pool by construction. Nodes are never
told which jobs are cross-checked, so there is nothing to dodge. An inconclusive quorum
pays everyone who answered — nobody was shown to be wrong.

**A strike voids work earnings too.** `void_and_strike` zeroes `work_thkt` alongside
`contribution_minutes`; leaving work behind would make a strike nearly costless for a busy
node.

### The uptime rate still needs lowering — deliberately

`REWARD_PER_MINUTE` is **unchanged at 1.0**, so nobody earning today is suddenly worse off.
But at 1 THKT/min an idle node earns 60 THKT/hour while a typical job pays about 3.5, so
uptime still dwarfs work and a node would need ~17 jobs/hour just to match idling.

Uptime has to stay non-zero — a node must be worth running before any work exists, or an
idle network is worthless to join. But it should be a **subsidy, not the main income**.
Around `0.05` THKT/min (3/hour) makes a single job worth more than an hour of idling. That
is an economic decision, not a code one, and it is one env var.

## Findings 1 and 2 are fixed

Both were live defects affecting buyers, and neither depended on the reward redesign.

**Truncation.** Nodes now size the context window to the input
(`runtime.py::_fit_context`): a power-of-two ladder from 2048 up to `THICKET_MAX_CTX`
(32,768 by default), with room reserved for the answer. The ceiling is an operator's
memory limit, not a model limit, so it stays configurable.

Verified on the same 48,000-character document: **2,050 → 13,299 input tokens**, the whole
thing read, at the predicted cost (9.2 s → 24.0 s).

Beyond that ceiling the coordinator now **refuses the job before taking payment**
(`check_size`, HTTP 413, default limit 95,000 characters — roughly 32k tokens). Accepting
money for a document we would bin most of was the failure worth closing; `/compute/quote`
reports `too_large` instead of raising, so a UI can warn while someone is still typing.

**Per-megapixel pricing.** `COMPUTE_PER_MP_THKT` now defaults to **0**. Measured, a
0.02 MP and a 9.44 MP image both cost 589 input tokens and the same wall time, and both
now quote **9.02 THKT** (previously 9.12 vs 65.60). The knob survives because it *is* the
right model for a tiling encoder — set it if the network ever runs one.

Keep `COMPUTE_MAX_CHARS` on the coordinator in step with `THICKET_MAX_CTX` on the nodes:
the coordinator promises what the nodes can deliver, and nothing enforces that across the
two processes.

## Reproducing

Scripts used: direct Ollama calls with the node's own options (`temperature: 0`,
`top_p: 1`, fixed seed), capturing `prompt_eval_count`, `eval_count`,
`prompt_eval_duration` and `eval_duration`; plus a 12-item batch through a local DRY
coordinator and a real node client. Numbers are single-run on one machine and warm —
treat them as ratios, not absolutes. Other hardware will move every figure, but the
*shapes* (decode-dominated, resolution-independent, truncation at default `num_ctx`)
are properties of the models and Ollama, not of this laptop.
