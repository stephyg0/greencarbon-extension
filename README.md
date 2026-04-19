# GreenCarbon Field Mapper

Live app: https://greencarbon-extension.vercel.app/

Working UI prototype for a farmer logbook and field polygon mapping workflow. The app serves static HTML screens with shared JavaScript behavior, persists farmer/profile and polygon data through Supabase, and keeps a local-storage fallback for offline or not-yet-configured states.

## Quick Test

Clone the project, install dependencies, and start the local server:

```bash
git clone <repo-url>
cd greencarbon-extension
npm install
npm run dev
```

Then open:

```text
http://127.0.0.1:3000
```

If port `3000` is busy, the server will try the next available port and print the URL in the terminal.

## Dependencies

Required local tools:

- Node.js
- npm

Install project packages with:

```bash
npm install
```

Runtime npm packages:

- `@supabase/supabase-js`: Supabase client used by the local Node server.
- `@supabase/ssr`: Supabase SSR helpers included for the existing Supabase utility files.

Browser-loaded libraries:

- Leaflet: loaded from `https://unpkg.com/leaflet@1.9.4` for map rendering and polygon drawing.
- Tailwind CSS: loaded from `https://cdn.tailwindcss.com` for page styling.
- Google Fonts: Inter and Material Symbols for typography and icons.

## What This App Does

The app has four main screens:

- Summary: shows overall farmer and polygon statistics, plus a Leaflet map preview.
- Logbook: editable farmer rows with irrigation, drainage, fertilizer, notes, ID, and group data.
- Map: drawing tool for collecting a field boundary polygon.
- Conflict review: review screen for declared farmer acreage versus mapped polygon area.

The current flow is:

1. A farmer creates a profile by clicking the profile image in the top navigation.
2. That profile is stored locally as the active signed-in farmer and synced to Supabase.
3. The farmer can then use the Map page Draw tool.
4. When the farmer collects an area, the polygon is saved with the active farmer ID, name, group, area, coordinates, and logbook snapshot.
5. The Summary map loads saved polygons from Supabase and displays them in blue.

## Run Locally

Install dependencies:

```bash
npm install
```

Start the local server:

```bash
npm run dev
```

By default the app serves from:

```text
http://127.0.0.1:3000
```

If port `3000` is busy, the server tries the next port.

Useful routes:

- `/summary`
- `/logbook`
- `/map`
- `/conflict`
- `/api/supabase/status`
- `/api/farmer-profiles`
- `/api/field-polygons`

## Deploy To Vercel

This project is configured for Vercel with:

- `vercel.json` rewrites for the app routes.
- Vercel Functions in `api/` for the Supabase API routes.
- Static HTML screens served directly from `stitch_agri_logbook_field_mapper/`.

Before deploying, add the Supabase environment variables in Vercel:

```text
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_or_anon_key
```

Dashboard deploy:

1. Push the repository to GitHub.
2. In Vercel, create a New Project and import the repository.
3. Use the `Other` framework preset if Vercel asks.
4. Keep the install command as `npm install`.
5. Use `npm run build` as the build command.
6. Add the Supabase environment variables.
7. Deploy.

CLI deploy:

```bash
npm install
npm run build
vercel
vercel --prod
```

After deployment, check:

```text
/summary
/logbook
/map
/conflict
/api/supabase/status
```

## Environment Variables

