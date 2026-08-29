import Link from "next/link";
import { ArrowUpRight, Check, CircleAlert, SearchCheck, ShieldCheck } from "lucide-react";
import { candidates, evidence, reports } from "@/lib/fixtures/control-tower";

const incidentHref = "/incidents/incident-br-novapay";

function candidateLabel() {
  const report = reports.find((item) => item.incident_id === "incident-br-novapay") ?? reports[0];
  const candidate = candidates.find((item) => item.candidate_id === report.winning_candidate_id) ?? candidates[0];
  const country = candidate.dimensions.country === "BR" ? "Brazil" : candidate.dimensions.country;
  const paymentMethod = candidate.dimensions.payment_method === "card" ? "Card" : candidate.dimensions.payment_method;
  return [candidate.dimensions.provider, country, paymentMethod, candidate.dimensions.issuing_bank]
    .filter(Boolean)
    .join(" × ");
}

export function LandingSections() {
  const report = reports.find((item) => item.incident_id === "incident-br-novapay") ?? reports[0];
  const reportEvidence = evidence.filter((item) => report.claims[0]?.evidence_ids.includes(item.evidence_id));

  const evidencePanels = [
    {
      index: "01",
      title: "Expected range",
      metric: "93.9% expected",
      body: reportEvidence.find((item) => item.evidence_id === "ev-br-baseline")?.summary,
      proof: "ev-br-baseline",
    },
    {
      index: "02",
      title: "Counterfactual",
      metric: "AuroraPay · 94.1%",
      body: reportEvidence.find((item) => item.evidence_id === "ev-br-control")?.summary,
      proof: "ev-br-control",
    },
    {
      index: "03",
      title: "Decline pattern",
      metric: "do_not_honor · 71%",
      body: reportEvidence.find((item) => item.evidence_id === "ev-br-declines")?.summary,
      proof: "ev-br-declines",
    },
  ];

  return (
    <main className="landing-narrative">
      <section className="landing-evidence-section" id="evidence" aria-labelledby="evidence-heading">
        <header className="landing-section-intro">
          <span>Evidence model / 01</span>
          <h2 id="evidence-heading">A signal is not a diagnosis.</h2>
          <p>PHAROS puts the comparison beside the claim, so a person can verify the reasoning before deciding what to do.</p>
        </header>

        <div className="landing-evidence-panels">
          {evidencePanels.map((panel) => (
            <article className="landing-evidence-panel" key={panel.proof}>
              <div className="landing-evidence-panel-top">
                <span>{panel.index}</span>
                <Check className="size-4" aria-hidden="true" />
              </div>
              <h3>{panel.title}</h3>
              <strong>{panel.metric}</strong>
              <p>{panel.body}</p>
              <code>{panel.proof}</code>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-preview-section" aria-labelledby="preview-heading">
        <header className="landing-section-intro landing-preview-intro">
          <span>Investigation workspace / 02</span>
          <h2 id="preview-heading">See the investigation, not a black box.</h2>
          <p>One incident, one evidence trail, one human decision. The system narrows the scope; it does not make the change.</p>
        </header>

        <article className="landing-investigation-preview">
          <div className="landing-preview-topline">
            <span><i /> Incident / Brazil · NovaPay</span>
            <span>Probable · human review required</span>
          </div>

          <div className="landing-preview-core">
            <div className="landing-preview-anomaly">
              <span>Anomaly detected</span>
              <strong>62.4%</strong>
              <p>Brazil card approval on NovaPay</p>
              <small>−31.4 pp below 93.9% expected · four sustained windows</small>
            </div>

            <div className="landing-preview-candidate">
              <span>Best-supported explanation</span>
              <h3>{candidateLabel()}</h3>
              <p>{report.summary}</p>
              <div className="landing-preview-confidence">
                <span>Evidence support</span>
                <strong>0.91</strong>
              </div>
            </div>
          </div>

          <div className="landing-preview-proof">
            <div className="landing-proof-heading">
              <SearchCheck className="size-4" aria-hidden="true" />
              <span>Evidence board</span>
            </div>
            {reportEvidence.map((item) => (
              <div className="landing-proof-row" key={item.evidence_id}>
                <code>{item.evidence_id}</code>
                <p>{item.summary}</p>
                <Check className="size-4" aria-label="Citable evidence" />
              </div>
            ))}
          </div>

          <div className="landing-preview-recommendation">
            <ShieldCheck className="size-5" aria-hidden="true" />
            <div>
              <span>Recommendation only — no traffic was rerouted</span>
              <p>{report.recommended_action}</p>
            </div>
            <CircleAlert className="size-5" aria-label="Human review required" />
          </div>

          <Link href={incidentHref} className="landing-preview-link">
            Open the evidence-backed incident <ArrowUpRight className="size-4" />
          </Link>
        </article>
      </section>

      <section className="landing-final-cta" aria-labelledby="final-cta-heading">
        <div>
          <span>PHAROS / ready for review</span>
          <h2 id="final-cta-heading">Detect the drop.<br />Prove the cause.</h2>
          <p>Give payment teams a defensible investigation before they make a human decision.</p>
        </div>
        <div className="landing-final-actions">
          <Link href="/control-room" className="landing-action landing-action-primary">
            Open Control Room <ArrowUpRight className="size-4" />
          </Link>
          <Link href="/chaos" className="landing-action landing-action-secondary">
            Run Chaos Lab <ArrowUpRight className="size-4" />
          </Link>
        </div>
      </section>
    </main>
  );
}
