CREATE TABLE app_user (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE data_source (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  engine VARCHAR(30) NOT NULL,
  jdbc_url VARCHAR(1000) NOT NULL,
  username VARCHAR(255),
  password_encrypted VARCHAR(1000),
  schema_filter VARCHAR(1000),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE question (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  data_source_id BIGINT NOT NULL REFERENCES data_source(id),
  sql_text TEXT NOT NULL,
  viz_type VARCHAR(20) NOT NULL,
  viz_settings TEXT,
  created_by BIGINT REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE dashboard (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_by BIGINT REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE dashboard_card (
  id BIGSERIAL PRIMARY KEY,
  dashboard_id BIGINT NOT NULL REFERENCES dashboard(id) ON DELETE CASCADE,
  question_id BIGINT NOT NULL REFERENCES question(id) ON DELETE CASCADE,
  pos_x INT NOT NULL,
  pos_y INT NOT NULL,
  width INT NOT NULL,
  height INT NOT NULL
);

CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT,
  user_email VARCHAR(255),
  action VARCHAR(50) NOT NULL,
  data_source_id BIGINT,
  question_id BIGINT,
  sql_text TEXT,
  row_count INT,
  duration_ms BIGINT,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_audit_created_at ON audit_log (created_at DESC);
CREATE INDEX idx_dashboard_card_dashboard ON dashboard_card (dashboard_id);