Create `.env.local` in the project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_or_anon_key
```

The Node server reads `.env.local` through `supabase-client.js`.

## Supabase Setup

Open your Supabase project, go to SQL Editor, paste the contents of `supabase-schema.sql`, and run it.

The schema creates two tables:

- `farmer_profiles`
- `field_polygons`

It also enables Row Level Security and adds prototype-friendly anonymous read/write policies.

For production, tighten these policies and use real Supabase Auth. The current prototype uses a local active profile, not password/email authentication.

## Database Tables

### farmer_profiles

Stores one profile per farmer.

Columns:

- `id`: generated primary key.
- `farmer_id`: human-readable unique farmer identifier, for example `Farmer 3`.
- `name`: farmer name.
- `field_group`: farmer group, for example `Group A`.
- `logbook_data`: JSON snapshot of the farmer's current logbook details.
- `created_at`: creation timestamp.

### field_polygons

Stores drawn field boundaries.

Columns:

- `id`: generated primary key.
- `farmer_id`: references `farmer_profiles.farmer_id`.
- `farmer_name`: copied farmer name for easy display.
- `field_group`: copied group for easy display.
- `area_ha`: calculated polygon area in hectares.
- `latlngs`: JSON array of polygon coordinates.
- `logbook_data`: JSON snapshot of the farmer logbook info at the time the polygon was collected.
- `created_at`: creation timestamp.

## Profile Sign-In Flow

Click the profile image in the top navigation.

The app prompts for:

- Farmer name
- Farmer ID
- Field group

After submission:

- The profile is added to local storage.
- The profile becomes the active signed-in farmer.
- The profile is synced to Supabase through `/api/farmer-profiles/sync`.

The active profile is stored in local storage under:

```text
greencarbon-active-profile
```

This is a prototype sign-in model. It identifies the active farmer in the browser, but it is not secure authentication.

## Logbook Flow

The Logbook page:

- Renders farmer rows from local storage immediately.
- Automatically pulls fresh farmer profiles from Supabase on page load.
- Lets rows be edited directly.
- Saves edited rows with the Save Changes button.

Saving sends rows to `/api/farmer-profiles/sync`, which upserts rows into `farmer_profiles`.

Logbook fields saved into `logbook_data` include:

- `entryDate`
- `irrigationStatus`
- `irrigationAmount`
- `drainageStatus`
- `fertilizerType`
- `fertilizerAmount`
- `notes`
- `areaHa`
- `areaM2`

## Drawing And Polygon Persistence

On the Map page:

1. Click the profile image and create a profile if no farmer is signed in.
2. Click Draw.
3. Sketch the field boundary on the map.
4. Click Collect Area.

Drawing is blocked until a profile exists. This ensures every collected polygon has an owner.

When a polygon is collected:

- The app calculates area in hectares.
- The polygon is saved locally under `greencarbon-collected-areas`.
- The polygon is posted to `/api/field-polygons`.
- The server upserts the farmer profile first.
- The server inserts the polygon into `field_polygons`.

The polygon payload includes:

- Active farmer ID
- Active farmer name
- Active farmer group
- Polygon area
- Polygon coordinates
- Current farmer logbook snapshot

## Summary Map Behavior

The Summary map renders imported project polygons from `farmer-app-data.js`.

It also fetches polygons from Supabase with `/api/field-polygons` and overlays saved collected fields in blue. Popup details include:

- Polygon label
- Farmer name
- Farmer group
- Logbook details attached to the polygon

Locally saved unsynced polygons can still appear on the Summary map. After a polygon syncs successfully, the local copy is marked as synced to avoid duplicate display.

## API Endpoints

### GET `/api/supabase/status`

Checks whether Supabase is configured and both tables are reachable.

Returns counts for:

- `farmer_profiles`
- `field_polygons`

### GET `/api/farmer-profiles`

Returns all farmer profiles ordered by creation time.

### POST `/api/farmer-profiles/sync`

Upserts a list of farmer profiles by `farmer_id`.

Expected body:

```json
{
  "profiles": [
    {
      "farmerId": "Farmer 1",
      "farmerName": "Amina Kato",
      "fieldGroup": "Group A",
      "logbookData": {}
    }
  ]
}
```

### GET `/api/field-polygons`

Returns all saved field polygons ordered by creation time.

### POST `/api/field-polygons`

Saves a field polygon and links it to a farmer.

Expected body:

```json
{
  "farmerId": "Farmer 1",
  "farmerName": "Amina Kato",
  "fieldGroup": "Group A",
  "areaHa": 0.42,
  "latlngs": [
    [18.88, 105.51],
    [18.881, 105.511],
    [18.879, 105.512]
  ],
  "logbookData": {
    "entryDate": "2026-04-19",
    "irrigationStatus": "Watered",
    "irrigationAmount": "240 L",
    "drainageStatus": "Good",
    "fertilizerType": "Urea",
    "fertilizerAmount": "12 kg",
    "notes": "Routine morning field check."
  }
}
```

## Key Files

- `server.js`: local Node HTTP server and API routes.
- `supabase-client.js`: reads `.env.local` and creates the Supabase client.
- `ui-actions.js`: shared browser behavior for routing, logbook, profile prompts, maps, and Supabase sync.
- `supabase-schema.sql`: database schema and RLS policies.
- `farmer-app-data.js`: imported farmer and polygon data used by the UI.
- `stitch_agri_logbook_field_mapper/*/code.html`: HTML screens served by the app.

## Local Storage Keys

The app uses local storage for responsiveness and offline fallback:

- `greencarbon-logbook-farmers`: local logbook/farmer rows.
- `greencarbon-active-profile`: active signed-in farmer profile.
- `greencarbon-collected-areas`: locally saved collected polygons.

## Troubleshooting

### Supabase tables are missing

Open `/api/supabase/status`. If it reports missing tables, run `supabase-schema.sql` in the Supabase SQL Editor.

### Profile saves locally but not to Supabase

Check:

- `.env.local` has `NEXT_PUBLIC_SUPABASE_URL`.
- `.env.local` has `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- `supabase-schema.sql` has been run.
- RLS policies exist on both tables.

### Drawing does not start

Create a farmer profile first by clicking the profile image. Drawing is intentionally blocked until a profile is active.

### Polygon does not appear on Summary

Check:

- The polygon was collected on the Map page.
- `/api/field-polygons` returns the polygon.
- The Summary page was refreshed after collection.

Unsynced local polygons should still appear, but Supabase-backed polygons are the source of truth once sync succeeds.

## Production Notes

This is a prototype. Before production:

- Replace local profile sign-in with Supabase Auth.
- Scope RLS policies to authenticated users.
- Add ownership columns such as `auth_user_id`.
- Avoid anonymous writes.
- Add validation for polygon geometry and logbook values.
- Add migrations instead of manually running SQL from the editor.
