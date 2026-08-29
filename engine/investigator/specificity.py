"""Deterministic guardrails against over-specific root-cause candidates.

Stream B is allowed to reward useful intersections in its RCA score. Publication is stricter:
when a candidate adds dimensions to an available simpler explanation, the intersection must
show both a material decline-rate lift and a counterfactual for every added dimension.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence

from contracts.schemas import Evidence, IncidentCandidate


MIN_INCREMENTAL_DECLINE_LIFT = 0.08


def candidate_dimensions(candidate: IncidentCandidate) -> dict[str, str]:
    return {
        str(key): str(value)
        for key, value in candidate.dimensions.model_dump(exclude_none=True).items()
    }


def _is_proper_subset(
    simpler: IncidentCandidate,
    specific: IncidentCandidate,
) -> bool:
    simple_dimensions = candidate_dimensions(simpler)
    specific_dimensions = candidate_dimensions(specific)
    return len(simple_dimensions) < len(specific_dimensions) and all(
        specific_dimensions.get(key) == value
        for key, value in simple_dimensions.items()
    )


def is_strict_refinement(
    candidate: IncidentCandidate,
    base: IncidentCandidate,
) -> bool:
    """Return whether ``candidate`` only adds dimensions to ``base``.

    A refinement can be useful supporting detail, but it is not an independent
    competing root cause.  For example, ``issuing_bank=nubank`` and
    ``issuing_bank=nubank x payment_method=card`` describe the same causal
    lineage; the latter must not make the former look ambiguous merely because
    both are present in the RCA ranking.
    """
    return _is_proper_subset(base, candidate)


def maximal_simpler_candidates(
    candidate: IncidentCandidate,
    candidates: Sequence[IncidentCandidate],
) -> tuple[IncidentCandidate, ...]:
    """Return the closest available proper-subset explanations for ``candidate``."""
    simpler = [item for item in candidates if _is_proper_subset(item, candidate)]
    if not simpler:
        return ()
    largest_size = max(len(candidate_dimensions(item)) for item in simpler)
    return tuple(
        item
        for item in simpler
        if len(candidate_dimensions(item)) == largest_size
    )


def specificity_errors(
    candidate: IncidentCandidate,
    *,
    candidates: Sequence[IncidentCandidate],
    evidence: Sequence[Evidence],
    consulted_evidence_ids: Iterable[str] | None = None,
) -> tuple[str, ...]:
    """Explain why an intersection cannot be published over simpler hypotheses."""
    simpler_candidates = maximal_simpler_candidates(candidate, candidates)
    if not simpler_candidates:
        return ()

    candidate_dimensions_map = candidate_dimensions(candidate)
    evidence_by_id = {item.evidence_id: item for item in evidence}
    attached_evidence = [
        evidence_by_id[evidence_id]
        for evidence_id in candidate.evidence_ids
        if evidence_id in evidence_by_id
    ]
    consulted = set(consulted_evidence_ids) if consulted_evidence_ids is not None else None
    errors: list[str] = []

    for simpler in simpler_candidates:
        lift = candidate.current_decline_rate - simpler.current_decline_rate
        if lift < MIN_INCREMENTAL_DECLINE_LIFT:
            errors.append(
                f"{candidate.candidate_id} adds dimensions over {simpler.candidate_id} "
                f"but its decline-rate lift is only {lift:.4f}; at least "
                f"{MIN_INCREMENTAL_DECLINE_LIFT:.4f} is required"
            )

        simpler_dimensions = candidate_dimensions(simpler)
        added_dimensions = set(candidate_dimensions_map) - set(simpler_dimensions)
        for dimension in sorted(added_dimensions):
            matching_ids = {
                item.evidence_id
                for item in attached_evidence
                if item.source == f"counterfactual_{dimension}"
            }
            if not matching_ids:
                errors.append(
                    f"{candidate.candidate_id} lacks counterfactual_{dimension} evidence "
                    f"against {simpler.candidate_id}"
                )
            elif consulted is not None and matching_ids.isdisjoint(consulted):
                errors.append(
                    f"{candidate.candidate_id} counterfactual_{dimension} evidence was not "
                    "consulted"
                )

    return tuple(errors)


def filter_specificity_supported_candidates(
    candidates: Sequence[IncidentCandidate],
    evidence: Sequence[Evidence],
) -> tuple[IncidentCandidate, ...]:
    """Remove only candidates that over-specify an available simpler explanation."""
    return tuple(
        candidate
        for candidate in candidates
        if not specificity_errors(
            candidate,
            candidates=candidates,
            evidence=evidence,
        )
    )


def relevant_audit_candidates(
    winner_id: str | None,
    candidates: Sequence[IncidentCandidate],
) -> tuple[IncidentCandidate, ...]:
    """Bound the audit packet to winner, simpler alternatives, and top competitor."""
    ranked = sorted(candidates, key=lambda item: item.rca_score, reverse=True)
    if winner_id is None:
        return tuple(ranked[:2])

    winner = next(
        (candidate for candidate in candidates if candidate.candidate_id == winner_id),
        None,
    )
    if winner is None:
        return tuple(ranked[:2])

    selected = [winner, *maximal_simpler_candidates(winner, candidates)]
    competitor = next(
        (candidate for candidate in ranked if candidate.candidate_id != winner_id),
        None,
    )
    if competitor is not None:
        selected.append(competitor)

    seen: set[str] = set()
    unique: list[IncidentCandidate] = []
    for candidate in selected:
        if candidate.candidate_id in seen:
            continue
        seen.add(candidate.candidate_id)
        unique.append(candidate)
    return tuple(unique)
