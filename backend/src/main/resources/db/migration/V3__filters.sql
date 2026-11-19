-- Question variables ({{name}} in SQL / pipelines): JSON array of parameter definitions.
ALTER TABLE question ADD COLUMN parameters TEXT;
-- Dashboard filters: JSON array of parameter definitions.
ALTER TABLE dashboard ADD COLUMN filters TEXT;
-- Per card: JSON object mapping dashboard filter name -> question variable name.
ALTER TABLE dashboard_card ADD COLUMN parameter_mappings TEXT;
