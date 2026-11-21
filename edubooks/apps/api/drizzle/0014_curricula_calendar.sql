-- Curricula (American, British, Cambridge, IB, MOE, CBC, Pakistan, Other) with their own grades and stages,
-- the curriculum a school follows, and the academic calendar. Reference data is filled in for every publisher.

CREATE TABLE curricula (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  code citext NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT '#4f46e5',
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX curricula_code_uq ON curricula (publisher_id, code);--> statement-breakpoint
ALTER TABLE curricula ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY curricula_read ON curricula FOR SELECT USING (publisher_id = app_publisher());--> statement-breakpoint
CREATE POLICY curricula_write ON curricula FOR ALL USING (publisher_id = app_publisher() AND app_is_staff()) WITH CHECK (publisher_id = app_publisher() AND app_is_staff());--> statement-breakpoint

ALTER TABLE grades ADD COLUMN curriculum_id uuid REFERENCES curricula(id) ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE grades ADD COLUMN stage text NOT NULL DEFAULT '';--> statement-breakpoint
-- The same grade name now exists in several curricula (e.g. "Grade 1"): names are unique per curriculum instead.
DROP INDEX grades_name_uq;--> statement-breakpoint
ALTER TABLE schools ADD COLUMN curriculum_id uuid REFERENCES curricula(id) ON DELETE SET NULL;--> statement-breakpoint

CREATE TYPE calendar_kind AS ENUM ('TERM', 'HOLIDAY', 'EXAM', 'EVENT', 'MEETING', 'SPORTS', 'OTHER');--> statement-breakpoint
CREATE TABLE calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid REFERENCES schools(id) ON DELETE CASCADE,         -- NULL = publisher event (all schools, or one curriculum)
  curriculum_id uuid REFERENCES curricula(id) ON DELETE SET NULL,  -- publisher events: only schools following this curriculum
  title text NOT NULL,
  kind calendar_kind NOT NULL DEFAULT 'EVENT',
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  description text NOT NULL DEFAULT '',
  is_template boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_dates_ck CHECK (ends_on >= starts_on),
  CONSTRAINT calendar_title_ck CHECK (length(title) BETWEEN 1 AND 160)
);--> statement-breakpoint
CREATE INDEX calendar_range_idx ON calendar_events (publisher_id, starts_on, ends_on);--> statement-breakpoint
CREATE INDEX calendar_school_idx ON calendar_events (school_id);--> statement-breakpoint
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Everyone in the publisher sees publisher events; a school sees only its own school events.
CREATE POLICY calendar_read ON calendar_events FOR SELECT
  USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id IS NULL OR school_id = app_school()));--> statement-breakpoint
-- Staff write anything in their publisher; a school (its admin, checked in the API) writes only its own school's events.
CREATE POLICY calendar_write ON calendar_events FOR ALL
  USING (publisher_id = app_publisher() AND (app_is_staff() OR (school_id IS NOT NULL AND school_id = app_school())))
  WITH CHECK (publisher_id = app_publisher() AND (app_is_staff() OR (school_id IS NOT NULL AND school_id = app_school())));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON curricula, calendar_events TO edubooks_app;--> statement-breakpoint

-- ---------- reference data ----------
CREATE OR REPLACE FUNCTION seed_reference_data(p uuid) RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  c record; g record; cid uuid; y int; ay int; cal int;
  m int := extract(month FROM now())::int;
