--- Klover frontend


- in folderu cu readme
npm install
npm run dev


Set `VITE_API_URL` sa arate la alt backend, defaults la
`http://127.0.0.1:3001/api`.

--- Screens

| Route | Screen |
| --- | --- |
| `/login` | Sign in and registration |
| `/` | Main — active zones, todays use, plaoie chance, urm schedule |
| `/watering` | Manual run cu duratie costumizabila si un countdown |
| `/schedules` | Weekly grid in UTC, per-schedule editing, shared rain threshold |
| `/activity` | Stacked usage chart (azi dupa ora, sapt/luna dupa zi) |
| `/weather` | Live 24/7 Open-Meteo forecast, cu locatie, baza de date |

## Structure

```
src/
  api/          client.ts (fetch wrapper, session storage, adapters) + types.ts
  hooks/        useAuth (session context), useAsync (load/poll/refresh)
  components/
    ui/         Button, Card, Stat, Badge, Toggle, fields, Modal, RowMenu, toasts, icons
    layout/     AppShell (sidebar + page head)
    UsageChart  stacked bar chart
  pages/        one file + one stylesheet per screen
  lib/          format.ts (UTC formatting) and zoneImages.ts
```
