# ArchMap Next Specifications

Status: Approved requirements baseline

ArchMap Next defines ArchMap as a **System Topology as Code** engine. Authors
declare resources, real direct communication, structural containment, and
semantic sets. ArchMap derives boundary crossings and overlay transitions,
then projects the same topology into purpose-specific views.

The normative documents are:

- [12-system-topology-boundary-model.md](12-system-topology-boundary-model.md)
  defines the canonical model, derived analysis, projection contract, and
  acceptance examples.
- [13-compatibility-and-migration.md](13-compatibility-and-migration.md)
  defines how existing ArchMap documents map into the Next model without a
  flag-day rewrite.

Earlier specifications remain valid for their released surfaces. Where a
legacy architecture term conflicts with the Next canonical model, the
compatibility document governs ingestion and diagnostics; the Next model
governs analysis.