BEGIN
  -- curricula
  INSERT INTO curricula (publisher_id, code, name, description, color, sort) VALUES
    (p, 'AMERICAN',  'American',                       'US system (Common Core): Pre-K and Kindergarten to Grade 12', '#2563eb', 10),
    (p, 'BRITISH',   'British',                        'National Curriculum of England: Nursery, Reception and Year 1 to Year 13', '#dc2626', 20),
    (p, 'CAMBRIDGE', 'Cambridge International',        'Cambridge Primary, Lower Secondary, IGCSE / O Level and AS & A Level', '#7c3aed', 30),
    (p, 'IB',        'International Baccalaureate (IB)', 'Primary Years, Middle Years and Diploma Programmes', '#0891b2', 40),
    (p, 'MOE',       'MOE (Ministry of Education)',    'KG1–KG2 and Grade 1 to 12 in three cycles. Rename it for your country if needed.', '#059669', 50),
    (p, 'CBC',       'CBC (Competency-Based Curriculum)', 'Kenya: Pre-Primary (PP1–PP2), Primary, Junior School and Senior School', '#ea580c', 60),
    (p, 'PAKISTAN',  'Pakistan National Curriculum',   'Playgroup to Grade 12: Primary, Middle, Matric and Intermediate', '#16a34a', 70),
    (p, 'OTHER',     'Other',                          'Your own grade names', '#64748b', 99)
  ON CONFLICT (publisher_id, code) DO NOTHING;

  -- grades per curriculum: (curriculum, stage, names...)
  FOR g IN SELECT * FROM (VALUES
    ('AMERICAN', 'Early Childhood', ARRAY['Pre-K', 'Kindergarten']),
    ('AMERICAN', 'Elementary School', ARRAY['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5']),
    ('AMERICAN', 'Middle School', ARRAY['Grade 6', 'Grade 7', 'Grade 8']),
    ('AMERICAN', 'High School', ARRAY['Grade 9', 'Grade 10', 'Grade 11', 'Grade 12']),
    ('BRITISH', 'Early Years (EYFS)', ARRAY['Nursery', 'Reception']),
    ('BRITISH', 'Key Stage 1', ARRAY['Year 1', 'Year 2']),
    ('BRITISH', 'Key Stage 2', ARRAY['Year 3', 'Year 4', 'Year 5', 'Year 6']),
    ('BRITISH', 'Key Stage 3', ARRAY['Year 7', 'Year 8', 'Year 9']),
    ('BRITISH', 'Key Stage 4 (GCSE)', ARRAY['Year 10', 'Year 11']),
    ('BRITISH', 'Sixth Form (A Level)', ARRAY['Year 12', 'Year 13']),
    ('CAMBRIDGE', 'Cambridge Primary', ARRAY['Stage 1', 'Stage 2', 'Stage 3', 'Stage 4', 'Stage 5', 'Stage 6']),
    ('CAMBRIDGE', 'Cambridge Lower Secondary', ARRAY['Stage 7', 'Stage 8', 'Stage 9']),
    ('CAMBRIDGE', 'Cambridge Upper Secondary (IGCSE / O Level)', ARRAY['IGCSE / O Level Year 1', 'IGCSE / O Level Year 2']),
    ('CAMBRIDGE', 'Cambridge Advanced (AS & A Level)', ARRAY['AS Level', 'A Level']),
    ('IB', 'Primary Years Programme (PYP)', ARRAY['PYP Early Years', 'PYP 1', 'PYP 2', 'PYP 3', 'PYP 4', 'PYP 5', 'PYP 6']),
    ('IB', 'Middle Years Programme (MYP)', ARRAY['MYP 1', 'MYP 2', 'MYP 3', 'MYP 4', 'MYP 5']),
    ('IB', 'Diploma Programme (DP)', ARRAY['DP 1', 'DP 2']),
    ('MOE', 'Kindergarten', ARRAY['KG1', 'KG2']),
    ('MOE', 'Cycle 1', ARRAY['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4']),
    ('MOE', 'Cycle 2', ARRAY['Grade 5', 'Grade 6', 'Grade 7', 'Grade 8']),
    ('MOE', 'Cycle 3', ARRAY['Grade 9', 'Grade 10', 'Grade 11', 'Grade 12']),
    ('CBC', 'Pre-Primary', ARRAY['PP1', 'PP2']),
    ('CBC', 'Lower Primary', ARRAY['Grade 1', 'Grade 2', 'Grade 3']),
    ('CBC', 'Upper Primary', ARRAY['Grade 4', 'Grade 5', 'Grade 6']),
    ('CBC', 'Junior School', ARRAY['Grade 7', 'Grade 8', 'Grade 9']),
    ('CBC', 'Senior School', ARRAY['Grade 10', 'Grade 11', 'Grade 12']),
    ('PAKISTAN', 'Early Childhood (ECE)', ARRAY['Playgroup', 'Nursery', 'KG']),
    ('PAKISTAN', 'Primary', ARRAY['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5']),
    ('PAKISTAN', 'Middle', ARRAY['Grade 6', 'Grade 7', 'Grade 8']),
    ('PAKISTAN', 'Secondary (Matric)', ARRAY['Grade 9', 'Grade 10']),
    ('PAKISTAN', 'Higher Secondary (Intermediate)', ARRAY['Grade 11', 'Grade 12'])
  ) AS t(code, stage, names) LOOP
    SELECT id INTO cid FROM curricula WHERE publisher_id = p AND code = g.code;
    INSERT INTO grades (publisher_id, curriculum_id, stage, name, sort)
      SELECT p, cid, g.stage, n, (SELECT coalesce(max(sort), 0) FROM grades WHERE curriculum_id = cid) + 10 * i
      FROM unnest(g.names) WITH ORDINALITY AS u(n, i)
      WHERE NOT EXISTS (SELECT 1 FROM grades x WHERE x.publisher_id = p AND x.curriculum_id = cid AND x.name = n);
  END LOOP;

  -- subjects (shared by all curricula)
  INSERT INTO subjects (publisher_id, name, color, sort)
  SELECT p, n, col, 10 * i FROM unnest(
    ARRAY['English', 'Mathematics', 'Science', 'Urdu', 'Arabic', 'Islamic Studies', 'Social Studies', 'General Knowledge', 'Phonics',
          'Computer Science', 'Art & Craft', 'Music', 'Physical Education', 'French', 'Kiswahili', 'Religious Education', 'Moral Education',
          'Environmental Activities', 'Creative Arts', 'Physics', 'Chemistry', 'Biology', 'History', 'Geography', 'Economics',
          'Business Studies', 'Pakistan Studies'],
    ARRAY['#ef4444', '#3b82f6', '#14b8a6', '#10b981', '#0ea5e9', '#059669', '#f97316', '#f59e0b', '#f43f5e',
          '#6366f1', '#ec4899', '#a855f7', '#22c55e', '#2563eb', '#16a34a', '#8b5cf6', '#84cc16',
          '#65a30d', '#db2777', '#1d4ed8', '#0d9488', '#15803d', '#b45309', '#0369a1', '#7c3aed',
          '#be123c', '#166534']) WITH ORDINALITY AS u(n, col, i)
  ON CONFLICT (publisher_id, name) DO NOTHING;

  -- Academic calendar templates for the current school year (typical term structure; dates are a starting point).
  IF EXISTS (SELECT 1 FROM calendar_events WHERE publisher_id = p AND is_template) THEN RETURN; END IF;
  y := extract(year FROM now())::int;
  ay := CASE WHEN m >= 7 THEN y ELSE y - 1 END;     -- Aug/Sep start (American, British, Cambridge, IB, MOE)
  cal := CASE WHEN m >= 11 THEN y + 1 ELSE y END;   -- calendar-year schools (CBC)
  FOR c IN SELECT * FROM (VALUES
    -- code, title, kind, start, end
    ('AMERICAN', 'First day of school (Fall semester)', 'TERM', make_date(ay, 8, 24), make_date(ay, 8, 24)),
    ('AMERICAN', 'Thanksgiving break', 'HOLIDAY', make_date(ay, 11, 25), make_date(ay, 11, 27)),
    ('AMERICAN', 'Fall semester exams', 'EXAM', make_date(ay, 12, 14), make_date(ay, 12, 18)),
    ('AMERICAN', 'Winter break', 'HOLIDAY', make_date(ay, 12, 21), make_date(ay + 1, 1, 1)),
    ('AMERICAN', 'Spring semester begins', 'TERM', make_date(ay + 1, 1, 4), make_date(ay + 1, 1, 4)),
    ('AMERICAN', 'Spring break', 'HOLIDAY', make_date(ay + 1, 3, 22), make_date(ay + 1, 3, 26)),
    ('AMERICAN', 'Final exams', 'EXAM', make_date(ay + 1, 5, 31), make_date(ay + 1, 6, 4)),
    ('AMERICAN', 'Last day of school', 'TERM', make_date(ay + 1, 6, 11), make_date(ay + 1, 6, 11)),
    ('BRITISH', 'Autumn term', 'TERM', make_date(ay, 9, 2), make_date(ay, 12, 18)),
    ('BRITISH', 'Autumn half term', 'HOLIDAY', make_date(ay, 10, 26), make_date(ay, 10, 30)),
    ('BRITISH', 'Christmas holidays', 'HOLIDAY', make_date(ay, 12, 21), make_date(ay + 1, 1, 1)),
    ('BRITISH', 'Spring term', 'TERM', make_date(ay + 1, 1, 4), make_date(ay + 1, 3, 26)),
    ('BRITISH', 'Spring half term', 'HOLIDAY', make_date(ay + 1, 2, 15), make_date(ay + 1, 2, 19)),
    ('BRITISH', 'Easter holidays', 'HOLIDAY', make_date(ay + 1, 3, 29), make_date(ay + 1, 4, 9)),
    ('BRITISH', 'Summer term', 'TERM', make_date(ay + 1, 4, 12), make_date(ay + 1, 7, 21)),
    ('BRITISH', 'Summer half term', 'HOLIDAY', make_date(ay + 1, 5, 31), make_date(ay + 1, 6, 4)),
    ('CAMBRIDGE', 'Term 1', 'TERM', make_date(ay, 8, 31), make_date(ay, 12, 17)),
    ('CAMBRIDGE', 'Cambridge exams — October/November series', 'EXAM', make_date(ay, 10, 1), make_date(ay, 11, 15)),
    ('CAMBRIDGE', 'Winter break', 'HOLIDAY', make_date(ay, 12, 18), make_date(ay + 1, 1, 3)),
    ('CAMBRIDGE', 'Term 2', 'TERM', make_date(ay + 1, 1, 4), make_date(ay + 1, 3, 26)),
    ('CAMBRIDGE', 'Spring break', 'HOLIDAY', make_date(ay + 1, 3, 29), make_date(ay + 1, 4, 9)),
    ('CAMBRIDGE', 'Term 3', 'TERM', make_date(ay + 1, 4, 12), make_date(ay + 1, 6, 25)),
    ('CAMBRIDGE', 'Cambridge exams — May/June series', 'EXAM', make_date(ay + 1, 4, 26), make_date(ay + 1, 6, 15)),
    ('IB', 'Semester 1', 'TERM', make_date(ay, 8, 24), make_date(ay, 12, 18)),
    ('IB', 'Winter break', 'HOLIDAY', make_date(ay, 12, 21), make_date(ay + 1, 1, 1)),
    ('IB', 'Semester 2', 'TERM', make_date(ay + 1, 1, 4), make_date(ay + 1, 6, 11)),
    ('IB', 'Spring break', 'HOLIDAY', make_date(ay + 1, 3, 29), make_date(ay + 1, 4, 2)),
    ('IB', 'IB Diploma exams — May session', 'EXAM', make_date(ay + 1, 4, 26), make_date(ay + 1, 5, 21)),
    ('IB', 'PYP Exhibition', 'EVENT', make_date(ay + 1, 5, 20), make_date(ay + 1, 5, 20)),
    ('MOE', 'Term 1', 'TERM', make_date(ay, 8, 24), make_date(ay, 12, 11)),
    ('MOE', 'Term 1 exams', 'EXAM', make_date(ay, 11, 30), make_date(ay, 12, 10)),
    ('MOE', 'Winter break', 'HOLIDAY', make_date(ay, 12, 14), make_date(ay + 1, 1, 1)),
    ('MOE', 'Term 2', 'TERM', make_date(ay + 1, 1, 4), make_date(ay + 1, 3, 12)),
    ('MOE', 'Spring break', 'HOLIDAY', make_date(ay + 1, 3, 15), make_date(ay + 1, 3, 26)),
    ('MOE', 'Term 3', 'TERM', make_date(ay + 1, 3, 29), make_date(ay + 1, 7, 2)),
    ('MOE', 'End-of-year exams', 'EXAM', make_date(ay + 1, 6, 14), make_date(ay + 1, 6, 25)),
    ('CBC', 'Term 1', 'TERM', make_date(cal, 1, 5), make_date(cal, 4, 2)),
    ('CBC', 'Term 1 half-term break', 'HOLIDAY', make_date(cal, 2, 26), make_date(cal, 3, 1)),
    ('CBC', 'Term 2', 'TERM', make_date(cal, 4, 26), make_date(cal, 7, 30)),
    ('CBC', 'Term 2 half-term break', 'HOLIDAY', make_date(cal, 6, 24), make_date(cal, 6, 28)),
    ('CBC', 'Term 3', 'TERM', make_date(cal, 8, 23), make_date(cal, 10, 30)),
    ('CBC', 'End-of-year assessments', 'EXAM', make_date(cal, 10, 19), make_date(cal, 10, 29)),
    ('PAKISTAN', 'New session begins', 'TERM', make_date(CASE WHEN m >= 4 THEN y ELSE y - 1 END, 4, 1), make_date(CASE WHEN m >= 4 THEN y ELSE y - 1 END, 4, 1)),
    ('PAKISTAN', 'Summer vacation', 'HOLIDAY', make_date(CASE WHEN m >= 4 THEN y ELSE y - 1 END, 6, 1), make_date(CASE WHEN m >= 4 THEN y ELSE y - 1 END, 7, 31)),
    ('PAKISTAN', 'Mid-term exams', 'EXAM', make_date(CASE WHEN m >= 4 THEN y ELSE y - 1 END, 10, 12), make_date(CASE WHEN m >= 4 THEN y ELSE y - 1 END, 10, 23)),
    ('PAKISTAN', 'Parent–teacher meeting', 'MEETING', make_date(CASE WHEN m >= 4 THEN y ELSE y - 1 END, 10, 31), make_date(CASE WHEN m >= 4 THEN y ELSE y - 1 END, 10, 31)),
    ('PAKISTAN', 'Winter vacation', 'HOLIDAY', make_date(CASE WHEN m >= 4 THEN y ELSE y - 1 END, 12, 22), make_date(CASE WHEN m >= 4 THEN y ELSE y - 1 END + 1, 1, 4)),
    ('PAKISTAN', 'Sports day', 'SPORTS', make_date(CASE WHEN m >= 4 THEN y ELSE y - 1 END + 1, 2, 13), make_date(CASE WHEN m >= 4 THEN y ELSE y - 1 END + 1, 2, 13)),
    ('PAKISTAN', 'Final exams', 'EXAM', make_date(CASE WHEN m >= 4 THEN y ELSE y - 1 END + 1, 3, 1), make_date(CASE WHEN m >= 4 THEN y ELSE y - 1 END + 1, 3, 15)),
    ('PAKISTAN', 'Result day', 'EVENT', make_date(CASE WHEN m >= 4 THEN y ELSE y - 1 END + 1, 3, 28), make_date(CASE WHEN m >= 4 THEN y ELSE y - 1 END + 1, 3, 28))
  ) AS t(code, title, kind, s, e) LOOP
    INSERT INTO calendar_events (publisher_id, curriculum_id, title, kind, starts_on, ends_on, description, is_template)
    SELECT p, cu.id, c.title, c.kind::calendar_kind, c.s, c.e, 'Typical date — adjust it for your schools.', true
    FROM curricula cu WHERE cu.publisher_id = p AND cu.code = c.code;
  END LOOP;
