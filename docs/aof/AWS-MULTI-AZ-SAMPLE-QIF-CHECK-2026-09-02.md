# AWS Multi-AZ Sample QIF Check

Date: 2026-09-02
Task: Add an ArchMap sample adapted from the AWS architecture tutorial at https://edraw.wondershare.jp/network-diagram/how-to-create-aws-diagram.html

## Quality intent

The sample must preserve architecture meaning rather than copy the source image's pixels. It must demonstrate strict Container containment, direct Resource communication, redundant Availability Zones, and a readable deterministic Topology projection.

## Checks

| Criterion | Result | Evidence |
| --- | --- | --- |
| Direct communication only | Pass | Paths are authored as User -> Load Balancer -> EC2 -> RDS; no User -> EC2/RDS shortcut exists. |
| Container forest | Pass | AWS Cloud -> Tokyo Region -> Production VPC -> Availability Zone -> Subnet uses one direct parent per Container. |
| Multi-AZ redundancy | Pass | AZ A and AZ C each contain public/private tiers; RDS replication is bidirectional. |
| Non-overlapping sibling areas | Pass | Golden-grid placements separate both Availability Zones and their sibling Subnets. Browser geometry inspection found no sibling intersections. |
| Renderer portability | Pass | The sample uses semantic IDs and grid cells, not manually authored pixel coordinates. |
| Diagnostics | Pass | Local playground rendered the sample with no diagnostics. |
| Regression coverage | Pass | Sample/topology tests, typecheck, production build, and diff checks pass. |

## Decision

PASS. The sample is suitable for the curated gallery and as a standalone `.archmap` authoring reference.
