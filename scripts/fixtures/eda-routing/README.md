# EDA routing acceptance fixture

`circuit.kicad_sch` and `circuit.kicad_pcb` are deterministic native KiCad
exports of the un-routed sample LED circuit created by
`scripts/verify-eda-module-freerouting.ts`. The PCB starts with two external
unconnected items while preserving the sample module's internal track.

Run `scripts/verify-eda-cloud.py` followed by
`scripts/verify-eda-cloud-routing.py` only against an isolated database named
`vibehard_eda_acceptance_*`. The routing script checks the public desktop API,
job/account isolation, actual routing result, source preservation, and accepting
the candidate as a new project. These files are a **software test fixture**;
their component choices and electrical limits have not passed hardware review.
