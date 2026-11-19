// Synthetic sample data for the dashboard tool (not real customers).
// Runs once, on first container start, against MONGO_INITDB_DATABASE (bank_events).

const cities = ['Baku', 'Baku', 'Baku', 'Ganja', 'Sumgait', 'Lankaran', 'Shaki'];
const segments = ['retail', 'retail', 'retail', 'premium', 'business'];
const platforms = ['ios', 'android', 'android', 'web'];
const eventTypes = ['login', 'login', 'login', 'transfer', 'bill_payment', 'card_block', 'loan_application', 'currency_exchange'];
const versions = ['5.12.0', '5.13.1', '5.14.0', '5.14.2'];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const now = Date.now();
const DAY = 24 * 3600 * 1000;

let batch = [];
for (let i = 0; i < 30000; i++) {
  const type = pick(eventTypes);
  batch.push({
    type,
    platform: pick(platforms),
    app_version: pick(versions),
    success: Math.random() > 0.04,
    duration_ms: Math.round(150 + Math.random() * 2500),
    amount: ['transfer', 'bill_payment', 'currency_exchange'].includes(type)
      ? Math.round((5 + Math.random() * 800) * 100) / 100 : null,
    customer: {
      id: 1 + Math.floor(Math.random() * 2000),
      city: pick(cities),
      segment: pick(segments),
    },
    created_at: new Date(now - Math.random() * 90 * DAY),
  });
  if (batch.length === 5000) {
    db.app_events.insertMany(batch);
    batch = [];
  }
}
if (batch.length) db.app_events.insertMany(batch);
db.app_events.createIndex({ created_at: 1 });

const topics = ['card', 'transfer', 'login_issue', 'loan', 'fees', 'app_bug'];
const tickets = [];
for (let i = 0; i < 3000; i++) {
  const created = new Date(now - Math.random() * 90 * DAY);
  const resolved = Math.random() > 0.15;
  tickets.push({
    channel: pick(['chat', 'chat', 'call', 'email']),
    topic: pick(topics),
    priority: pick(['low', 'medium', 'medium', 'high']),
    status: resolved ? 'resolved' : pick(['open', 'in_progress']),
    csat: resolved ? 1 + Math.floor(Math.random() * 5) : null,
    created_at: created,
    resolved_at: resolved ? new Date(created.getTime() + Math.random() * 3 * DAY) : null,
    tags: [pick(topics), pick(['mobile', 'web', 'branch'])],
  });
}
db.support_tickets.insertMany(tickets);

// Read-only user the dashboard tool connects with
db.createUser({ user: 'dashboard_reader', pwd: 'reader', roles: [{ role: 'read', db: 'bank_events' }] });
