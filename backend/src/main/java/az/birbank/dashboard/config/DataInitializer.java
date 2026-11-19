package az.birbank.dashboard.config;

import az.birbank.dashboard.auth.AppUser;
import az.birbank.dashboard.auth.AppUserRepository;
import az.birbank.dashboard.auth.Role;
import az.birbank.dashboard.dashboard.Dashboard;
import az.birbank.dashboard.dashboard.DashboardCard;
import az.birbank.dashboard.dashboard.DashboardRepository;
import az.birbank.dashboard.datasource.CryptoService;
import az.birbank.dashboard.datasource.DataSourceEntity;
import az.birbank.dashboard.datasource.DataSourceRepository;
import az.birbank.dashboard.datasource.Engine;
import az.birbank.dashboard.params.JsonColumns;
import az.birbank.dashboard.params.ParameterDef;
import az.birbank.dashboard.question.Question;
import az.birbank.dashboard.question.QuestionRepository;
import az.birbank.dashboard.question.VizType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

/** Creates the first admin user and, on an empty install, a sample data source with demo content. */
@Component
public class DataInitializer implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DataInitializer.class);
    private static final String SAMPLE_PG_NAME = "Bank sample (Postgres)";
    private static final String GALLERY_NAME = "Chart gallery";
    private static final String EXPLORER_NAME = "Transactions explorer";

    private final AppProperties props;
    private final AppUserRepository users;
    private final DataSourceRepository dataSources;
    private final QuestionRepository questions;
    private final DashboardRepository dashboards;
    private final PasswordEncoder encoder;
    private final CryptoService crypto;
    private final JsonColumns json;

    public DataInitializer(AppProperties props, AppUserRepository users, DataSourceRepository dataSources,
                           QuestionRepository questions, DashboardRepository dashboards,
                           PasswordEncoder encoder, CryptoService crypto, JsonColumns json) {
        this.json = json;
        this.props = props;
        this.users = users;
        this.dataSources = dataSources;
        this.questions = questions;
        this.dashboards = dashboards;
        this.encoder = encoder;
        this.crypto = crypto;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (users.count() == 0) {
            AppUser admin = new AppUser();
            admin.setEmail(props.admin().email().toLowerCase());
            admin.setFullName("Administrator");
            admin.setPasswordHash(encoder.encode(props.admin().password()));
            admin.setRole(Role.ADMIN);
            users.save(admin);
            log.warn("Created initial admin user {}. Change the password after first login.", admin.getEmail());
        }

        var sample = props.sampleDb();
        if (dataSources.count() == 0 && sample != null && sample.url() != null && !sample.url().isBlank()) {
            seedSample(sample);
        }

        // Added separately so existing installs also get the MongoDB demo. Set SAMPLE_MONGO_URL empty to skip.
        var mongo = props.sampleMongo();
        if (mongo != null && mongo.url() != null && !mongo.url().isBlank() && !dataSources.existsByEngine(Engine.MONGODB)) {
            seedMongoSample(mongo);
        }

        // Demo of every chart type, added once to installs that have the Postgres sample data source.
        dataSources.findByName(SAMPLE_PG_NAME)
            .filter(ds -> !dashboards.existsByName(GALLERY_NAME))
            .ifPresent(this::seedChartGallery);

        // Demo of question variables and dashboard filters.
        dataSources.findByName(SAMPLE_PG_NAME)
            .filter(ds -> !dashboards.existsByName(EXPLORER_NAME))
            .ifPresent(this::seedFilterDemo);
    }

    private void seedFilterDemo(DataSourceEntity ds) {
        List<ParameterDef> filters = List.of(
            new ParameterDef("date_from", "From", "date", "input", null, null, "-90d"),
            new ParameterDef("date_to", "To", "date", "input", null, null, null),
            new ParameterDef("channel", "Channel", "text", "dropdown", null,
                new ParameterDef.OptionsSource(ds.getId(), "transactions", "channel"), null),
            new ParameterDef("branch", "Branch", "text", "dropdown", null,
                new ParameterDef.OptionsSource(ds.getId(), "branches", "name"), null));
        String params = json.write(filters);
        String from = """
            FROM transactions t
            JOIN accounts a ON a.id = t.account_id
            JOIN customers c ON c.id = a.customer_id
            JOIN branches b ON b.id = c.branch_id
            WHERE t.status = 'success'
              [[AND t.created_at >= {{date_from}}]]
              [[AND t.created_at::date <= {{date_to}}]]
              [[AND t.channel = {{channel}}]]
              [[AND b.name = {{branch}}]]""";

        Question count = filteredQuestion(ds, "Transactions", VizType.NUMBER, params,
            "SELECT count(*) AS transactions\n" + from, "{}");
        Question volume = filteredQuestion(ds, "Volume", VizType.NUMBER, params,
            "SELECT round(sum(t.amount)) AS volume\n" + from,
            """
            {"format":{"style":"compact","suffix":" AZN"}}""");
        Question daily = filteredQuestion(ds, "Daily transactions", VizType.LINE, params,
            "SELECT t.created_at::date AS day, count(*) AS transactions\n" + from + "\nGROUP BY 1\nORDER BY 1",
            """
            {"x":"day","y":["transactions"]}""");
        Question byCategory = filteredQuestion(ds, "Transactions by category and channel", VizType.BAR, params,
            "SELECT t.category, t.channel, count(*) AS transactions\n" + from + "\nGROUP BY 1, 2\nORDER BY 1, 2",
            """
            {"x":"category","y":["transactions"],"series":"channel","stack":"normal"}""");
        Question top = filteredQuestion(ds, "Top customers", VizType.TABLE, params,
            "SELECT c.full_name AS customer, c.segment, b.name AS branch, count(*) AS transactions,\n"
                + "       round(sum(t.amount)) AS volume\n" + from
                + "\nGROUP BY 1, 2, 3\nORDER BY volume DESC\nLIMIT 20",
            "{}");

        Map<String, String> mapping = Map.of("date_from", "date_from", "date_to", "date_to",
            "channel", "channel", "branch", "branch");
        Dashboard d = new Dashboard();
        d.setName(EXPLORER_NAME);
        d.setDescription("Change the filters at the top: every card updates");
        d.setFilters(params);
        for (Object[] c : new Object[][]{
            {count, 0, 0, 3, 3}, {volume, 3, 0, 3, 3}, {byCategory, 6, 0, 6, 10},
            {daily, 0, 3, 6, 7}, {top, 0, 10, 12, 8}}) {
            DashboardCard card = new DashboardCard(d, ((Question) c[0]).getId(), (int) c[1], (int) c[2], (int) c[3], (int) c[4]);
            card.setParameterMappings(json.write(mapping));
            d.getCards().add(card);
        }
        dashboards.save(d);
        log.info("Seeded filter demo dashboard");
    }

    private Question filteredQuestion(DataSourceEntity ds, String name, VizType viz, String params, String sql,
                                      String settings) {
        Question q = new Question();
        q.setName(name);
        q.setDataSourceId(ds.getId());
        q.setSql(sql);
        q.setParameters(params);
        q.setVizType(viz);
        q.setVizSettings(settings);
        return questions.save(q);
    }

    private void seedChartGallery(DataSourceEntity ds) {
        Question trend = question(ds, "Daily transactions: yesterday vs day before", VizType.TREND,
            """
            SELECT created_at::date AS day, count(*) AS transactions
            FROM transactions
            WHERE created_at::date BETWEEN current_date - 2 AND current_date - 1
            GROUP BY 1
            ORDER BY 1""",
            """
            {"x":"day","value":"transactions"}""");
        Question progress = question(ds, "Transfers this month vs target", VizType.PROGRESS,
            """
            SELECT round(sum(amount)) AS transfer_volume
            FROM transactions
            WHERE category = 'transfer' AND status = 'success' AND created_at >= date_trunc('month', now())""",
            """
            {"value":"transfer_volume","goal":300000,"format":{"suffix":" AZN"}}""");
        Question gauge = question(ds, "Transaction success rate", VizType.GAUGE,
            """
            SELECT avg(CASE WHEN status = 'success' THEN 1.0 ELSE 0 END) AS success_rate
            FROM transactions""",
            """
            {"value":"success_rate","min":0.9,"max":1,"format":{"style":"percent","decimals":1}}""");
        Question funnel = question(ds, "Loan application funnel (demo numbers)", VizType.FUNNEL,
            """
            SELECT stage, customers FROM (
              SELECT 1 AS step, 'Applied' AS stage, 1200 AS customers
              UNION ALL SELECT 2, 'Scored', 950
              UNION ALL SELECT 3, 'Approved', 610
              UNION ALL SELECT 4, 'Disbursed', 540
            ) s
            ORDER BY step""",
            """
            {"x":"stage","y":["customers"]}""");
        Question stacked = question(ds, "Monthly transactions by channel", VizType.BAR,
            """
            SELECT date_trunc('month', created_at)::date AS month, channel, count(*) AS transactions
            FROM transactions
            GROUP BY 1, 2
            ORDER BY 1, 2""",
            """
            {"x":"month","y":["transactions"],"series":"channel","stack":"normal"}""");
        Question combo = question(ds, "Monthly volume and average amount", VizType.COMBO,
            """
            SELECT date_trunc('month', created_at)::date AS month, count(*) AS transactions,
                   round(avg(amount), 2) AS avg_amount
            FROM transactions
            GROUP BY 1
            ORDER BY 1""",
            """
            {"x":"month","y":["transactions","avg_amount"],"lineSeries":["avg_amount"]}""");
        Question row = question(ds, "Customers by city", VizType.ROW,
            """
            SELECT city, count(*) AS customers
            FROM customers
            GROUP BY city
            ORDER BY customers DESC""",
            """
            {"x":"city","y":["customers"],"showLabels":true}""");
        Question mix = question(ds, "Weekly channel mix (100%)", VizType.AREA,
            """
            SELECT date_trunc('week', created_at)::date AS week, channel, count(*) AS transactions
            FROM transactions
            GROUP BY 1, 2
            ORDER BY 1, 2""",
            """
            {"x":"week","y":["transactions"],"series":"channel","stack":"percent"}""");
        Question waterfall = question(ds, "Net cash flow by category (last 30 days)", VizType.WATERFALL,
            """
            SELECT category, round(sum(CASE WHEN category = 'salary' THEN amount ELSE -amount END)) AS net
            FROM transactions
            WHERE status = 'success' AND created_at >= now() - interval '30 days'
            GROUP BY category
            ORDER BY net DESC""",
            """
            {"x":"category","y":["net"],"format":{"style":"compact"}}""");
        Question scatter = question(ds, "Customer balance vs activity", VizType.SCATTER,
            """
            WITH bal AS (
              SELECT customer_id, sum(balance) AS balance FROM accounts GROUP BY customer_id
            ), act AS (
              SELECT a.customer_id, count(*) AS transactions
              FROM transactions t JOIN accounts a ON a.id = t.account_id
              GROUP BY a.customer_id
            )
            SELECT c.segment, bal.balance, coalesce(act.transactions, 0) AS transactions
            FROM customers c
            JOIN bal ON bal.customer_id = c.id
            LEFT JOIN act ON act.customer_id = c.id""",
            """
            {"x":"balance","y":["transactions"],"series":"segment"}""");

        Dashboard d = new Dashboard();
        d.setName(GALLERY_NAME);
        d.setDescription("One example of each chart type, on the synthetic sample database");
        d.getCards().add(new DashboardCard(d, trend.getId(), 0, 0, 3, 4));
        d.getCards().add(new DashboardCard(d, progress.getId(), 3, 0, 3, 4));
        d.getCards().add(new DashboardCard(d, gauge.getId(), 6, 0, 3, 4));
        d.getCards().add(new DashboardCard(d, funnel.getId(), 9, 0, 3, 8));
        d.getCards().add(new DashboardCard(d, stacked.getId(), 0, 4, 5, 8));
        d.getCards().add(new DashboardCard(d, combo.getId(), 5, 4, 4, 8));
        d.getCards().add(new DashboardCard(d, row.getId(), 9, 8, 3, 8));
        d.getCards().add(new DashboardCard(d, mix.getId(), 0, 12, 5, 8));
        d.getCards().add(new DashboardCard(d, waterfall.getId(), 5, 12, 4, 8));
        d.getCards().add(new DashboardCard(d, scatter.getId(), 0, 20, 12, 9));
        dashboards.save(d);
        log.info("Seeded chart gallery dashboard");
    }

    private void seedMongoSample(AppProperties.SampleDb sample) {
        DataSourceEntity ds = new DataSourceEntity();
        ds.setName("Bank events (MongoDB)");
        ds.setEngine(Engine.MONGODB);
        ds.setJdbcUrl(sample.url());
        ds.setUsername(sample.username());
        ds.setPasswordEncrypted(crypto.encrypt(sample.password()));
        ds = dataSources.save(ds);

        Question open = mongoQuestion(ds, "Open support tickets", VizType.NUMBER, "support_tickets",
            """
            [
              { "$match": { "status": { "$in": ["open", "in_progress"] } } },
              { "$count": "open_tickets" }
            ]""",
            "{\"value\":\"open_tickets\"}");
        Question platform = mongoQuestion(ds, "App events by platform", VizType.PIE, "app_events",
            """
            [
              { "$group": { "_id": "$platform", "events": { "$sum": 1 } } },
              { "$project": { "_id": 0, "platform": "$_id", "events": 1 } },
              { "$sort": { "events": -1 } }
            ]""",
            "{\"x\":\"platform\",\"y\":[\"events\"]}");
        Question logins = mongoQuestion(ds, "Daily app logins", VizType.AREA, "app_events",
            """
            [
              { "$match": { "type": "login" } },
              { "$group": {
                  "_id": { "$dateToString": { "format": "%Y-%m-%d", "date": "$created_at" } },
                  "logins": { "$sum": 1 } } },
              { "$sort": { "_id": 1 } },
              { "$project": { "_id": 0, "day": "$_id", "logins": 1 } }
            ]""",
            "{\"x\":\"day\",\"y\":[\"logins\"]}");
        Question failed = mongoQuestion(ds, "Failed app actions by type", VizType.BAR, "app_events",
            """
            [
              { "$match": { "success": false } },
              { "$group": { "_id": "$type", "failed": { "$sum": 1 } } },
              { "$project": { "_id": 0, "type": "$_id", "failed": 1 } },
              { "$sort": { "failed": -1 } }
            ]""",
            "{\"x\":\"type\",\"y\":[\"failed\"]}");
        Question csat = mongoQuestion(ds, "Support satisfaction by topic", VizType.TABLE, "support_tickets",
            """
            [
              { "$match": { "csat": { "$ne": null } } },
              { "$group": { "_id": "$topic", "tickets": { "$sum": 1 }, "avg_csat": { "$avg": "$csat" } } },
              { "$project": { "_id": 0, "topic": "$_id", "tickets": 1, "avg_csat": { "$round": ["$avg_csat", 2] } } },
              { "$sort": { "avg_csat": 1 } }
            ]""",
            "{}");

        Dashboard d = new Dashboard();
        d.setName("Digital channels (MongoDB)");
        d.setDescription("Demo dashboard on the synthetic MongoDB sample database");
        d.getCards().add(new DashboardCard(d, open.getId(), 0, 0, 4, 3));
        d.getCards().add(new DashboardCard(d, platform.getId(), 4, 0, 4, 6));
        d.getCards().add(new DashboardCard(d, csat.getId(), 8, 0, 4, 6));
        d.getCards().add(new DashboardCard(d, failed.getId(), 0, 3, 4, 7));
        d.getCards().add(new DashboardCard(d, logins.getId(), 4, 6, 8, 7));
        dashboards.save(d);
        log.info("Seeded MongoDB sample data source, questions and dashboard");
    }

    private Question mongoQuestion(DataSourceEntity ds, String name, VizType viz, String collection,
                                   String pipeline, String settings) {
        Question q = new Question();
        q.setName(name);
        q.setDataSourceId(ds.getId());
        q.setCollectionName(collection);
        q.setSql(pipeline);
        q.setVizType(viz);
        q.setVizSettings(settings);
        return questions.save(q);
    }

    private void seedSample(AppProperties.SampleDb sample) {
        DataSourceEntity ds = new DataSourceEntity();
        ds.setName(SAMPLE_PG_NAME);
        ds.setEngine(Engine.POSTGRES);
        ds.setJdbcUrl(sample.url());
        ds.setUsername(sample.username());
        ds.setPasswordEncrypted(crypto.encrypt(sample.password()));
        ds.setSchemaFilter("public");
        ds = dataSources.save(ds);

        Question total = question(ds, "Transaction volume (180 days)", VizType.NUMBER,
            "SELECT round(sum(amount)) AS total_azn FROM transactions WHERE status = 'success'",
            "{\"value\":\"total_azn\"}");
        Question daily = question(ds, "Daily transactions", VizType.LINE,
            """
            SELECT date_trunc('day', created_at)::date AS day, count(*) AS transactions
            FROM transactions
            GROUP BY 1
            ORDER BY 1""",
            "{\"x\":\"day\",\"y\":[\"transactions\"]}");
        Question channel = question(ds, "Transactions by channel", VizType.PIE,
            "SELECT channel, count(*) AS transactions FROM transactions GROUP BY channel ORDER BY 2 DESC",
            "{\"x\":\"channel\",\"y\":[\"transactions\"]}");
        Question branches = question(ds, "Customers per branch", VizType.BAR,
            """
            SELECT b.name AS branch, count(c.id) AS customers
            FROM branches b LEFT JOIN customers c ON c.branch_id = b.id
            GROUP BY b.name
            ORDER BY customers DESC""",
            "{\"x\":\"branch\",\"y\":[\"customers\"]}");
        Question failed = question(ds, "Failed transactions by category", VizType.TABLE,
            """
            SELECT category, count(*) AS failed, round(avg(amount), 2) AS avg_amount
            FROM transactions WHERE status = 'failed'
            GROUP BY category ORDER BY failed DESC""",
            "{}");

        Dashboard d = new Dashboard();
        d.setName("Retail banking overview");
        d.setDescription("Demo dashboard on the synthetic sample database");
        d.getCards().add(new DashboardCard(d, total.getId(), 0, 0, 4, 3));
        d.getCards().add(new DashboardCard(d, channel.getId(), 4, 0, 4, 6));
        d.getCards().add(new DashboardCard(d, failed.getId(), 8, 0, 4, 6));
        d.getCards().add(new DashboardCard(d, branches.getId(), 0, 3, 4, 7));
        d.getCards().add(new DashboardCard(d, daily.getId(), 4, 6, 8, 7));
        dashboards.save(d);
        log.info("Seeded sample data source, questions and dashboard");
    }

    private Question question(DataSourceEntity ds, String name, VizType viz, String sql, String settings) {
        Question q = new Question();
        q.setName(name);
        q.setDataSourceId(ds.getId());
        q.setSql(sql);
        q.setVizType(viz);
        q.setVizSettings(settings);
        return questions.save(q);
    }
}
