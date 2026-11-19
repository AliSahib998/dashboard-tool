-- Sample banking data (synthetic, not real customers)
CREATE TABLE branches (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  opened_on DATE NOT NULL
);

CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  segment TEXT NOT NULL,          -- retail / premium / business
  branch_id INT REFERENCES branches(id),
  city TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL
);

CREATE TABLE accounts (
  id SERIAL PRIMARY KEY,
  customer_id INT REFERENCES customers(id),
  type TEXT NOT NULL,             -- current / savings / card
  currency TEXT NOT NULL,         -- AZN / USD / EUR
  balance NUMERIC(14,2) NOT NULL,
  opened_at TIMESTAMP NOT NULL
);

CREATE TABLE transactions (
  id BIGSERIAL PRIMARY KEY,
  account_id INT REFERENCES accounts(id),
  amount NUMERIC(12,2) NOT NULL,
  channel TEXT NOT NULL,          -- mobile / web / atm / pos / branch
  category TEXT NOT NULL,
  status TEXT NOT NULL,           -- success / failed
  created_at TIMESTAMP NOT NULL
);

INSERT INTO branches (name, city, opened_on) VALUES
 ('28 May', 'Baku', '2015-03-01'), ('Nizami', 'Baku', '2016-06-15'),
 ('Ganja Central', 'Ganja', '2017-09-10'), ('Sumgait', 'Sumgait', '2018-01-20'),
 ('Lankaran', 'Lankaran', '2019-04-05'), ('Shaki', 'Shaki', '2020-07-12');

INSERT INTO customers (full_name, segment, branch_id, city, created_at)
SELECT
  'Customer ' || g,
  (ARRAY['retail','retail','retail','premium','business'])[1 + (random()*4)::int],
  b.id, b.city,
  now() - (random() * interval '1000 days')
FROM generate_series(1, 2000) g
JOIN LATERAL (SELECT id, city FROM branches ORDER BY random() + g*0 LIMIT 1) b ON true;

INSERT INTO accounts (customer_id, type, currency, balance, opened_at)
SELECT
  c.id,
  (ARRAY['current','savings','card'])[1 + (random()*2)::int],
  (ARRAY['AZN','AZN','AZN','USD','EUR'])[1 + (random()*4)::int],
  round((random() * 20000)::numeric, 2),
  c.created_at + (random() * interval '30 days')
FROM customers c, generate_series(1, 2) n;

INSERT INTO transactions (account_id, amount, channel, category, status, created_at)
SELECT
  1 + (random() * 3999)::int,
  round((5 + random() * 500)::numeric, 2),
  (ARRAY['mobile','mobile','mobile','web','atm','pos','pos','branch'])[1 + (random()*7)::int],
  (ARRAY['groceries','transfer','utilities','restaurants','travel','shopping','salary','taxes'])[1 + (random()*7)::int],
  CASE WHEN random() < 0.03 THEN 'failed' ELSE 'success' END,
  now() - (random() * interval '180 days')
FROM generate_series(1, 50000);

CREATE INDEX ON transactions (created_at);
CREATE INDEX ON transactions (account_id);

-- Read-only user that the dashboard tool connects with
CREATE USER dashboard_reader WITH PASSWORD 'reader';
GRANT CONNECT ON DATABASE bank_sample TO dashboard_reader;
GRANT USAGE ON SCHEMA public TO dashboard_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO dashboard_reader;
