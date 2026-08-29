# NextWave Hackathon 2026 — Challenge 2: **The Control Tower**
## Gill Bates — Market Research + Winning Product Plan

> **Status:** chosen challenge  
> **Goal:** do not build “a dashboard with GPT.” Build an **autonomous, evidence-backed payment incident investigator** that survives the judges’ blind trial.  
> **Constraint from the official brief:** diagnose and recommend; **do not remediate automatically**.

---

# 0. Executive recommendation

The strongest direction is:

## **Control Tower → Autonomous Payment Incident Investigator**

A system that continuously watches a synthetic live payment stream, learns what “normal” looks like, detects meaningful conversion degradation, and then **launches an autonomous investigation**.

It should:

1. detect the incident without static hard-coded thresholds;
2. separate real degradation from seasonality, low volume and random noise;
3. identify the smallest affected segment across:
   - merchant
   - provider
   - payment method
   - country
   - issuing bank
   - decline code
4. separate multiple simultaneous incidents;
5. estimate revenue lost per minute/hour;
6. compare affected traffic against control cohorts / alternative providers;
7. generate ranked hypotheses with explicit evidence and confidence;
8. say **“inconclusive”** when the evidence is insufficient;
9. retrieve similar historical incidents;
10. recommend the next human action;
11. show the whole investigation live in a visually memorable interface;
12. pass a **blind chaos test** where the judge injects a pattern the investigator never sees in advance.

The product should feel less like **“payment analytics”** and more like:

> **Datadog Bits / an AI SRE, but purpose-built for payment conversion incidents and powered by Yuno’s cross-provider visibility.**

That positioning is both ambitious and directly aligned with the brief.

---

# 1. What the challenge actually requires

Source: **NextWave Hackathon 2026 — Challenges MASTER (EN), Challenge 2: The Control Tower**.

The system must:

- monitor a live transaction stream;
- detect conversion drops that matter;
- distinguish incidents from time-of-day effects, weekends / seasonality and statistical variance;
- diagnose across merchant × provider × method × country × issuing bank × decline code;
- explain what dropped, since when, who is affected, money impact and why the system believes the diagnosis;
- prioritize multiple simultaneous incidents;
- admit uncertainty when evidence is insufficient;
- recommend an action, but **not execute remediation**;
- survive a judge injecting an unseen incident live.

Bonus:
- remember repeated incidents;
- separate operations detail from executive summary;
- abstain instead of hallucinating.

### Implication

The hard part is **not the dashboard** and not even anomaly detection alone.

The core technical problem is:

> **Can we infer the smallest defensible explanation for an aggregate conversion change, in real time, without being fooled by noise, low volume, traffic-mix changes, or coincidental correlations?**

---

# 2. The market today

This challenge is not hypothetical. A real category already exists: **payment observability / payments intelligence**.

That is useful because we can copy proven patterns — and also see where a hackathon project would look boring if we merely reproduce them.

---

# 3. Yuno — what matters specifically for this challenge

## 3.1 Yuno is not just another PSP

Yuno is a **payment orchestration platform**.

A merchant integrates once and Yuno sits above many providers / methods. This means Yuno can see patterns that an individual PSP cannot see.

That cross-provider vantage point is the most important strategic fact for Challenge 2.

Official Yuno site:  
https://www.y.uno/

Yuno currently positions itself as an AI-native payments operating system, with specialized agents across authorization, routing, fraud, recovery, reconciliation, payouts and more.

## 3.2 Yuno already has “Monitors”

This is critical.

Yuno already markets **Monitors**, a product for real-time anomaly detection, alerts and automated routing.

Official page:  
https://www.y.uno/es/product/monitors

Published capabilities include:
- real-time anomaly detection;
- customized alerts;
- automated response / rerouting;
- monitoring provider authorization performance.

### Consequence for us

If we build:

> approval-rate chart + threshold alert

we have built a weaker version of a Yuno product that already exists.

**Do not compete with Monitors at its own basic feature set.**

Our system needs to start where Monitors ends:

> **“An anomaly was detected. Now autonomously investigate exactly what happened and produce a defensible root-cause diagnosis.”**

## 3.3 Yuno itself says dashboards are not enough

Yuno’s May 2026 article “Payment Analytics That Actually Drive Decisions (Not Just Dashboards)” explicitly contrasts passive reporting with analytics that explains **why** something happened and what to do next.

Source:  
https://y.uno/es/blog/payment-analytics-that-actually-drive-decisions-not-just-dashboards

Important lessons:
- reactive dashboards are too slow;
- multi-provider visibility is crucial;
- approval-rate analysis should go down to issuer / decline-code level;
- payment teams need decision-oriented analytics;
- Yuno’s Payment Concierge can already answer payment questions in natural language.

### Consequence

Again: **“GPT summary of a dashboard” is not novel enough.**

The opportunity is an investigator that *actively chooses what evidence to inspect*.

## 3.4 The most relevant Yuno insight: issuer–acquirer pairing

On August 4, 2026, Yuno published specifically about **issuer–acquirer pairing mismatches**.

Source:  
https://www.y.uno/en/blog/issuer-acquirer-pairing-mismatches-the-root-cause-of-authorization-failures-that-no-single-provi

The important idea:

A single provider sees only its own rails.

