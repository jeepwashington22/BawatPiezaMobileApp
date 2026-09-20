# Onboarding Walkthrough

- **Route:** `/` (via the entry gate in `src/app/index.tsx`)
- **Source:** `BawatPiezaApp/src/app/onboarding.tsx`, `src/app/index.tsx`
- **Status:** static slides — no network calls

---

## What it does

The very first time the app is opened, `src/app/index.tsx` shows the onboarding
walkthrough instead of the login screen. The walkthrough introduces BawatPieza
with a few slides (skip / finish supported).

The "seen" state is a single AsyncStorage flag:

```
bawatpieza.onboarding.seen = '1'
```

- Finish **or skip** → flag is set → the login screen renders.
- Every later launch → login screen directly.
- While the flag is being read, `index.tsx` returns `null` so the splash screen
  covers the decision instead of flashing the wrong screen.

---

## Resetting onboarding (development)

Clear the flag to see the walkthrough again:

```ts
await AsyncStorage.removeItem('bawatpieza.onboarding.seen');
```

or clear app storage in Expo Dev Menu / device settings.

## Notes for contributors

- The gate lives entirely in `src/app/index.tsx` — onboarding and login are
  normal components, not separate routes, which keeps the flow airtight
  (no deep-linking past the gate).
- To add a slide, edit `onboarding.tsx`; keep each slide self-contained so the
  layout stays stable across device sizes.
