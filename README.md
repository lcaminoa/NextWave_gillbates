# PHAROS — Payment Incident Intelligence

> **When approval drops, find what changed — with evidence.**

PHAROS is Gill Bates' submission for **NextWave Hackathon 2026, Challenge 2: The Control Tower** (Yuno).

PHAROS is an evidence-first payment incident investigator. It watches a live stream of payment attempts, learns what normal approval behavior looks like, detects sustained conversion degradation, ranks plausible root-cause segments, and produces a human-readable report with cited evidence.

It does **not** reroute payments, change provider configuration, or execute any remediation. It recommends a next action for a human operator to review.

## The problem

Payment conversion can fall for many reasons: a provider degradation, an issuing-bank outage, a payment method failing in one country, or a combination of those dimensions. A dashboard can show that conversion dropped; the operationally difficult part is determining **what changed, where, and why we should believe it**.

PHAROS is designed for the Challenge 2 trial by fire: a judge can inject an unseen incident at runtime and the system must investigate it without the team manually filtering a dashboard.

## What PHAROS demonstrates

- A continuously generated payment stream with merchant, provider, payment method, country, issuing-bank, and decline-code dimensions.
- A statistical baseline per segment, rather than one global fixed approval-rate threshold.
- Sustained anomaly detection that distinguishes a meaningful drop from transient noise.
- Root-cause candidate search over one- and two-dimensional segments.
- Evidence-backed reports: baseline comparisons, counterfactual controls, decline-code patterns, impact estimates, and recorded investigation steps.
- Simultaneous-incident handling and ranking by estimated business impact.
- A safe **inconclusive** outcome when evidence cannot distinguish competing explanations.
- A blind Chaos Lab: an operator injects an unknown incident; ground truth stays sealed from the detector, investigator, and auditor until reveal.
- A human decision gate on every recommendation. No payment traffic is changed by PHAROS.

## Challenge 2 alignment

| Challenge requirement | How PHAROS addresses it |
| --- | --- |
| Live payment monitoring | The FastAPI runtime owns an accelerated PaymentSimulator and publishes transactions through Server-Sent Events (SSE). |
| Detect conversion drops, not normal variance | A Beta-Binomial baseline represents uncertainty by segment; EWMA residual monitoring requires sustained confirmation windows. |
| Diagnose across payment dimensions | The RCA engine ranks one- and two-dimensional candidates across merchant, provider, payment method, country, issuing bank, and decline-code evidence. |
| Explain with visible evidence | Each report carries candidates, cited evidence, investigation steps, impact, and a recommendation for human review. |
| Handle multiple incidents honestly | Episodes are deduplicated, ranked separately, and can publish inconclusive instead of a fabricated root cause. |
| Trial by fire | Chaos Lab supports manual and random-unknown injection. The revealed ground truth is never used by the investigation pipeline. |
| Recommend, never remediate | The product deliberately has no tool or endpoint that changes payment routing or executes the recommended action. |

## Architecture

~~~mermaid
flowchart LR
    A[Payment simulator<br/>Stream A] --> B[Beta-Binomial baseline<br/>EWMA anomaly detection<br/>Stream B]
    B --> C[RCA candidates + cited evidence<br/>Stream B]
    C --> D[Investigator<br/>Stream C]
    D --> E[Validation + Evidence Auditor<br/>fail closed]
    E --> F[Incident report + SSE/REST API]
    F --> G[PHAROS dashboard<br/>Stream D]
    H[Chaos Lab / judge] --> A
~~~

The shared data contract has eight core entities:

~~~text
Transaction
  -> BaselinePoint + Anomaly
  -> IncidentCandidate + Evidence
  -> InvestigationStep + IncidentReport

ChaosSpec flows in the opposite direction: UI/judge -> simulator.
~~~

The exact schemas and frozen API surface live in [contracts/CONTRACTS.md](contracts/CONTRACTS.md).

## Detection and investigation approach

### 1. Learn what is normal

Approval rate is a binomial proportion: a segment with 5 attempts is less certain than one with 500. PHAROS uses a **Beta-Binomial baseline** so low-volume segments naturally receive wider uncertainty bounds instead of being judged by the same fixed threshold as high-volume segments.

### 2. Confirm a sustained deviation

The detector monitors the difference between observed and expected approval using an **EWMA** residual. The live defaults use lambda = 0.3, a negative threshold of -0.05, and three persistence windows. This smooths one-off noise while surfacing a meaningful, sustained conversion drop.

