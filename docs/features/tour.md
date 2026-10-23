# App Quick Tour

- **Route:** triggered on `/home` (first login) and replayable from `/pages/profile`
- **Source:** `BawatPiezaApp/src/hooks/use-app-tour.tsx`, `BawatPiezaApp/src/components/app-tour-overlay.tsx`, `BawatPiezaApp/src/app/_layout.tsx`
- **Status:** 🟡 demo flow — pure client-side walkthrough, no network calls

---

## What it does

The very first time a user signs in, the dashboard shows a welcome card offering a 30-second, five-step quick tour. Each step spotlights one part of the home screen with a dimmed scrim, a rounded cut-out around the target, and a tooltip card describing it. The tour auto-scrolls the dashboard so each target is visible, then the user taps **Next** to walk through all steps or **Skip** / **Done** to finish.

Once finished (or skipped), the tour never auto-launches again. It can be replayed anytime from the **Help** section of the Profile screen ("Replay quick tour").

---

## Tour steps (in order)

| # | Target | What it explains |
|---|--------|------------------|
| 1 | Live power readings | Voltage, power draw and footsteps update in real time. |
| 2 | Battery health | Hub charge level; tap the card to open Quick Overrides and force grid or battery. |
| 3 | Your zones | Toggle a zone on/off, or open one for its live readout, schedule and thresholds. |
| 4 | Footsteps become energy | Every step on a tile becomes energy; the heatmap shows the most-walked tiles. |
| 5 | Move around fast | Bottom bar jumps to Power, Reports and Profile; the centre flash button opens Quick Overrides. |

---

## How it works

`AppTourProvider` (mounted above the auth gate in `_layout.tsx`) holds the tour state in React context:

- `status` — `'idle'` | `'welcome'` | `'running'`
- `stepIndex` / `step` / `totalSteps` — the current spotlight step
- `checked` / `completed` / `welcomeSeen` — persisted AsyncStorage flags
- `registerTarget` / `unregisterTarget` / `getTargetRef` — each `TourSpot` registers its native view so the overlay can measure it
- `scrollContainerRef` / `getScrollOffsetY` — the dashboard `ScrollView` and its offset, used to scroll each target into view

Persistence lives in AsyncStorage:

```
bawatpieza.tour.completed = '1'   # tour finished or skipped — stops auto-launch
bawatpieza.tour.welcomeSeen = '1'  # welcome card dismissed — stops the prompt
```

`TourSpot` wraps a dashboard element (via `cloneElement`, so the original layout is untouched) and registers its ref. `AppTourOverlay` measures the current target with `measureInWindow`, scrolls the `ScrollView` to reveal it, draws the SVG spotlight cut-out, and positions the tooltip card above or below the target depending on available space.

---

## For contributors

- To change the copy or order, edit `TOUR_STEPS` in `src/hooks/use-app-tour.tsx`.
- To add a new target, add an id to `TourTargetId`, push a step to `TOUR_STEPS`, and wrap the element in `<TourSpot id="...">` on the host screen.
- The overlay mounts once in `_layout.tsx` (`{isLoggedIn && <AppTourOverlay />}`) so it works app-wide without per-screen wiring.
- The tour only mounts for logged-in users; the welcome card auto-opens on the first dashboard load via `home/index.tsx`.