Yuno can compare the same issuer / market / payment type across different providers, which enables diagnoses such as:

> “Itaú is not globally degraded. Itaú cards are degraded only when routed through Provider A.”

This is exactly the kind of RCA that Challenge 2 rewards.

### This should influence our product

Our root-cause engine should deliberately exploit **control groups across providers**.

Not just:

> “Provider A is down.”

But:

> “Provider A × Itaú × Visa Brazil is anomalous; Provider B × Itaú × Visa Brazil remains normal.”

That is much stronger evidence.

---

# 4. Competitor landscape

## 4.1 Primer — Observability + Monitors

Sources:
- https://www.primer.io/manage/observability
- https://www.primer.io/manage/monitors

Primer already provides:
- unified payment visibility;
- hundreds of data points per payment;
- granular filtering;
- real-time monitoring;
- dynamic anomaly detection;
- models that learn seasonality and normal patterns;
- alerts around authorization-rate degradation;
- experimentation / A-B analysis.

### Copy
- **seasonality-aware baselines**
- monitoring at granular segment level
- unified payment view
- clean payment-operations UX
- business impact framing

### Avoid
Do not make the operator manually:

> alert → open dashboard → click country → click PSP → click issuer → click code.

The AI should do that investigation automatically.

---

## 4.2 IXOPAY — the closest direct competitor

Sources:
- https://www.ixopay.com/products/payments-intelligence/anomaly-detection
- https://documentation.ixopay.com/modules/docs/payments-intelligence/observability/anomaly-detection
- https://www.ixopay.com/blog/ai-payments-expert-ixopay-ixonav

IXOPAY is probably the most important competitor to study because it already has:
- ML anomaly detection;
- predicted baselines;
- confidence intervals;
- analysis across 50+ dimensions;
- anomaly explorer;
- financial impact;
- AI Copilot / IXONav;
- root-cause analysis;
- recommendations;
- forecasting.

### Copy
**Predicted baseline + confidence band** is a great visualization.

Example:

```text
expected approval: 89–92%
actual:            67%
```

Also copy:
- financial impact;
- dimension drill-down;
- confidence;
- AI + deterministic analytics separation.

### Avoid / opportunity

If we merely build “IXOPAY in 24h,” we lose novelty.

Our differentiator should be:

> **not an AI copilot you click after seeing an anomaly — an autonomous investigator that initiates an investigation, constructs hypotheses, gathers evidence, rules alternatives out and publishes an auditable diagnosis.**

---

## 4.3 Juspay — strongest observability architecture lessons

Source:  
https://juspay.io/blog/what-is-payment-observability-solving-silent-failures-for-multi-psp-merchants

This is one of the most useful sources for architecture.

### Preserve both raw and canonical provider evidence

Providers use different error taxonomies.

Keep:

```text
raw_provider_code
raw_provider_message
```

and separately:

```text
canonical_decline_reason
```

Never throw raw evidence away.

### Pending / unknown are real states

A timeout is not necessarily a failed payment.

For our synthetic challenge we can keep the scope primarily to authorization, but the schema should not imply that every non-approved result is identical.

### Good alerts require more than a threshold

Juspay highlights:
- meaningful rate change;
- minimum volume;
- persistence window;
- affected segment;
- business impact.

This is exactly how we avoid alert fatigue.

### Look for the first divergence

A strong investigation compares an affected flow with a normal counterpart and asks:

> **Where did they first begin to behave differently?**

### Copy
- raw + canonical evidence
- minimum-volume filters
- persistence
- traceability
- evidence-driven next step

### Avoid
Do not let the LLM infer payment semantics directly from messy provider text every time.

Normalize first.

---

## 4.4 Spreedly

Sources:
- https://developer.spreedly.com/docs/ai-analytics
- https://www.spreedly.com/products/optimize

Features include:
- interactive payment analytics;
- drill-down by gateway, card brand, region, currency;
- AI highlights;
- trend and anomaly detection;
- root-cause exploration;
- smart routing / optimization in its broader product.

### Copy
- highly interactive drill-down;
- good visual transition from high-level signal to low-level evidence.

### Avoid
“AI Highlights” should not be the hero.

Our hero is autonomous investigation.

---

## 4.5 Gr4vy

Sources:
- https://docs.gr4vy.com/guides/dashboard/monitoring-and-alerting/overview
- https://gr4vy.com/analytics/dashboard/

Gr4vy provides:
- consolidated analytics;
- monitors;
- custom thresholds;
- alerts;
- filters;
- real-time transaction data.

### Copy
- simplicity;
- fast operator visibility.

### Avoid
Static/custom threshold configuration as the primary detection engine.

The brief explicitly wants noise/seasonality awareness.

---

## 4.6 Datadog Bits AI — inspiration from outside payments

This is arguably the most important **product inspiration**, despite not being a payment product.

Sources:
- https://docs.datadoghq.com/bits_ai/bits_investigation/
- https://www.datadoghq.com/blog/building-bits-ai-sre/
- https://www.datadoghq.com/blog/engineering/bits-ai-eval-platform/

Datadog’s Bits Investigation:
- begins investigations automatically;
- forms hypotheses;
- queries telemetry;
- validates / rejects hypotheses;
- iteratively updates its investigation;
- ends with an evidence-backed root cause;
- explicitly marks an investigation inconclusive if evidence is insufficient;
- is evaluated on real incident scenarios.

