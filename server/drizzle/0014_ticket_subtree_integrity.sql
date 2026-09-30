-- Retain legacy orphan records; enforce new references and physical deletions.
-- NO ACTION prevents an unscoped cascade through legacy cross-project children.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_parent_id_tickets_id_fk' AND conrelid = 'tickets'::regclass) THEN
    ALTER TABLE tickets ADD CONSTRAINT tickets_parent_id_tickets_id_fk
      FOREIGN KEY (parent_id) REFERENCES tickets(id) ON DELETE NO ACTION NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comments_ticket_id_tickets_id_fk' AND conrelid = 'comments'::regclass) THEN
    ALTER TABLE comments ADD CONSTRAINT comments_ticket_id_tickets_id_fk
      FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ticket_labels_ticket_id_tickets_id_fk' AND conrelid = 'ticket_labels'::regclass) THEN
    ALTER TABLE ticket_labels ADD CONSTRAINT ticket_labels_ticket_id_tickets_id_fk
      FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
