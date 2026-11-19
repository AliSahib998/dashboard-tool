package az.birbank.dashboard.params;

import az.birbank.dashboard.audit.AuditService;
import az.birbank.dashboard.auth.UserPrincipal;
import az.birbank.dashboard.common.BadRequestException;
import az.birbank.dashboard.common.NotFoundException;
import az.birbank.dashboard.datasource.ConnectionPoolRegistry;
import az.birbank.dashboard.datasource.DataSourceEntity;
import az.birbank.dashboard.datasource.DataSourceRepository;
import az.birbank.dashboard.datasource.MetadataService;
import az.birbank.dashboard.mongo.MongoClientRegistry;
import az.birbank.dashboard.mongo.MongoPipelineGuard;
import com.mongodb.MongoException;
import org.bson.BsonValue;
import org.springframework.stereotype.Service;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/**
 * Distinct values of one column, for dropdown filters. The table and column must exist in the
 * data source's metadata, and identifiers are quoted, so the request cannot inject SQL.
 */
@Service
public class FieldValuesService {

    private static final int MAX_VALUES = 1000;
    private static final Duration TTL = Duration.ofMinutes(10);

    private record Cached(List<String> values, Instant at) {}

    private final Map<String, Cached> cache = new ConcurrentHashMap<>();
    private final DataSourceRepository dataSources;
    private final MetadataService metadata;
    private final ConnectionPoolRegistry pools;
    private final MongoClientRegistry mongoClients;
    private final AuditService audit;

    public FieldValuesService(DataSourceRepository dataSources, MetadataService metadata, ConnectionPoolRegistry pools,
                              MongoClientRegistry mongoClients, AuditService audit) {
        this.dataSources = dataSources;
        this.metadata = metadata;
        this.pools = pools;
        this.mongoClients = mongoClients;
        this.audit = audit;
    }

    /** Values for a parameter: its static options, or the distinct values of its source column. */
    public List<String> valuesFor(ParameterDef def, UserPrincipal user) {
        if (def.source() == null || def.source().dataSourceId() == null) {
            return def.options() == null ? List.of() : def.options();
        }
        return values(def.source().dataSourceId(), def.source().table(), def.source().column(), user);
    }

    public List<String> values(Long dataSourceId, String table, String column, UserPrincipal user) {
        if (table == null || table.isBlank() || column == null || column.isBlank()) {
            throw new BadRequestException("Choose a table and a column");
        }
        String key = dataSourceId + "|" + table + "|" + column;
        Cached hit = cache.get(key);
        if (hit != null && hit.at().plus(TTL).isAfter(Instant.now())) return hit.values();

        DataSourceEntity ds = dataSources.findById(dataSourceId)
            .orElseThrow(() -> new NotFoundException("Data source", dataSourceId));
        List<String> values = ds.getEngine().isJdbc() ? jdbcValues(ds, table, column) : mongoValues(ds, table, column);
        audit.record(user, "FIELD_VALUES", dataSourceId, null, "distinct values of " + table + "." + column,
            values.size(), 0L, true, null);
        cache.put(key, new Cached(values, Instant.now()));
        return values;
    }

    private List<String> jdbcValues(DataSourceEntity ds, String table, String column) {
        MetadataService.Table t = metadata.schema(ds).stream()
            .filter(x -> x.name().equalsIgnoreCase(table)
                || (x.schema() != null && (x.schema() + "." + x.name()).equalsIgnoreCase(table)))
            .findFirst()
            .orElseThrow(() -> new BadRequestException("Unknown table " + table));
        MetadataService.Column c = t.columns().stream()
            .filter(x -> x.name().equalsIgnoreCase(column))
            .findFirst()
            .orElseThrow(() -> new BadRequestException("Unknown column " + column + " in " + table));

        try (Connection conn = pools.get(ds).getConnection(); Statement stmt = conn.createStatement()) {
            String q = conn.getMetaData().getIdentifierQuoteString();
            String col = quote(c.name(), q);
            String from = (t.schema() == null ? "" : quote(t.schema(), q) + ".") + quote(t.name(), q);
            stmt.setQueryTimeout(30);
            stmt.setMaxRows(MAX_VALUES);
            List<String> values = new ArrayList<>();
            try (ResultSet rs = stmt.executeQuery(
                "SELECT DISTINCT " + col + " FROM " + from + " WHERE " + col + " IS NOT NULL ORDER BY 1")) {
                while (rs.next()) values.add(rs.getString(1));
            }
            return values;
        } catch (SQLException e) {
            throw new BadRequestException("Could not read values: " + e.getMessage());
        }
    }

    private List<String> mongoValues(DataSourceEntity ds, String collection, String field) {
        MongoPipelineGuard.validateCollection(collection);
        if (field.startsWith("$")) throw new BadRequestException("Invalid field name");
        try {
            Set<String> values = new TreeSet<>();
            for (BsonValue v : mongoClients.database(ds).getCollection(collection)
                    .distinct(field, BsonValue.class).maxTime(10, TimeUnit.SECONDS)) {
                if (v == null || v.isNull() || v.isDocument() || v.isArray()) continue;
                values.add(switch (v.getBsonType()) {
                    case STRING -> v.asString().getValue();
                    case INT32 -> String.valueOf(v.asInt32().getValue());
                    case INT64 -> String.valueOf(v.asInt64().getValue());
                    case DOUBLE -> String.valueOf(v.asDouble().getValue());
                    case DECIMAL128 -> v.asDecimal128().getValue().bigDecimalValue().toPlainString();
                    case BOOLEAN -> String.valueOf(v.asBoolean().getValue());
                    case OBJECT_ID -> v.asObjectId().getValue().toHexString();
                    default -> v.toString();
                });
                if (values.size() >= MAX_VALUES) break;
            }
            return new ArrayList<>(values);
        } catch (MongoException e) {
            throw new BadRequestException("Could not read values: " + e.getMessage());
        }
    }

    private static String quote(String identifier, String q) {
        if (q == null || q.isBlank()) return identifier;
        return q + identifier.replace(q, q + q) + q;
    }
}