### 3. Search for an explanation, not merely a symptom

When an anomaly appears, the RCA engine considers one- and two-dimensional candidate segments. It scores candidates with confidence, excess-decline coverage, impact, and specificity; it also builds counterfactual controls to test whether the effect is specific to the proposed segment.

Searching beyond two dimensions would fragment traffic into unreliable samples. If a higher-dimensional incident cannot be represented truthfully with enough evidence, PHAROS publishes **inconclusive** rather than pretending that a partial segment is the root cause.

### 4. Publish only defensible claims

The deterministic investigator validates every report. In **audited_openai** mode, an OpenAI-backed investigator uses read-only evidence tools and a separate Evidence Auditor acts as a publication gate. A missing, invalid, timed-out, or unsupported claim fails closed to inconclusive.

## Repository map

~~~text
apps/web/                 Next.js dashboard, investigations, Chaos Lab, Vercel proxy
contracts/                Shared Pydantic and TypeScript contracts; frozen API documentation
engine/api/               FastAPI runtime, SSE broker, incident lifecycle, blind-trial evaluation
engine/detection/         Aggregation, Beta-Binomial baseline, EWMA, mix-shift analysis
engine/rootcause/         Candidate generation, scoring, and counterfactual evidence
engine/investigator/      Deterministic and audited OpenAI investigators; validation and audit
engine/notifications/     Optional, opt-in email and WhatsApp notification outbox
simulator/                Payment stream generator and chaos injector
docs/                     Architecture, UI specification, notifications, handoffs, and runbooks
~~~

## Quick start: run locally

### Prerequisites

