-- Public company card (sign-in page, invoices) and public documents, readable before anyone signs in.
CREATE OR REPLACE FUNCTION public_company(p_slug text) RETURNS TABLE (publisher_id uuid, name text, company jsonb, finance jsonb, region jsonb, documents jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.name, coalesce(p.settings -> 'company', '{}'::jsonb), coalesce(p.settings -> 'finance', '{}'::jsonb), coalesce(p.settings -> 'region', '{}'::jsonb),
    coalesce((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'description', d.description, 'category', d.category, 'ext', a.ext, 'size', a.size_bytes) ORDER BY d.sort, d.created_at)
      FROM company_documents d JOIN digital_assets a ON a.id = d.asset_id WHERE d.publisher_id = p.id AND d.visibility = 'PUBLIC'), '[]'::jsonb)
  FROM publishers p WHERE (coalesce(p_slug, '') = '' OR p.slug = p_slug) ORDER BY p.created_at LIMIT 1
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public_company(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public_company(text) TO edubooks_app;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public_company_document(p_id uuid) RETURNS TABLE (storage_key text, mime_type text, original_name text, title text, ext text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.storage_key, a.mime_type, a.original_name, d.title, a.ext FROM company_documents d JOIN digital_assets a ON a.id = d.asset_id WHERE d.id = p_id AND d.visibility = 'PUBLIC'
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public_company_document(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public_company_document(uuid) TO edubooks_app;