### Copy almost directly as a product philosophy

Replace:

```text
logs / traces / services / deploys
```

with:

```text
merchants / PSPs / methods / countries / issuers / decline codes
```

This gives us:

> **AI SRE for payment conversion.**

That is much more ambitious than “payment analytics”.

---

## 4.7 Rootly AI SRE — evidence + confidence

Source:  
https://rootly.com/ai-sre

Useful patterns:
- likely root cause with confidence;
- evidence chain;
- similar historical incidents;
- explicit suggested next steps;
- human remains in control.

### Copy
A diagnosis should be **proof-carrying**:

> every claim links to data.

---

# 5. Nauta — why it still matters even though this is a Yuno challenge

Challenge 2 is hosted by Yuno, so we should not build a logistics product.

But Nauta’s product philosophy is relevant to how NextWave thinks about AI.

Sources:
- https://www.getnauta.com/
- https://www.getnauta.com/latam
- https://ai-workforce.getnauta.com/

Nauta’s central thesis is:

> dashboards show problems; agents should understand operational context and do the work.

Its “operational brain” unifies data and memory so agents have enough context to act.

Nauta also has agents such as:
- Shipment Watch
- Root Cause
- Freight Anomaly
- Supplier Reliability

### Lesson to steal

For Challenge 2:

> **The Control Tower should not be another screen that asks the human to investigate. It should do the investigative work and deliver the one decision that matters.**

Because the challenge explicitly forbids automated remediation:

> **Agent investigates. Human decides.**

That is a perfect adaptation of Nauta’s philosophy.

---

# 6. Market gap we should exploit

Existing products already offer most of these individually:
- dashboards;
- anomaly detection;
- seasonal baselines;
- filters;
- alerts;
- AI summaries;
- financial impact;
- manual RCA;
- some AI-assisted RCA.

So our differentiation cannot be any single one.

## The gap

### **Autonomous, auditable, cross-provider incident investigation**

The full loop:

```text
LIVE PAYMENT STREAM
        ↓
EXPECTED BEHAVIOR MODEL
        ↓
ANOMALY
        ↓
AUTONOMOUS INVESTIGATION STARTS
        ↓
GENERATE HYPOTHESES
        ↓
QUERY / COMPARE SEGMENTS
        ↓
RULE OUT ALTERNATIVES
        ↓
SEPARATE SIMULTANEOUS INCIDENTS
        ↓
QUANTIFY LOST REVENUE
        ↓
SEARCH INCIDENT MEMORY
        ↓
EVIDENCE-BACKED DIAGNOSIS
        ↓
CONFIDENCE / ABSTENTION
        ↓
RECOMMENDED HUMAN ACTION
```

---

# 7. The product concept

## **Control Tower — Autonomous Payment Incident Investigator**

Possible one-line pitch:

> **“Control Tower is an AI payment SRE that detects conversion incidents, investigates them autonomously across every payment dimension, and produces an evidence-backed root cause before the merchant notices.”**

Alternative:

> **“From ‘conversion is down’ to ‘Provider B × Itaú × Visa Brazil has degraded since 14:03, costing $12.4k/hour’ — automatically.”**

---

# 8. The “wow” demo we should design first

The demo should not start with a chatbot.

## Scene 1 — Everything is normal

Huge live payment stream.

```text
LIVE
12,431 tx/min

Approval
91.4%

Expected
90.8–92.1%

Revenue at risk
$0/min

Active incidents
0
```

No alert despite realistic noise.

## Scene 2 — judge injects chaos

Separate route / second browser / phone:

### **Chaos Console**

The judge can choose:
- random incident;
- arbitrary combination of dimensions;
- drop severity;
- duration;
- optionally simultaneous incidents.

Example hidden truth:

```text
Country: Brazil
Provider: NovaPay
Method: Card
Issuer: Itaú
Decline code: 05
Approval drop: -31pp
```

**Important:** the investigator must never receive this ground truth.

Only the transaction generator sees it.

## Scene 3 — detection

Within seconds:

```text
INCIDENT DETECTED

Approval delta     -14.8pp
Affected volume     1,842 tx/min
Revenue leak        $187/min
Confidence          99.2%
```

Then the investigation starts automatically.

## Scene 4 — show the AI investigating

Do NOT show hidden chain-of-thought.

Show **observable investigative actions + evidence**:

```text
12:14:03  Anomaly confirmed vs seasonal baseline
12:14:04  Country scan → Brazil explains 83% of lost approvals
12:14:05  Provider comparison → NovaPay isolated
12:14:06  Method comparison → Cards isolated
12:14:07  Issuer controls → Itaú × NovaPay abnormal
12:14:08  Decline mix → code 05 increased 6.4×
12:14:09  Alternative PSP control remains healthy
12:14:10  Diagnosis confidence upgraded to HIGH
```

This is visually much more exciting than a graph.

## Scene 5 — evidence-backed root cause

```text
LIKELY ROOT CAUSE                         HIGH CONFIDENCE

NovaPay × Itaú × Cards in Brazil

Since 12:14:02
Approval rate: 91.1% → 58.7%   (-32.4pp)
Affected volume: 1,842 tx/min
Estimated revenue loss: $11,220/hour

Why we believe this:
✓ Other Brazilian issuers remain normal
✓ Itaú through alternate provider remains normal
✓ Decline code 05 increased 6.4×
✓ Pattern persisted across 4 evaluation windows

Ruled out:
✗ Brazil-wide issuer outage
✗ Global NovaPay outage
✗ Merchant traffic-mix shift
```

