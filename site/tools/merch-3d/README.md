# Local merch 3D pipeline

`cassette-002.glb` is authored locally from nominal viewer geometry and byte-verified canonical identity rasters. Run:

```sh
node tools/merch-3d/build-cassette-002.mjs
node tools/merch-3d/build-cassette-002.mjs --verify
node --test tools/merch-3d/cassette-002.test.mjs tests/merch-model-assets.test.mjs
```

The build is deterministic, embeds all textures, runs the official glTF Validator, and derives byte, triangle, draw-call, mechanics, registration, and source-integrity evidence from the produced artifact. Generated reports contain no timestamps or machine paths.

`hoodie-001.decision.json` deliberately blocks a fabricated garment model until an authoritative mesh or approved physical-sample turntable capture exists.
