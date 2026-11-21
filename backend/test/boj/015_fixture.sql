-- Confirms the migration connection still targets the shared ledger's schema.
CREATE TABLE migration_probe (id INT PRIMARY KEY);
INSERT INTO migration_probe (id) VALUES (1);