The “ruled out” section is important.

## Scene 6 — recommendation

Challenge says diagnose, do not remediate.

```text
RECOMMENDED HUMAN ACTION

Temporarily route Itaú-issued card traffic in Brazil away
from NovaPay and contact NovaPay with the attached evidence.

Do not reroute other Brazilian traffic: no degradation detected.
```

No action executed.

## Scene 7 — reveal ground truth

Judge clicks:

### **Reveal injected incident**

```text
Injected:
NovaPay × Itaú × Cards × Brazil
-31pp

Detected:
NovaPay × Itaú × Cards × Brazil
-32.4pp

ROOT CAUSE MATCH: 100%
Detection latency: 8.1s
```

This is an extremely strong hackathon moment.

---

# 9. Technical differentiators

## 9.1 Payment-native statistical baseline

Avoid generic “AI anomaly detection” hand-waving.

Approval is naturally a **binomial outcome**:

```text
approved / attempted
```

A defensible model is a **Beta-Binomial / empirical Bayesian baseline**.

For each segment and seasonal bucket:
- estimate expected approval probability;
- keep uncertainty;
- sparse segments naturally have wider intervals;
- high-volume segments have tighter confidence.

Why this is good:
- interpretable;
- payment-native;
- handles low volume;
- easy to defend;
- avoids pretending 4/5 approvals = reliable 80%.

Potential additions:
- hour-of-day;
- day-of-week;
- rolling adaptation.

## 9.2 Sequential change detection

On top of expected baseline:
- EWMA;
- CUSUM;
- change-point detection;

to detect sustained deviations quickly.

A practical 24h version:

**seasonal baseline + confidence interval + persistence + minimum volume + EWMA residual**

is more defensible than throwing an Isolation Forest at everything.

## 9.3 Traffic-mix decomposition — VERY IMPORTANT

An aggregate approval rate can drop even when **nothing broke**.

Example:

Yesterday:
- 80% traffic in a 95%-approval segment
- 20% in a 70%-approval segment

Today:
- 20% traffic in the first
- 80% in the second

Global conversion falls.

But neither segment degraded.

That is a **composition / mix shift**, not a payment incident.

This can create a Simpson’s-paradox-like trap.

Build a decomposition:

```text
Observed conversion change
    =
traffic composition effect
    +
within-segment performance effect
```

UI:

```text
Global conversion: -5.8pp

Traffic mix effect:       -5.1pp
True performance effect:  -0.7pp

NO INCIDENT
Reason: traffic shifted toward naturally lower-converting
Brazilian payment traffic.
```

This is both useful and impressive.

## 9.4 Hierarchical / multidimensional root-cause search

Candidate dimensions:

```text
merchant
provider
payment_method
country
issuing_bank
decline_code
```

Use a beam search / hierarchical exploration.

Rank candidate segments using something like:

```text
RCA score =
    business_impact
  × statistical_confidence
  × incident_coverage
  × specificity
  - complexity_penalty
```

A good root cause explains a lot of the loss while affecting a relatively specific coherent segment.

## 9.5 Cross-provider counterfactual controls

This exploits Yuno’s unique position.

If:

```text
Itaú through NovaPay  → degraded
Itaú through AtlasPay → normal
```

evidence points toward an **issuer–provider interaction**, not an issuer-wide outage.

Likewise:

```text
NovaPay with Itaú   → degraded
NovaPay with Nubank → normal
```

The intersection is stronger than either aggregate.

## 9.6 Counterfactual revenue estimator

For each affected segment:

```text
Expected approvals  = attempts × expected approval rate
Actual approvals
Lost approvals      = expected - actual

Lost revenue ≈
Σ(lost approvals × expected approved order value)
```

Better: show a confidence interval.

```text
Estimated leakage:
$10.4k–$12.7k / hour
```

## 9.7 Multi-incident separation

The brief explicitly requires two simultaneous incidents.

Do not merge them into one “global outage.”

Example:

```text
INCIDENT A
Brazil × NovaPay × Itaú
$11k/h

INCIDENT B
Mexico × Merchant 3 × Santander
$4k/h
```

Possible implementation:
1. find high-scoring anomalous segments;
2. greedily assign anomalous residuals to the best incident;
3. remove explained residual;
4. search again;
5. stop when remaining anomaly mass is below threshold.

Essentially a simple **set-cover / residual explanation** approach.

## 9.8 Proof-carrying diagnosis

The LLM is not allowed to say things unsupported by the deterministic engine.

Every claim references evidence.

```json
{
  "claim": "The issue is isolated to Itaú cards through NovaPay in Brazil",
  "evidence_ids": ["E12", "E18", "E21"],
  "confidence": 0.94
}
```

The UI lets the judge click the evidence.

This directly attacks the “LLM hallucinated root cause” weakness.

## 9.9 Explicit uncertainty / abstention

Three states:

```text
CONFIRMED / HIGH CONFIDENCE
LIKELY
INCONCLUSIVE
```

If volume is too low or two explanations are statistically indistinguishable:

