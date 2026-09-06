# World Globe

A live 3D community globe. Members drop a pin with their handle; the globe fills as people join.

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173/`. Deep links look like `/@handle`.

## Persistence

`npm run dev` and `npm run preview` expose a tiny JSON API at `/api/pins` (file: `.data/pins.json`). On Vercel the same routes use Blob storage so pins are shared. The client in [`src/storage.ts`](src/storage.ts) uses that API when it is available, and falls back to `localStorage`.

```ts
listPins(): Promise<Pin[]>
getPinByHandle(handle: string): Promise<Pin | null>
addPin(draft: PinDraft): Promise<Pin>
```

To swap in a hosted database, keep those signatures in `storage.ts`. Duplicate handles throw `DuplicateHandleError`.

## Scripts

- `npm run dev` — local server with the pins API
- `npm run build` — strict TypeScript check + production bundle
- `npm run preview` — production preview, also with the pins API
