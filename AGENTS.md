# AGENTS.md

## Cursor Cloud specific instructions

### Project Overview

Static HTML/CSS/JS real estate website ("B F Marques Empreendimentos") backed by Firebase (Auth, Firestore, Cloud Storage, Cloud Functions). No build step, no bundler, no root `package.json`.

### Running the Frontend

Serve the workspace root with any static HTTP server:

```
npx serve -l 8080 /workspace
```

Key pages: `index.html` (main site), `admin-login.html` / `admin.html` (admin panel), `calculadora.html` (financing calculator), `client-area.html` (client portal), `mcmv.html` (MCMV info).

### Firebase Cloud Functions

Located in `functions/`. Install deps with `cd functions && npm install`. Functions require Node 20 (`engines` field), but Node 22 works with a warning.

### Lint / Tests / Build

There are **no linter, no automated tests, and no build step** configured in this repository. The frontend is vanilla HTML/CSS/JS loaded directly by the browser.

### Admin Login (hardcoded, client-side)

The admin credentials are hardcoded in `admin-login.html` (not in the README). Check the source of that file for current credentials.

### Known JS Console Errors

- `reservations` variable re-declaration error appears on several pages (duplicate script loading).
- `updateSimDisplay` TypeError on `calculadora.html` — does not block core calculator functionality.

### Firebase Configuration

Firebase project config is hardcoded in `js/firebase.js`. The frontend talks directly to the live Firebase project. For local-only development without Firebase, the site gracefully falls back to localStorage for most features (e.g., reservations, admin data).