> **“We detected degradation, but current evidence cannot distinguish a provider issue from an issuer-specific issue. Need more samples or external provider status.”**

That may impress the jury more than a wrong confident answer.

## 9.10 Historical incident memory

Each resolved incident has a fingerprint:

```text
affected dimensions
change signature
decline-code distribution shift
time profile
impact
diagnosis
recommended action
```

Store structured fingerprint + embedding of the incident report.

On a new incident:

```text
SIMILAR INCIDENT FOUND
Aug 25, 03:13 — similarity 92%

Same provider / issuer pattern
Previous cause: issuer-acquirer pairing degradation
```

Important:

**history is supporting context, not proof.**

## 9.11 Skeptic / evidence verifier

Optional but powerful.

```text
Investigator
    ↓
Evidence package
    ↓
Verifier / guardrail
    ↓
Published diagnosis
```

The verifier checks:
- each claim has evidence IDs;
- confidence is consistent with statistical confidence;
- recommendation does not exceed the challenge scope;
- no unsupported causal language.

Do not build a useless “5-agent swarm.”

If we use two agents, their separation must have a reason.

---

# 10. Where OpenAI belongs

The statistical engine should calculate statistics.

The LLM should **reason over evidence and choose investigative actions**.

## Suggested tools exposed to the investigator agent

```text
get_global_health()
get_segment_metrics(filters, window)
compare_to_baseline(filters, window)
rank_dimension_anomalies(dimension, filters)
compare_provider_controls(filters)
get_decline_mix(filters)
estimate_financial_impact(filters)
get_incident_candidates()
search_incident_memory(query)
get_recent_changes()
```

The agent can decide:

> “Country appears concentrated in Brazil. Compare providers within Brazil.”

Then call the correct tool.

### OpenAI should do
- investigation planning;
- adaptive hypothesis exploration;
- combining evidence;
- deciding what to inspect next;
- natural-language explanation;
- executive vs operator output;
- recommendations;
- historical similarity interpretation.

### OpenAI should NOT do
- calculate conversion from raw rows;
- invent p-values;
- decide if a sample is statistically significant;
- estimate revenue by mental arithmetic;
- silently infer data unavailable to the system.

---

# 11. OpenAI implementation options

Current OpenAI Agents SDK supports function tools, structured outputs, agent orchestration, guardrails and tracing.

Docs:
- https://openai.github.io/openai-agents-python/
- https://openai.github.io/openai-agents-python/tools/
- https://openai.github.io/openai-agents-python/guardrails/
- https://openai.github.io/openai-agents-python/tracing/

### Strong recommendation

Use **one main Investigator agent** first.

Do not overengineer multi-agent unless the core works.

Optional second layer:

**Evidence Auditor / output guardrail**.

Only add after the full trial flow passes.

---

# 12. Suggested data model

Canonical transaction:

```json
{
  "transaction_id": "txn_123",
  "timestamp": "2026-08-29T14:03:21.223Z",

  "merchant": "merchant_a",
  "provider": "nova_pay",
  "payment_method": "card",
  "country": "BR",
  "issuing_bank": "itau",

  "approved": false,
  "amount": 132.40,
  "currency": "USD",

  "raw_provider_code": "05",
  "raw_provider_message": "DO NOT HONOR",
  "canonical_decline_code": "do_not_honor",

  "latency_ms": 481
}
```

Do not expose unnecessary PII.

---

# 13. Synthetic world design

The challenge permits invented data.

Our simulator should look realistic enough that the investigator cannot cheat.

## Entities
- 5–8 merchants
- 4 providers
- Mexico, Colombia, Brazil + optionally Argentina
- Card, PIX, PSE, Wallet
- 5–10 issuers per card market
- decline reasons:
  - insufficient_funds
  - do_not_honor
  - issuer_unavailable
  - suspected_fraud
  - authentication_required
  - provider_timeout
  - invalid_data

## Baseline realism

Different combinations naturally have different approval rates.

```text
PIX Brazil           98%
Cards Brazil         88%
PSE Colombia         93%
Wallet Mexico        96%
```

Provider performance differs by market.

Issuers differ.

Add:
- time-of-day traffic;
- weekend volume;
- natural variance;
- order amount distributions.

Otherwise anomaly detection is too easy.

---

# 14. The Chaos Injector

This is a core feature, not a dev tool.

Separate interface:

`/chaos`

The operator / judge can choose:

```text
affected dimensions:
[merchant?]
[provider?]
[method?]
[country?]
[issuer?]
[decline code?]

approval degradation:
[-5 to -50 pp]

start:
[now]

duration:
[continuous / N minutes]
```

### Better: Random Blind Mode

Button:

## **INJECT UNKNOWN INCIDENT**

The system randomly chooses an incident and hides the configuration.

The analysis pipeline receives only generated transactions.

At the end:

## **REVEAL TRUTH**

This is an extraordinary proof that we did not hard-code the demo.

---

# 15. Trial scenarios we should test ourselves

Before code freeze, automatically run dozens/hundreds.

## A. No incident
Normal seasonality + noise. Expected: **NO ALERT**.

## B. Provider-wide degradation
Provider B, all countries, -20pp. Expected root: Provider B.

## C. Provider × country
Provider B × Brazil.

## D. Provider × issuer
Provider B × Itaú.

