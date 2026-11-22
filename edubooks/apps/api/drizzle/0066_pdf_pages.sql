-- The page count of a book part comes from its PDF. Older uploads may hold a number typed by hand; they are recounted once.
ALTER TABLE book_components ADD COLUMN IF NOT EXISTS pages_checked boolean NOT NULL DEFAULT false;--> statement-breakpoint
CREATE OR REPLACE FUNCTION pdf_pages_to_check(p_limit int) RETURNS TABLE (id uuid, storage_key text) LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, a.storage_key FROM book_components c JOIN digital_assets a ON a.id = c.book_asset_id WHERE NOT c.pages_checked ORDER BY c.id LIMIT p_limit;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION set_pdf_pages(p_id uuid, p_pages int) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE book_components SET page_count = coalesce(nullif(p_pages, 0), page_count), pages_checked = true WHERE id = p_id;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION pdf_pages_to_check(int) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION set_pdf_pages(uuid, int) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION pdf_pages_to_check(int) TO edubooks_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION set_pdf_pages(uuid, int) TO edubooks_app;
