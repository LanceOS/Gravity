-- Preserve legacy orphaned cycle IDs for a separate repair. PostgreSQL still
-- checks all new ticket assignments and prevents deletion of referenced cycles.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_cycle_id_cycles_id_fk' AND conrelid = 'tickets'::regclass) THEN
    ALTER TABLE tickets ADD CONSTRAINT tickets_cycle_id_cycles_id_fk
      FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE RESTRICT NOT VALID;
  END IF;
END $$;
