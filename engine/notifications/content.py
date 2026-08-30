"""Safe, concise operator-facing message rendering."""

from __future__ import annotations

from html import escape
from contracts.schemas import IncidentReport


def incident_url(report: IncidentReport, base_url: str) -> str:
    """Link to the live queue rather than a report ID that a recovery may replace.

    The runtime can replace an inconclusive report with a fully evidenced one in the same
    episode. The queue always resolves to the current report and remains useful during a demo.
    ``report`` stays in the signature so template values can evolve without changing callers.
    """

    del report
    return f"{base_url.rstrip('/')}/investigations"


def template_values(report: IncidentReport, base_url: str) -> dict[str, str]:
    return {
        "incident_id": report.incident_id,
        "status": report.status.value,
        "estimated_revenue_loss_usd_per_hour": f"USD {report.estimated_revenue_loss_usd_per_hour:,.0f}/h",
        "incident_url": incident_url(report, base_url),
    }


def incident_text(report: IncidentReport, base_url: str) -> str:
    values = template_values(report, base_url)
    return (
        f"PHAROS · incidente {values['incident_id']}\n"
        f"Estado: {values['status']} · Impacto estimado: {values['estimated_revenue_loss_usd_per_hour']}\n"
        "Requiere revisión humana; no se modificó tráfico de pagos.\n"
        f"Ver evidencia: {values['incident_url']}"
    )


def incident_html(report: IncidentReport, base_url: str) -> str:
    values = template_values(report, base_url)
    return (
        "<h2>PHAROS detectó un incidente de pagos</h2>"
        f"<p><strong>Incidente:</strong> {escape(values['incident_id'])}<br>"
        f"<strong>Estado:</strong> {escape(values['status'])}<br>"
        f"<strong>Impacto estimado:</strong> {escape(values['estimated_revenue_loss_usd_per_hour'])}</p>"
        "<p>Requiere revisión humana; no se modificó tráfico de pagos.</p>"
        f"<p><a href=\"{escape(values['incident_url'], quote=True)}\">Abrir evidencia</a></p>"
    )