## E. Merchant-only regression
Merchant C.

## F. Issuer outage
Santander Mexico across all providers.

## G. Decline-code surge
Specific canonical decline reason jumps.

## H. Traffic mix shift only
Global approval changes due to more low-baseline traffic. Expected: **NO INCIDENT / COMPOSITION SHIFT**.

## I. Low-volume fake anomaly
2 approvals out of 5. Expected: **INSUFFICIENT EVIDENCE**.

## J. Two simultaneous incidents
Required by brief.

## K. Repeated historical incident
Expected: retrieval of previous fingerprint.

---

# 16. Evaluation metrics

Run these; do not invent numbers.

### Detection
- detection rate
- mean detection latency
- false-positive rate

### RCA
- exact root-cause match
- partial dimension match
- over-specific diagnosis rate
- under-specific diagnosis rate

### Uncertainty
- abstention correctness
- confidence calibration

### Multi-incident
- number correctly separated

### Business
- revenue impact estimation error

If the system actually scores well, put one simple result in the pitch:

> “We ran 100 blind synthetic incidents before the demo. The system correctly isolated X% and produced Y false positives.”

Only report real measured results.

---

# 17. UI / experience

Do not build 12 pages.

## Main Control Tower

Hero metrics:
- live approval
- expected approval range
- current revenue leakage
- active incidents
- stream volume

Below:
- live conversion chart with confidence band;
- active incident cards;
- recent investigation timeline.

## Incident Detail

### Header

```text
SEV-1 · HIGH CONFIDENCE

Brazil · NovaPay · Itaú · Card

Revenue leakage
$187/min
```

### Root Cause Graph

```text
GLOBAL
  ↓
BRAZIL
  ↓
NOVAPAY
  ↓
CARD
  ↓
ITAÚ
```

Healthy sibling branches in muted form.

### Evidence
- expected vs actual;
- volume;
- decline-code shift;
- controls.

### Ruled out
Important visually.

### Similar incident
One card.

### Recommended human action
Clear, narrow.

---

# 18. A memorable “investigation animation”

Not fake animation.

Stream real steps produced by the backend:

```text
✓ Confirming deviation...
✓ Checking traffic mix...
✓ Scanning country dimension...
✓ Brazil isolated.
✓ Comparing providers...
✓ NovaPay isolated.
✓ Testing issuer-wide outage...
✓ Alternate provider healthy.
✓ Inspecting decline-code shift...
✓ Evidence threshold reached.
```

This gives the demo motion and lets the audience understand what the system did.

---

# 19. Four parallel workstreams

Once contracts are frozen, divide into four largely independent areas.

## Stream A — Payment simulation + data
Owns:
- transaction generator;
- realistic baseline distributions;
- seasonality;
- chaos injector;
- WebSocket/SSE stream;
- blind ground-truth separation.

Deliverable contract:

```text
stream of canonical Transaction events
```

## Stream B — Detection + RCA / ML
Owns:
- baseline;
- anomaly detection;
- confidence;
- mix-shift decomposition;
- dimensional search;
- multi-incident separation;
- revenue impact.

Deliverable:

```text
IncidentCandidate[]
Evidence[]
```

## Stream C — OpenAI investigator
Owns:
- tool layer;
- main Investigator agent;
- structured report schema;
- historical memory;
- evidence-linked explanations;
- optional verifier.

Deliverable:

```text
IncidentReport
InvestigationStep[]
```

## Stream D — Product / UI / demo
Owns:
- Control Tower UI;
- live charts;
- incident page;
- root-cause visualization;
- investigation timeline;
- chaos UI;
- executive / ops modes;
- deployment.

Use mocks immediately; do not wait for backend.

---

# 20. Shared contracts must be defined before parallel coding

Before 4 Codex sessions go wild, freeze:

```text
Transaction
BaselinePoint
Anomaly
Evidence
IncidentCandidate
InvestigationStep
IncidentReport
ChaosSpec
```

Also freeze endpoint names.

Example:

```text
GET  /api/health
GET  /api/stream
GET  /api/incidents
GET  /api/incidents/:id

POST /api/chaos/inject
POST /api/chaos/random
POST /api/chaos/reveal
```

---

# 21. Suggested stack

## Frontend
- Next.js
- TypeScript
- Tailwind
- shadcn/ui
- Recharts or another known chart library
- SSE/WebSocket

## Analysis / simulator
Python is natural:
- FastAPI
- Pydantic
- NumPy
- pandas or Polars
- scipy / statsmodels where useful

Do not install 25 ML frameworks.

## Data
For the hackathon:
- in-memory + DuckDB / SQLite can be enough;
- Postgres/Supabase only if persistence genuinely helps.

Avoid infrastructure theater.

## AI
- OpenAI API
- Agents SDK or Responses API
- structured outputs
- function tools
- tracing

---

# 22. What NOT to do

## ❌ “GPT reads a CSV”
Poor scale, poor reliability, poor defense.

## ❌ Isolation Forest because “it is ML”
Use techniques appropriate to a proportion/time-series problem.

## ❌ Static threshold

```text
approval < 80 → alert
```

Fails seasonality / markets / volumes.

## ❌ Hard-coded trial patterns
Judges will break it.

## ❌ “Root cause” based only on largest bad segment
Need controls and confidence.

