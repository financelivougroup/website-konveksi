---
name: feature-delivery
description: Run the full feature-delivery sequence when the user invokes /grill-with-docs — grilling, spec, tickets, then implementation of the approved ticket frontier.
---

# Default feature-delivery workflow

When the user invokes `/grill-with-docs`, treat it as authorization to continue the
same feature through the complete delivery sequence:

1. Finish `/grill-with-docs`, including both its grilling and domain-modeling stages.
2. Invoke `/to-spec` using the decisions and domain documentation produced by the
   grilling stage.
3. After the spec is published, invoke `/to-tickets` (plural) against that spec.
4. After the approved tickets are published, invoke `/implement` and work the
   unblocked ticket frontier until the scoped feature is complete.

Do not stop merely to ask whether to invoke the next skill in this sequence.
Preserve and pass forward the same feature scope, decisions, glossary terms, ADRs,
spec reference, and ticket references. Still honor every required checkpoint inside
each skill, including test-seam confirmation in `/to-spec`, ticket-breakdown
approval in `/to-tickets`, and any permission or product decision that genuinely
requires the user. If a stage is blocked, ambiguous, fails verification, or would
expand the approved scope, stop at that point, explain the blocker, and wait for the
user instead of guessing or silently skipping a stage.