- Python 3.10 or newer
- [uv](https://docs.astral.sh/uv/)
- Node.js 20.9+ (Node 22/24 also work)
- pnpm 10. The lockfile is authoritative; do not use npm or Yarn.

### 1. Start the backend and live simulator

From the repository root:

~~~bash
uv sync

# Local-only shared token used by the protected Chaos proxy.
export CONTROL_TOWER_JUDGE_TOKEN=local-demo-token
export CONTROL_TOWER_CORS_ORIGINS=http://localhost:3000

uv run uvicorn engine.main:app --reload --port 8000
~~~

The FastAPI runtime starts and owns the simulator internally. The simulator script is a standalone smoke test, not a second process required for the application.

### 2. Start the dashboard

Open a second terminal:

~~~bash
cd apps/web
cp .env.example .env.local
pnpm install --frozen-lockfile
pnpm dev
~~~

Before starting the dashboard, edit **apps/web/.env.local** for the local Chaos Lab:

~~~dotenv
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_CONTROL_TOWER_API_ORIGIN=http://localhost:8000
CONTROL_TOWER_API_ORIGIN=http://localhost:8000
CONTROL_TOWER_JUDGE_TOKEN=local-demo-token
PHAROS_CHAOS_OPERATOR_USERNAME=operator
PHAROS_CHAOS_OPERATOR_PASSWORD=choose-a-local-demo-password
~~~

Open <http://localhost:3000/control-room>. The runtime should show **STREAM LIVE** after the browser receives transactions.

> **Windows PowerShell:** replace the two export commands with $env:NAME = "value" before starting Uvicorn.

## Demo runbook

1. Open **/control-room** and confirm that the stream is live with no active incident.
2. Open **/chaos** and sign in with the local operator credentials.
3. Select **Random unknown**, set a meaningful severity (for example, -35 pp), and inject the scenario.
4. Wait for several detection windows. PHAROS will create one or more incident workspaces when sustained anomalies are confirmed.
5. Open the newest investigation. Read the status, evidence, counterfactual controls, financial impact, and recorded investigation steps.
6. Return to Chaos Lab and select **Reveal ground truth**.
7. Compare the sealed injected dimensions with the report. Reveal is an operator evaluation step; it never informs the detector, Investigator, or Evidence Auditor.

The configured duration is simulated in the accelerated stream. Do not wait the full nominal duration in wall-clock time.

An inconclusive report is a successful safe behavior when evidence is insufficient or competing candidates cannot be separated. PHAROS asks for human review instead of asserting a false cause.

## API surface

The following routes are frozen and documented in [contracts/CONTRACTS.md](contracts/CONTRACTS.md):

| Method | Route | Purpose |
| --- | --- | --- |
| GET | /api/health | Runtime health |
| GET | /api/stream | Live transaction SSE stream |
| GET | /api/incidents | Incident report queue |
| GET | /api/incidents/:id | Report, candidates, evidence, and investigation steps |
| POST | /api/chaos/inject | Manual ChaosSpec injection |
| POST | /api/chaos/random | Blind random-unknown injection |
| POST | /api/chaos/reveal | Reveal the most recent ChaosSpec |

In a public deployment, Chaos POST requests are proxied through Next.js. The browser never receives the judge token; the proxy adds it server-side and requires operator authentication.

## Investigator modes

| Mode | Use case | Requirements |
| --- | --- | --- |
| deterministic (default) | Reproducible local development and demos without an API call | None |
| audited_openai | OpenAI-backed report writing with an independent audit gate | OPENAI_API_KEY, OPENAI_MODEL; optional OPENAI_AUDITOR_MODEL and timeout |

To use the audited mode, configure its environment variables outside Git and start the backend with:

~~~bash
CONTROL_TOWER_INVESTIGATOR_MODE=audited_openai uv run uvicorn engine.main:app --reload --port 8000
~~~

The audited mode uses read-only evidence retrieval. It cannot execute payment-system changes.

## Tests and quality checks

Run backend tests from the repository root:

~~~bash
uv run pytest
~~~

Run frontend checks from apps/web:

~~~bash
pnpm lint
pnpm build
~~~

Before merging, run the relevant checks and perform the manual flow: healthy stream -> blind Chaos injection -> incident report -> evidence -> reveal.

## Deployment

The production topology separates the public UI from the runtime:

- **Vercel:** Next.js app in apps/web.
- **Railway:** FastAPI runtime, live simulator, detection, RCA, and investigator.

Set configuration in the deployment secret manager, never in Git. Names only:

~~~text
# Vercel public configuration
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_CONTROL_TOWER_API_ORIGIN

# Vercel server-only configuration
CONTROL_TOWER_API_ORIGIN
CONTROL_TOWER_JUDGE_TOKEN
PHAROS_CHAOS_OPERATOR_USERNAME
PHAROS_CHAOS_OPERATOR_PASSWORD

# Railway runtime configuration
CONTROL_TOWER_PUBLIC_MODE
CONTROL_TOWER_JUDGE_TOKEN
CONTROL_TOWER_CORS_ORIGINS
CONTROL_TOWER_INVESTIGATOR_MODE
OPENAI_API_KEY                 # audited_openai only
OPENAI_MODEL                   # audited_openai only
~~~

CONTROL_TOWER_CORS_ORIGINS must list the exact Vercel frontend origin. Never use * for this deployment, and never prefix server-only values with NEXT_PUBLIC_.

Optional operational email and WhatsApp alerts are disabled by default and documented in [docs/NOTIFICATIONS.md](docs/NOTIFICATIONS.md). They only notify on eligible, evidence-backed reports; they never modify payments.

## Important product boundaries

- PHAROS uses synthetic payment data for the hackathon demo.
- The system estimates **revenue at risk**, not money that is already proven irrecoverable. Some customers may retry successfully.
- A recommendation is not an automated action. The operator remains responsible for approving any external change.
- Declaring uncertainty is intentional. A report without enough evidence must remain inconclusive.

## Team

| Stream | Owner | Scope |
| --- | --- | --- |
| A — Simulation + data | Francisco Krinisky (panchokrinisky) | simulator/ |
| B — Detection + RCA | Lautaro Caminoa (lcaminoa) | engine/detection, engine/rootcause |
| C — Investigator | Valentín Coqui (vcoqui) | engine/investigator |
| D — Product + demo | Franco Krinisky (francokir) | apps/web |

## Further reading

- [NEXTWAVE_CH2_CONTROL_TOWER_MASTER_PLAN.md](NEXTWAVE_CH2_CONTROL_TOWER_MASTER_PLAN.md) — product research and design rationale
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — concise system map
- [contracts/CONTRACTS.md](contracts/CONTRACTS.md) — shared models and frozen endpoints
- [DECISIONS.md](DECISIONS.md) — detailed technical decision record
- [DECISION_LOG.md](DECISION_LOG.md) — exported Flight Log for the challenge
- [docs/NOTIFICATIONS.md](docs/NOTIFICATIONS.md) — optional notification-channel setup

---

Built by **Gill Bates** for NextWave Hackathon 2026 · Yuno × Nauta · supported by OpenAI.
