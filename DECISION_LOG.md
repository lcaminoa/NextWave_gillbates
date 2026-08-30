# Decision Log — gill bates

NextWave Hackathon 2026 · Buenos Aires

## 1. Sequential detection: Beta-Binomial baseline + EWMA vs CUSUM  `T+19:40`

**Options considered**

- Static approval-rate threshold
- CUSUM over approval-rate residuals
- Beta-Binomial baseline with EWMA residual monitoring and persistence

**Chosen:** A Beta-Binomial baseline per segment, followed by EWMA monitoring of the observed-versus-expected residual and three consecutive confirmation windows.

**Why:** Approval rate is a binomial proportion, so the Beta-Binomial baseline expresses uncertainty instead of treating every segment as equally reliable. EWMA produces an interpretable deviation in percentage points with one tunable parameter. We considered CUSUM, but it requires calibrating additional parameters and its accumulated output is less intuitive for an operations user. The trade-off is that small gradual degradations may need more windows before they are reported.

## 2. Root-cause search depth: up to 2 dimensions vs 3+ dimensions  `T+19:40`

**Options considered**

- Search root-cause candidates up to 2 dimensions
- Search root-cause candidates across 3 or more dimensions

**Chosen:** We search root-cause candidates across one or two dimensions and require sufficient volume and citable evidence before publication.

**Why:** Higher-order intersections fragment payment traffic into very small samples, making statistical comparisons unreliable. One- and two-dimensional candidates retain enough volume to compare against a baseline and construct counterfactual controls. The trade-off is reduced specificity for a genuinely higher-dimensional incident. In that case, PHAROS publishes an inconclusive result rather than presenting a partial two-dimensional explanation as the root cause.

## 3. EWMA calibration: live runtime defaults vs compressed demo settings  `T+19:41`

**Options considered**

- Lower the global EWMA detection threshold
- Raise the EWMA lambda globally
- Use a higher lambda only in the compressed demo while keeping the live runtime defaults

**Chosen:** The live runtime keeps EWMA lambda = 0.3, threshold = -0.05, and three persistence windows. The standalone compressed demo uses lambda = 0.7 and two windows.

**Why:** The standalone demo compresses the scenario into only two synthetic windows, so lambda = 0.3 does not warm up quickly enough. Changing the global runtime settings just to accelerate the demo would make live detection unnecessarily sensitive to noise. The trade-off is that the demo configuration is intentionally different from the live configuration, but it is isolated and documented.
