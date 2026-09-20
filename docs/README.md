# 📚 BawatPieza Documentation

Welcome! This folder documents the **BawatPieza** platform — a waste-to-energy
monitoring system made of two applications that live in this repository:

| App | Folder | What it is |
| --- | --- | --- |
| **Mobile app** | `BawatPiezaApp/` | Expo (SDK 57) + React Native app — the product users hold |
| **Backend API** | `backend/` | Express (TypeScript) REST API — auth, e-mail, account management |

The mobile app talks to the backend API for anything involving e-mail, one-time
codes, and account administration, and talks **directly to Supabase** for
sessions, profile rows, and avatar storage.

---

## 🗂 Folder layout

```
docs/
├── README.md            ← you are here
├── getting-started.md   ← install, configure, run everything
├── architecture.md      ← how the pieces fit together
├── configuration.md     ← every environment variable explained
├── security.md          ← 2FA, OTP, brute-force & fraud-alert model
├── database.md          ← Supabase tables, RLS, storage, triggers
├── troubleshooting.md   ← common problems and fixes
│
├── features/            ← one file per integrated mobile feature
│   ├── README.md              ← feature map + data status (live vs demo)
│   ├── onboarding.md
│   ├── signup.md
│   ├── login-two-factor.md
│   ├── google-sign-in.md
│   ├── forgot-password.md
│   ├── terms-and-conditions.md
│   ├── home-dashboard.md
│   ├── energy-monitoring.md
│   ├── power-management.md
│   ├── schedule.md
│   ├── reports.md
│   ├── profile-management.md
│   ├── preferences.md
│   ├── shared-users.md
│   ├── device-diagnostics.md
│   └── about.md
│
└── api/                 ← REST API reference (backend)
    ├── README.md              ← base URL, auth model, error format
    ├── health.md
    ├── accounts.md
    ├── two-factor.md
    └── email.md
```

---

## 🚀 Quick navigation

**I want to…**

- **Run the project for the first time** → [getting-started.md](getting-started.md)
- **Understand how the app and backend communicate** → [architecture.md](architecture.md)
- **Know what a screen does** → [features/](features/README.md)
- **Call or extend the REST API** → [api/](api/README.md)
- **Set environment variables** → [configuration.md](configuration.md)
- **Understand the login security flow** → [security.md](security.md)
- **Change the database schema** → [database.md](database.md)
- **Fix a broken setup** → [troubleshooting.md](troubleshooting.md)

---

## 🧭 The 60-second version

1. **First launch** of the app shows an onboarding walkthrough, then the login screen.
2. **Signing in** requires email + password **and** a 6-digit code sent by e-mail
   (two-factor). The backend verifies the password, parks the Supabase session in
   Redis, and only releases it after the code is verified.
3. **Google Sign-In** and **email/password sign-up** create accounts straight in
   Supabase Auth; a welcome e-mail is triggered for brand-new accounts.
4. **Forgot password** uses the same OTP machinery (e-mail code → one-time reset
   token → new password).
5. Inside the app: Home, Energy, Power Management (heatmap), Schedule, Reports,
   Profile hub (account, preferences, device diagnostics, shared users, about).
   Some of these pages currently render **demo data** — see the status table in
   [features/README.md](features/README.md).
