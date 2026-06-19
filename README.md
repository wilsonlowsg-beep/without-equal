# WITHOUT EQUAL — Daily Readiness System

Formation daily readiness and availability system. Mobile-first command dashboard for AC3 and Group Heads to track personnel availability in real time.

---

## Deploy in 4 Steps

### Step 1 — Supabase Setup

1. Go to [supabase.com](https://supabase.com) → New project
2. Name it `without-equal` → choose a strong password → region: **Southeast Asia (Singapore)**
3. Wait for project to provision (~2 min)
4. Go to **SQL Editor** → New query → paste the full contents of `supabase-schema.sql` → Run
5. Go to **Settings → API** → copy:
   - `Project URL` → this is your `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → this is your `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Step 2 — GitHub

```bash
# In the without-equal folder
git init
git add .
git commit -m "WITHOUT EQUAL v1.0 — initial deployment"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/without-equal.git
git push -u origin main
```

### Step 3 — Vercel Deployment

1. Go to [vercel.com](https://vercel.com) → New Project → Import your GitHub repo
2. Framework: **Next.js** (auto-detected)
3. Add Environment Variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL     = https://your-ref.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY = your-anon-key
   ```
4. Click **Deploy** → takes ~2 minutes
5. Your app is live at `https://without-equal.vercel.app`

### Step 4 — Create First Users

**Option A — Register flow (easiest)**
1. Open the app → tap **Register**
2. Create your AC3 account first
3. Then Admin → go to Admin dashboard → manage other users

**Option B — Supabase dashboard**
1. Supabase → **Authentication → Users** → Invite User
2. Then SQL Editor:
```sql
INSERT INTO users (id, personnel_type, rank, full_name, group_id, appointment, mobile, role)
VALUES (
  'paste-auth-user-id-here',
  'Military', 'BG', 'Wilson Low',
  0, 'AC3', '91234001', 'ac3'
);
```

---

## Local Development

```bash
# Clone and install
git clone https://github.com/YOUR_USERNAME/without-equal.git
cd without-equal
npm install

# Set up environment
cp .env.local.example .env.local
# Edit .env.local with your Supabase keys

# Run
npm run dev
# Open http://localhost:3000
```

---

## Auto-Leave Marking

Personnel on approved leave don't need to report daily. The system auto-marks them.

**How it works:**
- When personnel register leave via **My Leave** tab, it's stored in `leave_periods`
- On each login/page load, `SubmitStatus` checks if today falls within any approved leave period
- If yes, shows "Auto – Leave Period" state and optionally auto-inserts the submission

**For fully automatic marking (recommended for production):**

Set up a Supabase Edge Function or cron job to call:
```sql
SELECT auto_mark_leave(CURRENT_DATE);
```

Schedule via:
- Supabase **Cron Jobs** (Database → Extensions → pg_cron)
- Or Vercel Cron (add to `vercel.json`):

```json
{
  "crons": [
    {
      "path": "/api/cron/auto-mark-leave",
      "schedule": "30 0 * * *"
    }
  ]
}
```

---

## Architecture

```
without-equal/
├── app/
│   ├── layout.tsx          — Root layout, fonts, metadata
│   ├── globals.css         — All styles (CSS variables, component classes)
│   └── page.tsx            — Entry: auth check → LoginPage or AppShell
├── components/
│   ├── LoginPage.tsx       — Login, Forgot Password (OTP), Register
│   ├── AppShell.tsx        — Topbar, nav tabs, role-based routing
│   ├── SubmitStatus.tsx    — Daily status submission + auto-leave detection
│   ├── LeaveManager.tsx    — Register/view leave periods
│   ├── GroupDashboard.tsx  — Group Head view
│   ├── FormationDashboard.tsx — AC3 formation view + AI summary
│   └── OtherComponents.tsx — MyHistory, TrendsView, AdminDashboard
├── lib/
│   ├── supabase.ts         — Supabase client (browser + server)
│   └── constants.ts        — Tokens, status categories, helpers
├── types/
│   └── database.ts         — TypeScript types
├── public/
│   └── manifest.json       — PWA manifest
├── supabase-schema.sql     — Complete DB schema with RLS
└── vercel.json             — Deployment config
```

---

## Database Tables

| Table | Purpose |
|---|---|
| `users` | Personnel profiles (extends Supabase auth) |
| `groups` | Formation groups (AC3, Current, Infor, Civil, Log, Plans) |
| `daily_submissions` | Daily status per person per date |
| `leave_periods` | Approved leave with dates, type, overseas details |
| `group_reviews` | Group Head review timestamps |
| `audit_log` | All amendments and admin actions |

---

## Leave Logic

| Leave Type | Auto-marked | Daily report needed |
|---|---|---|
| Local Leave | ✅ Yes | ❌ No |
| Overseas Leave | ✅ Yes | ❌ No |
| Time Off | ✅ Yes | ❌ No |

**Overseas Leave extras:**
- Country / City
- Contactable (Yes/No)
- Emergency Contact Number
- Flagged in red if Not Contactable

---

## Role Access Matrix

| Feature | Personnel | Group Head | AC3 | Admin |
|---|---|---|---|---|
| Submit own status | ✅ | ✅ | ✅ | — |
| View own history | ✅ | ✅ | ✅ | — |
| Register leave | ✅ | ✅ | ✅ | — |
| View own group | — | ✅ | — | — |
| View formation | — | — | ✅ | ✅ |
| Generate report | — | — | ✅ | ✅ |
| Manage users | — | — | — | ✅ |

---

## Distribute to Staff

Once deployed, share the Vercel URL. Staff tap **Register** to create their own accounts.

Add the URL to home screen:
- **iPhone:** Safari → Share → Add to Home Screen
- **Android:** Chrome → Menu → Add to Home Screen

The app behaves as a PWA — works offline for viewing, submits when connected.

---

*WITHOUT EQUAL — Daily Readiness System*
