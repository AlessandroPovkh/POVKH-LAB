# Local merch 3D pipeline

`cassette-002.glb` is authored locally from nominal viewer geometry and byte-verified canonical identity rasters. Run:

```sh
node tools/merch-3d/build-cassette-002.mjs
node tools/merch-3d/build-cassette-002.mjs --verify
node --test tools/merch-3d/cassette-002.test.mjs tests/merch-model-assets.test.mjs
```

The build is deterministic, embeds all textures, runs the official glTF Validator, and derives byte, triangle, draw-call, mechanics, registration, and source-integrity evidence from the produced artifact. Generated reports contain no timestamps or machine paths.

With the built site served at `http://127.0.0.1:4173`, refresh the six desktop/mobile default/front/rear QA views and the readability crop with:

```sh
node tools/merch-3d/capture-cassette-002.mjs
```

These captures apply the governed source camera metadata for asset QA. Production integration must pass `orbit`, desktop/mobile `fieldOfView`, and mobile `cameraTarget` through the viewer registry before the same framing can be claimed as the live default.

`hoodie-001.decision.json` deliberately blocks a fabricated garment model until an authoritative mesh or approved physical-sample turntable capture exists.
