-- ============================================================
-- WITHOUT EQUAL — Daily Readiness System
-- Database Schema + Security
-- Run entirely in Supabase SQL Editor
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── GROUPS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS groups (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  short_name TEXT NOT NULL
);

INSERT INTO groups (id, name, short_name) VALUES
  (0, 'AC3',     'AC3'),
  (1, 'Current', 'CUR'),
  (2, 'Infor',   'INF'),
  (3, 'Civil',   'CIV'),
  (4, 'Log',     'LOG'),
  (5, 'Plans',   'PLN')
ON CONFLICT (id) DO NOTHING;

-- ── USERS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  personnel_type TEXT NOT NULL CHECK (personnel_type IN ('Military','Civilian')),
  rank           TEXT,
  title          TEXT,
  full_name      TEXT NOT NULL,
  group_id       INTEGER NOT NULL REFERENCES groups(id),
  appointment    TEXT NOT NULL,
  mobile         TEXT UNIQUE NOT NULL,
  role           TEXT NOT NULL DEFAULT 'personnel'
                 CHECK (role IN ('personnel','grouphead','ac3','admin')),
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── DAILY SUBMISSIONS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_submissions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submission_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status          TEXT NOT NULL,
  remarks         TEXT,
  submitted_at    TIMESTAMPTZ DEFAULT NOW(),
  is_amended      BOOLEAN DEFAULT FALSE,
  amend_reason    TEXT,
  amended_at      TIMESTAMPTZ,
  is_auto         BOOLEAN DEFAULT FALSE,
  auto_reason     TEXT,
  UNIQUE(user_id, submission_date)
);

-- ── LEAVE PERIODS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_periods (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  leave_type        TEXT NOT NULL CHECK (leave_type IN ('Local Leave','Overseas Leave','Time Off')),
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  country           TEXT,
  city              TEXT,
  contactable       BOOLEAN DEFAULT TRUE,
  emergency_contact TEXT,
  remarks           TEXT,
  status            TEXT NOT NULL DEFAULT 'approved'
                    CHECK (status IN ('pending','approved','cancelled')),
  approved_by       UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_dates CHECK (end_date >= start_date)
);

-- ── GROUP REVIEWS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_reviews (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id    INTEGER NOT NULL REFERENCES groups(id),
  review_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reviewed_by UUID NOT NULL REFERENCES users(id),
  reviewed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, review_date)
);

-- ── AUDIT LOG ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID REFERENCES users(id),
  action     TEXT NOT NULL,
  old_value  JSONB,
  new_value  JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_subs_user_date ON daily_submissions(user_id, submission_date);
