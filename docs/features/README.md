# Features

One document per integrated feature of the mobile app. Each file covers: the
route, the source files, what the user experiences, which API/Supabase calls
it makes, and its current data status.

---

## Feature map

| Feature | Route | Doc | Data |
| --- | --- | --- | --- |
| Onboarding walkthrough | `/` (first launch) | [onboarding.md](onboarding.md) | static slides |
| Sign up (email + password) | `/signup` | [signup.md](signup.md) | 🟢 live (Supabase) |
| Login with two-factor OTP | `/login` | [login-two-factor.md](login-two-factor.md) | 🟢 live |
| Google Sign-In | `/login`, `/signup` | [google-sign-in.md](google-sign-in.md) | 🟢 live |
| Forgot password (OTP reset) | `/forgot-password` | [forgot-password.md](forgot-password.md) | 🟢 live |
| Terms & Conditions gate | modal on signup | [terms-and-conditions.md](terms-and-conditions.md) | 🟢 live |
| Home dashboard | `/home` | [home-dashboard.md](home-dashboard.md) | 🟡 demo data |
| Energy monitoring | `/pages/energy` | [energy-monitoring.md](energy-monitoring.md) | 🟡 demo data |
| Power management (heatmap) | `/pages/heatmap` | [power-management.md](power-management.md) | 🟡 demo data |
| Schedule (calendar) | `/pages/schedule` | [schedule.md](schedule.md) | 🟡 demo data |
| Reports & forecast | `/pages/reports` | [reports.md](reports.md) | 🟡 demo data |
| Profile hub + avatar | `/pages/profile` | [profile-management.md](profile-management.md) | 🟢 live |
| My Account / edit profile | `/pages/edit-profile` | [profile-management.md](profile-management.md) | 🟢 live |
| Preferences & theme | `/pages/preferences` | [preferences.md](preferences.md) | 🟡 mixed |
| Shared Users (admin) | `/pages/accounts` | [shared-users.md](shared-users.md) | 🟢 live |
| Device diagnostics | `/pages/device` | [device-diagnostics.md](device-diagnostics.md) | 🟢 live |
| About | `/pages/about` | [about.md](about.md) | static |

🟢 **live** — reads/writes real data (Supabase or the backend API).
🟡 **demo data** — UI is complete but numbers are hard-coded placeholders that
mirror the web dashboard, ready to be swapped for real queries.

---

## Cross-cutting concerns

- **Navigation** — `src/constants/navigation.ts` defines every destination in
  three sections (Overview / Account / Support); both the side menu (burger →
  `side-menu.tsx`) and the bottom nav (`bottom-nav.tsx`) render from it.
- **Theming** — `src/theme/index.tsx` provides a light/dark `ThemeProvider`;
  Poppins is the app-wide font family (loaded in `_layout.tsx`).
- **Network resilience** — `src/lib/network.ts` + `components/network-banner.tsx`:
  every screen shows user-friendly, classified errors
  (offline / unstable / rate-limited / timeout).
- **Validation** — `src/lib/validation.ts` centralizes form rules and turns
  Supabase auth errors into actionable copy.
- **Shared UI kit** — `components/glass-ui.tsx` (cards, toggles, live dots),
  `screen-shell.tsx`, `content-card.tsx`, `tile-loader.tsx`, `top-bar.tsx`.