END $$;--> statement-breakpoint

-- New publishers get the reference data automatically.
CREATE OR REPLACE FUNCTION publishers_seed_reference() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM seed_reference_data(NEW.id); RETURN NEW; END $$;--> statement-breakpoint
CREATE TRIGGER publishers_seed_reference AFTER INSERT ON publishers FOR EACH ROW EXECUTE FUNCTION publishers_seed_reference();--> statement-breakpoint

-- A grade added without a curriculum (older screens, imports) goes to "Other".
CREATE OR REPLACE FUNCTION grades_default_curriculum() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.curriculum_id IS NULL THEN
    SELECT id INTO NEW.curriculum_id FROM curricula WHERE publisher_id = NEW.publisher_id AND code = 'OTHER';
    IF NEW.curriculum_id IS NULL THEN
      INSERT INTO curricula (publisher_id, code, name, description, color, sort) VALUES (NEW.publisher_id, 'OTHER', 'Other', 'Your own grade names', '#64748b', 99)
      RETURNING id INTO NEW.curriculum_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER grades_default_curriculum BEFORE INSERT OR UPDATE OF curriculum_id ON grades FOR EACH ROW EXECUTE FUNCTION grades_default_curriculum();--> statement-breakpoint

-- Fill in every existing publisher, then move grades created before this update to "Other".
SELECT seed_reference_data(id) FROM publishers;--> statement-breakpoint
UPDATE grades g SET curriculum_id = c.id FROM curricula c WHERE g.curriculum_id IS NULL AND c.publisher_id = g.publisher_id AND c.code = 'OTHER';--> statement-breakpoint
ALTER TABLE grades ALTER COLUMN curriculum_id SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX grades_name_uq ON grades (publisher_id, curriculum_id, name);--> statement-breakpoint
CREATE INDEX grades_curriculum_idx ON grades (curriculum_id, sort);--> statement-breakpoint
REVOKE ALL ON FUNCTION seed_reference_data(uuid) FROM PUBLIC;