## ❌ 10 autonomous agents
More components ≠ more intelligence.

One strong investigative loop beats an arbitrary swarm.

## ❌ Let LLM calculate statistics
Give it tools returning reliable statistics.

## ❌ Automatically reroute traffic
The official challenge explicitly says **recommend, do not execute remediation**.

## ❌ Build an enormous dashboard
The star is the investigation.

---

# 23. Priority tiers

## MUST — without these we are not competitive
1. realistic live stream;
2. seasonality/noise-aware detection;
3. unknown arbitrary incident injection;
4. multi-dimensional RCA;
5. evidence;
6. revenue impact;
7. OpenAI explanation;
8. trial works end-to-end;
9. multiple incidents;
10. “insufficient evidence” path.

## SHOULD — likely differentiators
11. mix-shift decomposition;
12. cross-provider control analysis;
13. investigation timeline;
14. root-cause visual map;
15. historical incident memory;
16. executive / operations explanations;
17. blind reveal / automatic score.

## STRETCH — only after core is rock solid
18. evidence auditor;
19. natural-language chaos injection;
20. causal graph;
21. automated 100-case eval dashboard;
22. sophisticated Bayesian hierarchy;
23. Slack-style alert output.

---

# 24. Natural-language chaos injection — optional wow feature

Judge types:

> “Make Itaú cards processed through NovaPay in Brazil slowly degrade by around 25 points, and also create a separate outage for one Mexican merchant.”

OpenAI converts it into validated `ChaosSpec`.

Then the generator injects it.

Important:
- show parsed configuration to judge before activation;
- investigator does not receive it;
- structured output only.

This turns the trial itself into part of the show.

Keep structured controls as a fallback.

---

# 25. Out-of-the-box ideas worth considering

## Idea A — The counterfactual twin

Every affected segment is compared against its nearest healthy “twin.”

```text
Affected:
Brazil / Itaú / NovaPay / Card

Counterfactual:
Brazil / Itaú / AtlasPay / Card
```

UI:

> “Same issuer, same market, same method. Different provider. Healthy.”

Very strong evidence.

## Idea B — Revenue leak clock

Instead of static number:

```text
$14,209
$14,231
$14,258
```

live counter.

## Idea C — Investigation tree

Show explored hypotheses:

```text
Brazil                  ✓ relevant
  Provider A            ✗ normal
  NovaPay               ✓ relevant
    Card                 ✓ relevant
      Itaú              ✓ root
      Nubank            ✗ normal
Mexico                  ✗ normal
```

## Idea D — “What would fool a normal dashboard?”

Create a demo scenario that fools global aggregates.

For example, two effects cancel:
- Provider A in Brazil collapses;
- Mexico traffic shifts to a high-conversion method.

Global approval barely moves.

A naive global monitor says fine.

Our multidimensional engine detects the hidden Brazil loss.

This could be an exceptional extra demo.

## Idea E — Simpson’s paradox / traffic mix protection
As described earlier.

## Idea F — Auto-generated incident packet

After diagnosis, create a compact provider escalation package:

```text
Incident ID
time window
affected dimensions
expected vs actual
decline-code distribution
control cohort
financial impact
supporting evidence
```

The human can send it to a PSP.

No remediation is executed.

## Idea G — Explain to two audiences

### OPERATIONS
Detailed evidence.

### EXECUTIVE
> “Brazil payment incident: ~$11k/hour at risk. Isolated to NovaPay × Itaú. Other providers healthy.”

Official bonus.

---

# 26. The strongest possible pitch story

## Hook

> “Payment incidents don’t announce themselves. Conversion simply starts leaking money.”

## Existing problem

> “Today an operator sees a chart, then manually slices by country, provider, issuer and decline code until they find the problem.”

## Insight

> “Yuno already sees every provider. That means the investigation itself can become autonomous.”

## Product

> “We built an AI payment SRE.”

## Live trial

> “Don’t trust our prerecorded scenario. Inject one yourselves.”

Judge injects unknown incident.

System finds it.

## Key technical distinction

> “The model never guesses statistics. A payment-native detection and RCA engine produces evidence; the agent decides what to investigate next and can only publish claims backed by that evidence.”

## Closing

> “Control Tower turns an approval-rate drop from a 3 a.m. investigation into an evidence-backed diagnosis in seconds.”

---

# 27. Technical-defense talking points

## Why not just an LLM?
Because the problem is statistical. LLMs orchestrate investigation; deterministic statistical tools establish evidence.

## Why not static thresholds?
Different markets / times / segments have different expected conversion and volume.

## Why not Isolation Forest?
Approval is a binomial proportion with strong seasonality and hierarchical sparsity. A payment-native baseline is easier to interpret and defend.

## How do you avoid false positives?
- seasonal baseline;
- minimum sample volume;
- persistence;
- confidence interval;
- mix-shift decomposition.

## How do you avoid hallucinated root cause?
- structured tool outputs;
- evidence IDs;
- deterministic statistics;
- report validation;
- abstention.

## Why can Yuno do this better than one PSP?
Because Yuno has neutral cross-provider visibility and can use alternate PSPs as controls.

## What happens with two incidents?
Residual / segment decomposition creates separate incident candidates instead of forcing one global explanation.

## What if evidence is ambiguous?
Publish “inconclusive” and list the evidence required to discriminate the hypotheses.