CREATE INDEX IF NOT EXISTS idx_subs_date      ON daily_submissions(submission_date);
CREATE INDEX IF NOT EXISTS idx_leave_user     ON leave_periods(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_dates    ON leave_periods(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_users_group    ON users(group_id);
CREATE INDEX IF NOT EXISTS idx_reviews_date   ON group_reviews(review_date);

-- ============================================================
-- SECURITY — Role helper functions
-- ============================================================

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM users WHERE id = auth.uid() AND is_active = TRUE;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_my_group()
RETURNS INTEGER AS $$
  SELECT group_id FROM users WHERE id = auth.uid() AND is_active = TRUE;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_periods     ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_reviews     ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log         ENABLE ROW LEVEL SECURITY;

-- ── USERS ────────────────────────────────────────────────────
-- Drop existing policies cleanly
DROP POLICY IF EXISTS "u_own"        ON users;
DROP POLICY IF EXISTS "u_grouphead"  ON users;
DROP POLICY IF EXISTS "u_ac3_admin"  ON users;
DROP POLICY IF EXISTS "u_update_own" ON users;
DROP POLICY IF EXISTS "u_admin_write"ON users;

-- Personnel: only see themselves
CREATE POLICY "u_own" ON users
  FOR SELECT USING (id = auth.uid());

-- Group Head: see own group
CREATE POLICY "u_grouphead" ON users
  FOR SELECT USING (
    get_my_role() = 'grouphead'
    AND group_id = get_my_group()
  );

-- AC3 + Admin: see everyone
CREATE POLICY "u_ac3_admin" ON users
  FOR SELECT USING (get_my_role() IN ('ac3','admin'));

-- Anyone: update own non-sensitive fields
CREATE POLICY "u_update_own" ON users
  FOR UPDATE USING (id = auth.uid());

-- Admin only: insert, change roles, deactivate
CREATE POLICY "u_admin_write" ON users
  FOR ALL USING (get_my_role() = 'admin');

-- Block role self-promotion
CREATE OR REPLACE FUNCTION block_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
  IF (OLD.role != NEW.role OR OLD.group_id != NEW.group_id OR OLD.is_active != NEW.is_active) THEN
    IF get_my_role() != 'admin' THEN
      RAISE EXCEPTION 'Only admins can change roles, groups, or active status';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_role_protection ON users;
CREATE TRIGGER enforce_role_protection
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION block_role_escalation();

-- ── DAILY SUBMISSIONS ────────────────────────────────────────
DROP POLICY IF EXISTS "ds_own"       ON daily_submissions;
DROP POLICY IF EXISTS "ds_grouphead" ON daily_submissions;
DROP POLICY IF EXISTS "ds_ac3_admin" ON daily_submissions;

-- Own submissions
CREATE POLICY "ds_own" ON daily_submissions
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Group Head: read own group's submissions
CREATE POLICY "ds_grouphead" ON daily_submissions
  FOR SELECT USING (
    get_my_role() = 'grouphead'
    AND user_id IN (
      SELECT id FROM users WHERE group_id = get_my_group()
    )
  );

-- AC3 + Admin: read all submissions
CREATE POLICY "ds_ac3_admin" ON daily_submissions
  FOR SELECT USING (get_my_role() IN ('ac3','admin'));

-- ── LEAVE PERIODS ────────────────────────────────────────────
DROP POLICY IF EXISTS "lp_own"       ON leave_periods;
DROP POLICY IF EXISTS "lp_grouphead" ON leave_periods;
DROP POLICY IF EXISTS "lp_ac3_admin" ON leave_periods;
DROP POLICY IF EXISTS "lp_manage"    ON leave_periods;

-- Own leave
CREATE POLICY "lp_own" ON leave_periods
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Group Head: read own group's leave
CREATE POLICY "lp_grouphead" ON leave_periods
  FOR SELECT USING (
    get_my_role() = 'grouphead'
    AND user_id IN (
      SELECT id FROM users WHERE group_id = get_my_group()
    )
  );

-- AC3 + Admin: read all leave
CREATE POLICY "lp_ac3_admin" ON leave_periods
  FOR SELECT USING (get_my_role() IN ('ac3','admin'));

-- Group Head + AC3 + Admin: can update (approve/cancel) leave
CREATE POLICY "lp_manage" ON leave_periods
  FOR UPDATE USING (get_my_role() IN ('grouphead','ac3','admin'));

-- ── GROUP REVIEWS ────────────────────────────────────────────
DROP POLICY IF EXISTS "gr_grouphead" ON group_reviews;
DROP POLICY IF EXISTS "gr_ac3_admin" ON group_reviews;

-- Group Head: manage own group review
CREATE POLICY "gr_grouphead" ON group_reviews
  FOR ALL USING (
    get_my_role() = 'grouphead'
    AND group_id = get_my_group()
  )
  WITH CHECK (
    get_my_role() = 'grouphead'
    AND group_id = get_my_group()
  );

-- AC3 + Admin: read all reviews
CREATE POLICY "gr_ac3_admin" ON group_reviews
  FOR SELECT USING (get_my_role() IN ('ac3','admin'));

-- ── AUDIT LOG ────────────────────────────────────────────────
DROP POLICY IF EXISTS "al_read"   ON audit_log;
DROP POLICY IF EXISTS "al_insert" ON audit_log;

CREATE POLICY "al_read"   ON audit_log FOR SELECT USING (get_my_role() IN ('ac3','admin'));
CREATE POLICY "al_insert" ON audit_log FOR INSERT WITH CHECK (TRUE);

-- ============================================================
-- FORMATION READINESS FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION get_formation_readiness(target_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
  group_id       INTEGER,
  group_name     TEXT,
  group_short    TEXT,
  strength       BIGINT,
  reported       BIGINT,
  pending        BIGINT,
  available      BIGINT,
  local_leave    BIGINT,
  overseas_leave BIGINT,
  time_off       BIGINT,
  attend_b       BIGINT,
  attend_c       BIGINT,
  duty           BIGINT,
  reviewed       BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    g.id,
    g.name,
    g.short_name,
    COUNT(DISTINCT u.id),
    COUNT(DISTINCT ds.user_id),
    COUNT(DISTINCT u.id) - COUNT(DISTINCT ds.user_id),
    COUNT(DISTINCT CASE WHEN ds.status IN ('Present (Office)','Present (WFH)','External Meeting') THEN ds.user_id END),
    COUNT(DISTINCT CASE WHEN ds.status = 'Local Leave'    THEN ds.user_id END),
    COUNT(DISTINCT CASE WHEN ds.status = 'Overseas Leave' THEN ds.user_id END),
    COUNT(DISTINCT CASE WHEN ds.status = 'Time Off'       THEN ds.user_id END),
    COUNT(DISTINCT CASE WHEN ds.status = 'Attend B'       THEN ds.user_id END),
    COUNT(DISTINCT CASE WHEN ds.status = 'Attend C'       THEN ds.user_id END),
    COUNT(DISTINCT CASE WHEN ds.status IN ('Duty','Course','Exercise','Official Travel') THEN ds.user_id END),
    EXISTS (
      SELECT 1 FROM group_reviews gr
      WHERE gr.group_id = g.id AND gr.review_date = target_date
    )
  FROM groups g
  JOIN users u ON u.group_id = g.id AND u.is_active = TRUE AND u.role NOT IN ('admin')
  LEFT JOIN daily_submissions ds ON ds.user_id = u.id AND ds.submission_date = target_date
  WHERE g.id > 0
  GROUP BY g.id, g.name, g.short_name
  ORDER BY g.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- MIGRATION: Medical end date
-- Run once in Supabase SQL Editor if upgrading an existing deployment
-- ============================================================
ALTER TABLE daily_submissions
  ADD COLUMN IF NOT EXISTS medical_end_date DATE;

-- ============================================================
-- AUTO-MARK LEAVE FUNCTION
-- Call daily at 0000H via Supabase cron or Vercel cron
-- ============================================================
CREATE OR REPLACE FUNCTION auto_mark_leave(target_date DATE DEFAULT CURRENT_DATE)
RETURNS INTEGER AS $$
DECLARE
  inserted INTEGER := 0;
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT lp.user_id, lp.leave_type
    FROM leave_periods lp
    WHERE lp.status = 'approved'
      AND target_date BETWEEN lp.start_date AND lp.end_date
      AND NOT EXISTS (
        SELECT 1 FROM daily_submissions ds
        WHERE ds.user_id = lp.user_id AND ds.submission_date = target_date
      )
  LOOP
    INSERT INTO daily_submissions (user_id, submission_date, status, is_auto, auto_reason, submitted_at)
    VALUES (rec.user_id, target_date, rec.leave_type, TRUE, 'Auto: approved leave period', NOW())
    ON CONFLICT (user_id, submission_date) DO NOTHING;
    inserted := inserted + 1;
  END LOOP;
  RETURN inserted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
