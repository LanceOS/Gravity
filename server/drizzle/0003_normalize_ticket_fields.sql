BEGIN;

-- Normalize status variants to canonical values
UPDATE tickets
SET status = 'in_progress'
WHERE status IS NOT NULL
  AND lower(regexp_replace(status, '[^a-z0-9]+', '', 'g')) = 'inprogress';
--> statement-breakpoint

UPDATE tickets
SET status = 'in_review'
WHERE status IS NOT NULL
  AND lower(regexp_replace(status, '[^a-z0-9]+', '', 'g')) = 'inreview';
--> statement-breakpoint

UPDATE tickets
SET status = 'canceled'
WHERE status IS NOT NULL
  AND lower(regexp_replace(status, '[^a-z0-9]+', '', 'g')) IN ('cancelled','canceled');
--> statement-breakpoint

UPDATE tickets
SET status = 'backlog'
WHERE status IS NOT NULL
  AND lower(regexp_replace(status, '[^a-z0-9]+', '', 'g')) = 'backlog';
--> statement-breakpoint

UPDATE tickets
SET status = 'done'
WHERE status IS NOT NULL
  AND lower(regexp_replace(status, '[^a-z0-9]+', '', 'g')) = 'done';
--> statement-breakpoint

-- Final fallback: set any unknown or empty statuses to 'todo'
UPDATE tickets
SET status = 'todo'
WHERE status IS NULL
   OR lower(regexp_replace(status, '[^a-z0-9]+', '', 'g')) NOT IN ('backlog','todo','inprogress','inreview','done','canceled');
--> statement-breakpoint

-- Normalize priority variants to canonical values
UPDATE tickets
SET priority = 'no_priority'
WHERE priority IS NULL
  OR lower(regexp_replace(priority, '[^a-z0-9]+', '', 'g')) IN ('', 'none', 'nopriority');
--> statement-breakpoint

UPDATE tickets
SET priority = 'urgent'
WHERE lower(regexp_replace(priority, '[^a-z0-9]+', '', 'g')) = 'urgent';
--> statement-breakpoint

UPDATE tickets
SET priority = 'high'
WHERE lower(regexp_replace(priority, '[^a-z0-9]+', '', 'g')) = 'high';
--> statement-breakpoint

UPDATE tickets
SET priority = 'medium'
WHERE lower(regexp_replace(priority, '[^a-z0-9]+', '', 'g')) = 'medium';
--> statement-breakpoint

UPDATE tickets
SET priority = 'low'
WHERE lower(regexp_replace(priority, '[^a-z0-9]+', '', 'g')) = 'low';
--> statement-breakpoint

-- Any remaining unknown priorities -> no_priority
UPDATE tickets
SET priority = 'no_priority'
WHERE priority IS NULL
   OR lower(regexp_replace(priority, '[^a-z0-9]+', '', 'g')) NOT IN ('no_priority','low','medium','high','urgent');
--> statement-breakpoint

-- Normalize PR status variants
UPDATE tickets
SET pr_status = 'open'
WHERE pr_status IS NOT NULL
  AND lower(regexp_replace(pr_status, '[^a-z0-9]+', '', 'g')) = 'open';
--> statement-breakpoint

UPDATE tickets
SET pr_status = 'merged'
WHERE pr_status IS NOT NULL
  AND lower(regexp_replace(pr_status, '[^a-z0-9]+', '', 'g')) IN ('merged','merge');
--> statement-breakpoint

UPDATE tickets
SET pr_status = 'closed'
WHERE pr_status IS NOT NULL
  AND lower(regexp_replace(pr_status, '[^a-z0-9]+', '', 'g')) = 'closed';
--> statement-breakpoint

UPDATE tickets
SET pr_status = 'none'
WHERE pr_status IS NULL
   OR lower(regexp_replace(pr_status, '[^a-z0-9]+', '', 'g')) NOT IN ('open','merged','closed','none');
--> statement-breakpoint

-- Sanitize titles: trim, collapse whitespace, remove control chars, cap length
UPDATE tickets
SET title = substr(regexp_replace(regexp_replace(trim(title), E'[\\x00-\\x1F\\x7F]+', '', 'g'), E'\\s+', ' ', 'g'), 1, 240)
WHERE title IS NOT NULL;
--> statement-breakpoint

-- Normalize branch names to a safe lowercase form; perform in steps for clarity
UPDATE tickets SET branch_name = lower(branch_name) WHERE branch_name IS NOT NULL;
--> statement-breakpoint

UPDATE tickets SET branch_name = regexp_replace(branch_name, E'\\s+', '-', 'g') WHERE branch_name IS NOT NULL;
--> statement-breakpoint

UPDATE tickets SET branch_name = regexp_replace(branch_name, E'[^a-z0-9\\/\\-_]+', '', 'g') WHERE branch_name IS NOT NULL;
--> statement-breakpoint

UPDATE tickets SET branch_name = regexp_replace(branch_name, E'-+', '-', 'g') WHERE branch_name IS NOT NULL;
--> statement-breakpoint

-- remove hyphens immediately before slashes and after slashes
UPDATE tickets SET branch_name = regexp_replace(branch_name, E'-+\/', '/', 'g') WHERE branch_name IS NOT NULL;
--> statement-breakpoint

UPDATE tickets SET branch_name = regexp_replace(branch_name, E'\/-+', '/', 'g') WHERE branch_name IS NOT NULL;
--> statement-breakpoint

UPDATE tickets SET branch_name = regexp_replace(branch_name, E'(^-+|-+$)', '', 'g') WHERE branch_name IS NOT NULL;
--> statement-breakpoint

UPDATE tickets SET branch_name = regexp_replace(branch_name, E'\/+', '/', 'g') WHERE branch_name IS NOT NULL;
--> statement-breakpoint

COMMIT;
--> statement-breakpoint