---

# 28. Decision log — start now

Required deliverable.

Create `DECISIONS.md`.

Template:

```md
## D001 — Detection approach

Alternatives:
1. static threshold
2. Isolation Forest
3. seasonal Beta-Binomial baseline + sequential residual detection

Decision:
3

Why:
- approval is a binomial proportion
- handles low volume through uncertainty
- interpretable for technical defense
- naturally supports seasonal buckets
- easier to calibrate for false positives

Tradeoff:
less generic than unsupervised ML, but more aligned with the payment metric.
```

Add every major architecture decision as it happens.

---

# 29. First build order

## First 30–45 minutes
Do not code independently yet.

Agree:
- product sentence;
- demo;
- contracts;
- architecture;
- MUST list;
- division of work.

## Then parallelize immediately

### Data stream
Get transactions moving.

### RCA
Get a simple known incident detected.

### AI
Get tools + one structured report working on mocked evidence.

### UI
Build entirely against mocks.

---

# 30. Integration milestones

## Milestone 1
Normal stream visible.

## Milestone 2
One simple provider incident: detected + displayed.

## Milestone 3
Unknown provider × country incident: correctly isolated.

## Milestone 4
Agent generates evidence-backed report.

## Milestone 5
Judge chaos UI.

At this point you already have a legitimate submission.

## Milestone 6
Cross-provider controls.

## Milestone 7
Multiple incidents.

## Milestone 8
Mix-shift / uncertainty.

## Milestone 9
Historical memory + polish + evals.

---

# 31. Biggest risk

The biggest risk remains:

> **building a beautiful payment analytics dashboard with an AI summary.**

That is already the market baseline.

The product must visibly **perform investigative work**.

If we have to cut features, preserve this:

```text
UNKNOWN INCIDENT
      ↓
DETECTED
      ↓
AUTONOMOUS INVESTIGATION
      ↓
EVIDENCE
      ↓
CORRECT ROOT CAUSE
```

Everything else is secondary.

---

# 32. Final recommended scope

If I had to lock the “winning” product now:

### Core
- real-time synthetic payment stream;
- seasonal / uncertainty-aware detection;
- generic multi-dimensional RCA;
- cross-provider controls;
- autonomous OpenAI investigator;
- proof-carrying report;
- cost estimate;
- uncertainty / abstention;
- two simultaneous incidents.

### Wow
- blind judge Chaos Console;
- live investigation trace;
- root-cause graph;
- live revenue-leak counter;
- reveal ground truth + score.

### Smart technical differentiators
- traffic-mix decomposition;
- provider/issuer counterfactual comparison;
- historical incident fingerprint.

### Only if time remains
- natural-language chaos;
- evidence auditor;
- full eval dashboard.

---

# 33. Sources / research bibliography

## Challenge
- NextWave Hackathon 2026 — Challenges MASTER (EN), Challenge 2 “The Control Tower” — supplied by organizers.

## Yuno
- https://www.y.uno/
- https://www.y.uno/es/product/monitors
- https://y.uno/es/blog/payment-analytics-that-actually-drive-decisions-not-just-dashboards
- https://www.y.uno/en/blog/issuer-acquirer-pairing-mismatches-the-root-cause-of-authorization-failures-that-no-single-provi
- https://www.y.uno/en/blog/what-happens-when-you-let-ai-analyze-your-payment-data

## Primer
- https://www.primer.io/manage/observability
- https://www.primer.io/manage/monitors

## IXOPAY
- https://www.ixopay.com/products/payments-intelligence
- https://www.ixopay.com/products/payments-intelligence/anomaly-detection
- https://documentation.ixopay.com/modules/docs/payments-intelligence/observability/anomaly-detection
- https://www.ixopay.com/blog/ai-payments-expert-ixopay-ixonav

## Juspay
- https://juspay.io/blog/what-is-payment-observability-solving-silent-failures-for-multi-psp-merchants

## Spreedly
- https://developer.spreedly.com/docs/ai-analytics
- https://www.spreedly.com/products/optimize

## Gr4vy
- https://docs.gr4vy.com/guides/dashboard/monitoring-and-alerting/overview
- https://gr4vy.com/analytics/dashboard/

## Stripe / Adyen — payment error semantics
- https://docs.stripe.com/declines/card
- https://docs.stripe.com/declines/network-codes
- https://docs.adyen.com/point-of-sale/error-scenarios/raw-acquirer-responses

## Datadog / AI incident investigation
- https://docs.datadoghq.com/bits_ai/bits_investigation/
- https://www.datadoghq.com/blog/building-bits-ai-sre/
- https://www.datadoghq.com/blog/engineering/bits-ai-eval-platform/

## Rootly
- https://rootly.com/ai-sre

## Nauta
- https://www.getnauta.com/
- https://www.getnauta.com/latam
- https://ai-workforce.getnauta.com/

## OpenAI Agents SDK
- https://openai.github.io/openai-agents-python/
- https://openai.github.io/openai-agents-python/tools/
- https://openai.github.io/openai-agents-python/guardrails/
- https://openai.github.io/openai-agents-python/tracing/

---

# 34. One sentence to keep the team aligned

> **We are not building a dashboard that shows a payment incident. We are building an AI payment investigator that proves what caused it.**
