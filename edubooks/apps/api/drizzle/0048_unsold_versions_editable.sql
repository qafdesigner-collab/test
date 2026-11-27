-- A product version stays editable (books and price) until it is sold: ordered, licensed or used in an adjustment.
-- Sold versions remain frozen, so schools always keep exactly what they bought.
CREATE OR REPLACE FUNCTION product_version_sold(v uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM order_lines WHERE product_version_id = v)
      OR EXISTS (SELECT 1 FROM license_pools WHERE product_version_id = v)
      OR EXISTS (SELECT 1 FROM license_adjustments WHERE product_version_id = v)
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION product_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' AND NOT purging_demo() THEN RAISE EXCEPTION 'Product version % is % and cannot be deleted', OLD.version_no, lower(OLD.status::text); END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'DRAFT' THEN
    IF OLD.status = 'ACTIVE' AND NEW.status = 'RETIRED'
       AND (NEW.price_minor, NEW.currency, NEW.product_id, NEW.version_no) IS NOT DISTINCT FROM (OLD.price_minor, OLD.currency, OLD.product_id, OLD.version_no) THEN
      RETURN NEW;
    END IF;
    -- an active version nobody has bought yet may still change its price
    IF OLD.status = 'ACTIVE' AND NEW.status = 'ACTIVE' AND NOT product_version_sold(OLD.id)
       AND (NEW.product_id, NEW.version_no) IS NOT DISTINCT FROM (OLD.product_id, OLD.version_no) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Product version % is % — its contents and price are frozen. Create a new version instead.', OLD.version_no, lower(OLD.status::text);
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION bundle_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE st version_status; vid uuid;
BEGIN
  IF TG_OP = 'DELETE' AND purging_demo() THEN RETURN OLD; END IF;
  vid := coalesce(NEW.product_version_id, OLD.product_version_id);
  SELECT status INTO st FROM product_versions WHERE id = vid;
  IF st IS NOT NULL AND st <> 'DRAFT' AND NOT (st = 'ACTIVE' AND NOT product_version_sold(vid)) THEN
    RAISE EXCEPTION 'This product version is % — its books cannot change. Create a new version instead.', lower(st::text);
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;
