# CompassCAD Mobile

This is where CompassCAD will develop its mobile lineup with the codename Undifer (because I got no more names to come up with)

## Engine & renderer (merged from NextDesktop)

`app/editor/engine/` is the NextDesktop engine. `Engine.ts` is **generated**:

```sh
git clone https://github.com/CompassCAD/NextDesktop ../NextDesktop
bun run sync-engine ../NextDesktop    # re-run after every upstream merge
```

The engine only talks to `Context2DLike` (`app/editor/render`), implemented by:
- `GLESBackend` (default): CPU tessellation + one batched GLES draw per frame via `expo-gl`.
- `Canvas2DBackend`: the old `react-native-canvas` path, kept as fallback (`/editor?backend=canvas2d`).

```sh
bun install
bun run typecheck && bun test
bunx expo run:android   # or: bunx expo start --dev-client
```
