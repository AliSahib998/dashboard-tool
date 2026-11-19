package az.birbank.dashboard.query;

import az.birbank.dashboard.audit.AuditService;
import az.birbank.dashboard.auth.UserPrincipal;
import az.birbank.dashboard.common.BadRequestException;
import az.birbank.dashboard.common.NotFoundException;
import az.birbank.dashboard.config.AppProperties;
import az.birbank.dashboard.datasource.ConnectionPoolRegistry;
import az.birbank.dashboard.datasource.DataSourceEntity;
import az.birbank.dashboard.datasource.DataSourceRepository;
import az.birbank.dashboard.mongo.MongoQueryExecutor;
import az.birbank.dashboard.params.ParameterDef;
import az.birbank.dashboard.params.TemplateRenderer;
import org.springframework.stereotype.Service;

import java.sql.*;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class QueryService {

    private final DataSourceRepository dataSources;
    private final ConnectionPoolRegistry pools;
    private final MongoQueryExecutor mongo;
    private final AuditService audit;
    private final AppProperties props;

    public QueryService(DataSourceRepository dataSources, ConnectionPoolRegistry pools, MongoQueryExecutor mongo,
                        AuditService audit, AppProperties props) {
        this.dataSources = dataSources;
        this.pools = pools;
        this.mongo = mongo;
        this.audit = audit;
        this.props = props;
    }

    /**
     * Runs a query against a data source and records it in the audit log.
     *
     * @param query      SQL for JDBC data sources, an aggregation pipeline (JSON array) for MongoDB;
     *                   may contain {{variables}} and [[optional parts]]
     * @param collection MongoDB collection; ignored for SQL data sources
     * @param params     definitions of the variables (types, defaults)
     * @param values     variable values; missing ones fall back to defaults
     */
    public QueryResult run(Long dataSourceId, String query, String collection, List<ParameterDef> params,
                           Map<String, String> values, Long questionId, UserPrincipal user) {
        DataSourceEntity ds = dataSources.findById(dataSourceId)
            .orElseThrow(() -> new NotFoundException("Data source", dataSourceId));
        return ds.getEngine().isJdbc()
            ? runSql(ds, query, params, values, questionId, user)
            : runMongo(ds, collection, query, params, values, questionId, user);
    }

    private static String describe(Map<String, String> used) {
        return used.isEmpty() ? "" : "\n-- filters: " + used.entrySet().stream()
            .map(e -> e.getKey() + "=" + e.getValue()).collect(Collectors.joining(", "));
    }

    private QueryResult runMongo(DataSourceEntity ds, String collection, String template, List<ParameterDef> params,
                                 Map<String, String> values, Long questionId, UserPrincipal user) {
        String action = questionId == null ? "RUN_MONGO" : "RUN_QUESTION";
        String pipeline = template;
        String auditText = "db." + collection + ".aggregate(" + template + ")";
        long start = System.currentTimeMillis();
        try {
            TemplateRenderer.MongoQuery rendered = TemplateRenderer.renderMongo(template, params, values);
            pipeline = rendered.pipeline();
            auditText = "db." + collection + ".aggregate(" + pipeline + ")" + describe(rendered.used());
            QueryResult result = mongo.run(ds, collection, pipeline, props.query().maxRows(), props.query().timeoutSeconds());
            audit.record(user, action, ds.getId(), questionId, auditText, result.rowCount(), result.durationMs(), true, null);
            return result;
        } catch (BadRequestException e) {
            audit.record(user, action, ds.getId(), questionId, auditText, null, 0L, false, e.getMessage());
            throw e;
        } catch (MongoQueryExecutor.MongoQueryException e) {
            audit.record(user, action, ds.getId(), questionId, auditText, null,
                System.currentTimeMillis() - start, false, e.getMessage());
            throw new BadRequestException("Query failed: " + e.getMessage());
        }
    }

    private QueryResult runSql(DataSourceEntity ds, String template, List<ParameterDef> params,
                               Map<String, String> values, Long questionId, UserPrincipal user) {
        String action = questionId == null ? "RUN_SQL" : "RUN_QUESTION";
        long start = System.currentTimeMillis();
        String safeSql;
        TemplateRenderer.SqlQuery rendered;
        try {
            rendered = TemplateRenderer.renderSql(template, params, values);
            safeSql = SqlGuard.validate(rendered.sql());
        } catch (BadRequestException e) {
            audit.record(user, action, ds.getId(), questionId, template, null, 0L, false, e.getMessage());
            throw e;
        }
        String auditText = safeSql + describe(rendered.used());

        int maxRows = props.query().maxRows();
        try (Connection conn = pools.get(ds).getConnection();
             PreparedStatement stmt = conn.prepareStatement(safeSql)) {
            conn.setReadOnly(true);
            stmt.setQueryTimeout(props.query().timeoutSeconds());
            stmt.setMaxRows(maxRows + 1);
            stmt.setFetchSize(500);
            bind(stmt, rendered.parameters());

            try (ResultSet rs = stmt.executeQuery()) {
                QueryResult result = read(rs, maxRows, start);
                audit.record(user, action, ds.getId(), questionId, auditText, result.rowCount(),
                    result.durationMs(), true, null);
                return result;
            }
        } catch (SQLException e) {
            long duration = System.currentTimeMillis() - start;
            audit.record(user, action, ds.getId(), questionId, auditText, null, duration, false, e.getMessage());
            throw new BadRequestException("Query failed: " + e.getMessage());
        }
    }

    private static void bind(PreparedStatement stmt, List<Object> values) throws SQLException {
        for (int i = 0; i < values.size(); i++) {
            Object v = values.get(i);
            switch (v) {
                case java.math.BigDecimal d -> stmt.setBigDecimal(i + 1, d);
                case java.time.LocalDate d -> stmt.setDate(i + 1, java.sql.Date.valueOf(d));
                default -> stmt.setString(i + 1, v.toString());
            }
        }
    }

    private static QueryResult read(ResultSet rs, int maxRows, long start) throws SQLException {
        ResultSetMetaData md = rs.getMetaData();
        int n = md.getColumnCount();
        List<QueryResult.ResultColumn> columns = new ArrayList<>(n);
        for (int i = 1; i <= n; i++) {
            columns.add(new QueryResult.ResultColumn(md.getColumnLabel(i), simpleType(md.getColumnType(i))));
        }

        List<List<Object>> rows = new ArrayList<>();
        boolean truncated = false;
        while (rs.next()) {
            if (rows.size() >= maxRows) {
                truncated = true;
                break;
            }
            List<Object> row = new ArrayList<>(n);
            for (int i = 1; i <= n; i++) {
                row.add(toJson(rs.getObject(i)));
            }
            rows.add(row);
        }
        return new QueryResult(columns, rows, rows.size(), truncated, System.currentTimeMillis() - start);
    }

    private static Object toJson(Object v) {
        if (v == null || v instanceof Number || v instanceof Boolean || v instanceof String) return v;
        if (v instanceof Timestamp ts) return ts.toLocalDateTime().toString();
        if (v instanceof java.sql.Date d) return d.toLocalDate().toString();
        if (v instanceof Time t) return t.toLocalTime().toString();
        if (v instanceof java.time.temporal.TemporalAccessor) return v.toString();
        if (v instanceof Clob clob) {
            try {
                return clob.getSubString(1, (int) Math.min(clob.length(), 10_000));
            } catch (SQLException e) {
                return "[clob]";
            }
        }
        if (v instanceof byte[] || v instanceof Blob) return "[binary]";
        return v.toString();
    }

    private static String simpleType(int sqlType) {
        return switch (sqlType) {
            case Types.TINYINT, Types.SMALLINT, Types.INTEGER, Types.BIGINT, Types.FLOAT, Types.REAL,
                 Types.DOUBLE, Types.NUMERIC, Types.DECIMAL -> "number";
            case Types.DATE, Types.TIME, Types.TIMESTAMP, Types.TIME_WITH_TIMEZONE,
                 Types.TIMESTAMP_WITH_TIMEZONE -> "date";
            case Types.BOOLEAN, Types.BIT -> "boolean";
            default -> "string";
        };
    }
}
