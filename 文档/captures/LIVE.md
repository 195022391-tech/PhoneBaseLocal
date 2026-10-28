# Live capture notes (2026-10-28)

## Stack that worked
- Desktop backend **1.0.21** (`local-1.0.21-20261027-1`) on `http://127.0.0.1:13000`
- Phone base **1.0.12** at `192.168.9.6:11019` (`licenseRequired`, `phonebase-commercial-v1`)
- Official host **1.0.15 cannot** license this phone (no `local-owner`); keep using 1.0.21 standalone.

## Video `/view/{id}`
- Files: `view_000.bin` … `view_005.bin`, index `phb1_index.json`
- Live avcC: profile `avc1.420020`, 1×SPS (11B, type7), 1×PPS (4B, type8)
- flags: 2 config → 1 key → 0 delta… matches `VIDEO_PROTOCOL.md`

## Control `/control/{id}`
- `control_capture.json`: ready + pointer down/up + ack ok
- Required: `geometryRevision` + `frameTimestampUs` from current PHB1 ts (offset 8 BE u64)

## License (pktmon → `license11019.pcap`)
- Seen HTTP to phone: `/api/license/identity`, `/api/license/proof` (+ strings `local-lease` / `local-owner`)
- Samples: `license_http_samples.json`

## Caveat
- After DELETE device, cloud returned `release_pending` until **2026-10-30 00:00 +08**; quota `used=1, remaining=0, bound=0` — cannot re-add until then.
