-- The academic calendar follows the UAE only: the Ministry of Education's unified school calendar (2026–2029) and UAE public holidays.
-- Replaces the earlier "typical dates" templates (entries a publisher already edited are kept).
CREATE OR REPLACE FUNCTION seed_uae_calendar(p uuid) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
  moe text := 'UAE Ministry of Education calendar — public schools and private schools on the unified calendar. (Indian, Pakistani and Bangladeshi curriculum schools follow their own year.)';
  tbc text := 'UAE Ministry of Education calendar — the Ministry will confirm the exact dates for this year.';
  eid text := 'UAE public holiday — expected date. Islamic holidays depend on the moon sighting; the UAE Cabinet announces the final dates.';
  fixed text := 'UAE public holiday. The Cabinet may move it next to the weekend — check the official announcement.';
  day text := 'UAE national day observed in schools (not a holiday).';
BEGIN
  DELETE FROM calendar_events WHERE publisher_id = p AND school_id IS NULL AND is_template;
  INSERT INTO calendar_events (publisher_id, curriculum_id, title, kind, starts_on, ends_on, description, is_template)
  SELECT p, NULL, t.title, t.kind::calendar_kind, t.s::date, t.e::date, t.d, true FROM (VALUES
    -- 2026–2027
    ('First day of school 2026–27', 'TERM', '2026-08-31', '2026-08-31', moe),
    ('Term 1', 'TERM', '2026-08-31', '2026-12-11', moe),
    ('Mid-term break', 'HOLIDAY', '2026-10-12', '2026-10-18', moe),
    ('UAE Flag Day', 'EVENT', '2026-11-03', '2026-11-03', day),
    ('Commemoration Day', 'HOLIDAY', '2026-12-01', '2026-12-01', fixed),
    ('UAE National Day (Eid Al Etihad)', 'HOLIDAY', '2026-12-02', '2026-12-03', fixed),
    ('Winter break', 'HOLIDAY', '2026-12-14', '2027-01-03', moe),
    ('Term 2', 'TERM', '2027-01-04', '2027-04-02', moe),
    ('Ramadan begins (expected) — shorter school hours', 'EVENT', '2027-02-08', '2027-02-08', eid),
    ('Eid Al Fitr (expected)', 'HOLIDAY', '2027-03-09', '2027-03-11', eid),
    ('Emirati Children''s Day', 'EVENT', '2027-03-15', '2027-03-15', day),
    ('Spring break', 'HOLIDAY', '2027-04-05', '2027-04-11', moe),
    ('Term 3', 'TERM', '2027-04-12', '2027-07-02', moe),
    ('Arafat Day (expected)', 'HOLIDAY', '2027-05-15', '2027-05-15', eid),
    ('Eid Al Adha (expected)', 'HOLIDAY', '2027-05-16', '2027-05-18', eid),
    ('Hijri New Year (expected)', 'HOLIDAY', '2027-06-06', '2027-06-06', eid),
    ('Last day of school 2026–27', 'TERM', '2027-07-02', '2027-07-02', moe),
    -- 2027–2028
    ('First day of school 2027–28', 'TERM', '2027-08-30', '2027-08-30', moe),
    ('Term 1', 'TERM', '2027-08-30', '2027-12-10', moe),
    ('Mid-term break', 'HOLIDAY', '2027-10-11', '2027-10-17', moe),
    ('UAE Flag Day', 'EVENT', '2027-11-03', '2027-11-03', day),
    ('Commemoration Day', 'HOLIDAY', '2027-12-01', '2027-12-01', fixed),
    ('UAE National Day (Eid Al Etihad)', 'HOLIDAY', '2027-12-02', '2027-12-03', fixed),
    ('Winter break', 'HOLIDAY', '2027-12-13', '2028-01-02', moe),
    ('Term 2', 'TERM', '2028-01-03', '2028-03-24', moe),
    ('Ramadan begins (expected) — shorter school hours', 'EVENT', '2028-01-28', '2028-01-28', eid),
    ('Eid Al Fitr (expected)', 'HOLIDAY', '2028-02-26', '2028-02-28', eid),
    ('Emirati Children''s Day', 'EVENT', '2028-03-15', '2028-03-15', day),
    ('Spring break', 'HOLIDAY', '2028-03-27', '2028-04-02', moe),
    ('Term 3', 'TERM', '2028-04-03', '2028-06-30', moe),
    ('Arafat Day (expected)', 'HOLIDAY', '2028-05-04', '2028-05-04', eid),
    ('Eid Al Adha (expected)', 'HOLIDAY', '2028-05-05', '2028-05-07', eid),
    ('Hijri New Year (expected)', 'HOLIDAY', '2028-05-25', '2028-05-25', eid),
    ('Last day of school 2027–28', 'TERM', '2028-06-30', '2028-06-30', moe),
    -- 2028–2029 (announced; some dates still to be confirmed)
    ('First day of school 2028–29', 'TERM', '2028-08-28', '2028-08-28', tbc),
    ('UAE Flag Day', 'EVENT', '2028-11-03', '2028-11-03', day),
    ('Commemoration Day', 'HOLIDAY', '2028-12-01', '2028-12-01', fixed),
    ('UAE National Day (Eid Al Etihad)', 'HOLIDAY', '2028-12-02', '2028-12-03', fixed),
    ('Winter break', 'HOLIDAY', '2028-12-11', '2029-01-01', moe),
    ('Ramadan begins (expected) — shorter school hours', 'EVENT', '2029-01-16', '2029-01-16', eid),
    ('Eid Al Fitr (expected)', 'HOLIDAY', '2029-02-14', '2029-02-16', eid),
    ('Emirati Children''s Day', 'EVENT', '2029-03-15', '2029-03-15', day),
    ('Spring break', 'HOLIDAY', '2029-03-29', '2029-04-01', moe),
    ('Arafat Day (expected)', 'HOLIDAY', '2029-04-23', '2029-04-23', eid),
    ('Eid Al Adha (expected)', 'HOLIDAY', '2029-04-24', '2029-04-26', eid),
    ('Last day of school 2028–29', 'TERM', '2029-06-29', '2029-06-29', moe)
  ) AS t(title, kind, s, e, d);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION seed_uae_calendar(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION seed_uae_calendar(uuid) TO edubooks_app;--> statement-breakpoint
-- New publishers get the UAE calendar too.
CREATE OR REPLACE FUNCTION publishers_seed_reference() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM seed_reference_data(NEW.id); PERFORM seed_uae_calendar(NEW.id); RETURN NEW; END $$;--> statement-breakpoint
DO $$ DECLARE r record; BEGIN FOR r IN SELECT id FROM publishers LOOP PERFORM seed_uae_calendar(r.id); END LOOP; END $$;
