# Verification rules

Six categories. Each finding is `err` (clear contradiction, must fix) or `lack`
(missing config / needs confirmation). Score = `max(0, 100 − err×12 − lack×4)`.

## L1 — Physical (per link)
- Speed mismatch on a link (both ends fixed, differing) → err
- Duplex mismatch → err
- MTU mismatch → lack
- EtherChannel mode incompatibility (e.g. `active`↔`on`, `passive`↔`passive`) → err

## L2 — VLAN / Trunk
- Access port references a VLAN not in the VLAN DB → lack (port → lack)
- Trunk with no `allowed vlan` (implicit all) → lack
- `switchport mode` unset but VLAN config present → lack
- shutdown port that is a declared link end → lack
- Per link: mode mismatch (access↔trunk) → err; native VLAN mismatch → err; no common
  allowed VLAN → err; switch-side VLAN not allowed on the router side → lack
- Link end with no interface config at all → lack

## STP
- L2 loop detected via union-find over `links`. err if any switch in the loop has no
  `spanning-tree mode`; otherwise lack (STP would block a port — confirm intent).
- `portfast` on a trunk port → lack

## L3 — Reachability
- An access VLAN in use has no L3 gateway (no subnet with a gateway for that VLAN) → lack
- Duplicate IP across interfaces → err
- DHCP pool `default-router` ≠ the actual gateway of that subnet → err

## FW — Firewall policy (SonicWall)
- For each non-WAN zone, if no rule allows it to reach WAN → lack (can't reach internet)
- Evaluated object-aware via `evalFW` (address-objects, service-objects, enable/disable,
  rule order; inter-zone default-deny, intra-zone allow).

## SEC — Hardening / policy hygiene
- Telnet enabled → err; `enable password` without `enable secret` → lack
- SNMP community `public`/`private` → err
- WAN-side ping allowed → lack; WAN-side management allowed → err
- Access port without `portfast` → lack; portfast without `bpduguard` → lack
- `any/any/any` allow rule (overly permissive) → lack
- Rule shadowed by an earlier broad same-zone allow → lack

## Reachability matrix
`buildMatrix` computes subnet→subnet via `evalFW` with service `any`:
`ok` (allowed) / `deny` (blocked or no permit) / `nogw` (no L3 gateway) / `self`.
Same-subnet (L2) pairs are out of scope.

## Path trace
`pathTrace(state, srcCidr, dstSpec, service)` walks SRC → L2 (access switch → trunk →
router) → GW (L3 gateway subif) → RT (connected route, or default route to WAN) → FW
(object-aware decision, reports the deciding rule index) → NAT (only for WAN egress) →
DST. Returns per-hop `ok|deny|info` and an overall `verdict`.

## Adding a rule
1. Add the check inside `verify()` in `src/facet-core.js` (use `add(cat, level, where,
   desc, why, fix)` and, for port-tied findings, `setPort(dev, iface, level, msg)`).
2. Mirror the change into the engine copy in `app/facet.html`.
3. Add an assertion in `test/facet.test.js`. Keep the intentionally-flawed sample
   (SW-02 has VLAN30-undefined / native-99 / telnet) as the fixture that exercises findings.
