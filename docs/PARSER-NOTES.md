# Parser notes

The parsers are deliberately tolerant and pattern-based, not full grammars. They target
**readable CLI text**, not binary exports. Expect to extend them as real configs arrive.

v4.0.0 (Sprint 1.5) で TypeScript に移植済。実体は `src/engine/parsers/cisco.ts` と
`src/engine/parsers/sonicwall.ts`。型は `src/engine/types.ts` の `CiscoParsed` /
`SonicWallParsed` / `ParsedInterface` を参照。挙動は v3.1.0 と完全互換
(46 ケース全 PASS で保証)。

Sprint 3 で IOS / IOS-XE / NX-OS の判別と SonicOS バージョン差対応を実装予定。
詳細は `ROADMAP.md`。

## Cisco (`parseCisco`) — assumes IOS / IOS-XE running-config text
Handled: `hostname`, `vlan` + `name`, `interface` and `interface range` (expanded),
`switchport` access/trunk/native/allowed, `channel-group`, `ip address` (+secondary),
`speed`/`duplex`/`mtu`, `spanning-tree mode`/`portfast`/`bpduguard`, SVIs (`interface
Vlan<n>`), `ip route` (static), `ip access-list` / `access-list` (parsed, lightly used),
`ip dhcp pool` (`network` + `default-router`), `standby` (HSRP, basic), `shutdown`,
and security signals (`transport input`, `enable secret`/`password`, `snmp-server
community`, `service password-encryption`).

Known gaps / watch-outs:
- **NX-OS** differs (e.g. `feature` lines, different interface defaults). Not a target yet.
- ACLs are parsed but not fully simulated in `pathTrace` (SonicWall is treated as the
  security boundary). Cisco ACL reachability is a future extension.
- Banner blocks and free-text are skipped on the `!` boundary; multi-line constructs
  outside the patterns above are ignored, not errored.
- Default admin state: only an explicit `shutdown` marks a port down.

## SonicWall (`parseSonicWall`) — readable SonicOS CLI text (NOT `.exp`)
`.exp` exports are obfuscated and are intentionally unsupported. The parser expects a
normalized, readable form derived from `show` output / documented CLI. Handled:
`interface X#`/`X#:V#` with `zone`/`ip ... netmask`/`vlan`/`comment`,
`address-object` (host/network/range, optional zone), `service-object`,
`access-rule from <z> to <z>` with `action`/`source`/`destination`/`service` and
enable/disable, `nat-policy` (original/translated/outbound-interface), DHCP scopes,
`route-policy`, and WAN ping/management hints.

Known gaps / watch-outs:
- Real SonicOS syntax varies by version; the accepted form is a clean superset, not
  byte-exact SonicOS. Document the accepted format for users (the UI says "CLI readable
  text"). If you add real-export parsing, do it behind a clearly separate path.
- Address/service **groups** are not expanded yet (only individual objects).
- Unknown object names in a rule are treated as no-match (conservative — avoids false allows).

## When extending
- Keep additions inside the existing `parse*` flush/`!`-boundary structure.
- Add a focused fixture + assertion to `test/facet.test.js`.
- Mirror any engine change into the embedded copy in `app/facet.html` (see ARCHITECTURE).
