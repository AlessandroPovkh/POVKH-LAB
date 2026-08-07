# Garment 3D Source Audit — 2026-08-07

**Job to be done:** obtain a commercially safe, reproducible hoodie mesh or tool that improves the hood silhouette without changing the approved oversized product or exact POVKH LAB artwork.

| Candidate | Source / revision | License | Fit | Safety / maintenance | Verdict |
| --- | --- | --- | --- | --- | --- |
| GarmentCode | [GitHub](https://github.com/maria-korosteleva/GarmentCode/commit/d449629979028123a5c4dc9e732a2ec19b7fce31), `d449629` | MIT for the framework | Parametric patterns and a bundled hoodie specification are strong research inputs | Final draping requires the custom NvidiaWarp-GarmentCode fork; the documented macOS path can run zero physics because it tests `OSX` instead of `Darwin` | reject for release |
| NvidiaWarp-GarmentCode | [GitHub](https://github.com/maria-korosteleva/NvidiaWarp-GarmentCode/commit/63baf6855efdd89b2834b74640f84b3bb0d86b50), `63baf68` | NVIDIA Source Code License, non-commercial research/evaluation | Supplies GarmentCode's required XPBD constraints | Proprietary/non-commercial restriction is incompatible with commercial merch; native Apple Silicon build is also fragile | reject |
| MakeHuman Hooded Sweat Jacket1 | [official pack](https://static.makehumancommunity.org/assets/assetpacks/shirts02.html), author Elvaerwyn, observed 2026-08-07 | CC-BY, version unspecified on the official page | Complete UVs and web-suitable topology; visually a fitted garment rather than the approved oversized hoodie | Download requires no account; attribution would be required; substantial reshaping and validation remain | keep as future donor candidate, do not bundle |
| MakeHuman core assets | [GitHub](https://github.com/makehumancommunity/makehuman-assets) | CC0 | Commercially clean references | No complete hoodie in the core pack | reject for this task |
| `arjun988/blender-skills` cloth-sim | [SKILL.md](https://github.com/arjun988/blender-skills/blob/main/.claude/skills/cloth-sim/SKILL.md) | MIT | Generic Blender cloth checklist | No mesh, script, hoodie construction, UV, GLB budget or validation automation; Blender is not installed | do not install |
| Pixal3D-mac | [GitHub](https://github.com/pawel-mazurkiewicz/Pixal3D-mac) | MIT code, vendored components retain their own licenses | Apple-Silicon image-to-3D proof of concept | Developed on 128 GB; this machine has 24 GB RAM and only 24 GB free disk, while the pipeline needs large model weights and native builds; single-image reconstruction would also risk logo and rear-view hallucination | reject for this release |

## Decision

No external skill, repository code or mesh is installed or copied into the product. The release uses the existing first-party concept GLB with a governed catalog-orbit constraint. This preserves the selected silhouette, exact artwork, dependency footprint and commercial clarity.

## Provenance registry

This document is the stable project registry for the candidates inspected in this research wave. No runtime mirror exists because every candidate was rejected or deferred before installation. Future evaluation should start from the pinned revisions and observed source details above rather than rediscovering them.
