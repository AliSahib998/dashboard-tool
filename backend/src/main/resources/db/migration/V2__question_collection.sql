-- MongoDB questions store the collection name here; sql_text holds the aggregation pipeline (JSON array).
ALTER TABLE question ADD COLUMN collection_name VARCHAR(255);
