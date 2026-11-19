package az.birbank.dashboard.datasource;

import az.birbank.dashboard.common.BadRequestException;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.*;

@Service
public class MetadataService {

    private static final int MAX_TABLES = 1000;

    private final ConnectionPoolRegistry pools;

    public MetadataService(ConnectionPoolRegistry pools) {
        this.pools = pools;
    }

    public record Column(String name, String type, boolean nullable) {}

    public record Table(String schema, String name, String type, List<Column> columns) {}

    public List<Table> schema(DataSourceEntity ds) {
        Set<String> allowed = parseFilter(ds.getSchemaFilter());
        DataSource pool = pools.get(ds);
        try (Connection conn = pool.getConnection()) {
            DatabaseMetaData md = conn.getMetaData();
            String catalog = conn.getCatalog();
            Map<String, Table> tables = new LinkedHashMap<>();

            try (ResultSet rs = md.getTables(catalog, null, "%", new String[]{"TABLE", "VIEW"})) {
                while (rs.next() && tables.size() < MAX_TABLES) {
                    String schema = rs.getString("TABLE_SCHEM");
                    if (!isVisible(ds.getEngine(), schema, allowed)) continue;
                    String name = rs.getString("TABLE_NAME");
                    tables.put(key(schema, name), new Table(schema, name, rs.getString("TABLE_TYPE"), new ArrayList<>()));
                }
            }

            Set<String> schemas = new LinkedHashSet<>();
            tables.values().forEach(t -> schemas.add(t.schema()));
            for (String schema : schemas) {
                try (ResultSet rs = md.getColumns(catalog, schema, "%", "%")) {
                    while (rs.next()) {
                        Table t = tables.get(key(rs.getString("TABLE_SCHEM"), rs.getString("TABLE_NAME")));
                        if (t != null) {
                            t.columns().add(new Column(rs.getString("COLUMN_NAME"), rs.getString("TYPE_NAME"),
                                rs.getInt("NULLABLE") != DatabaseMetaData.columnNoNulls));
                        }
                    }
                }
            }
            return new ArrayList<>(tables.values());
        } catch (SQLException e) {
            throw new BadRequestException("Could not read the database schema: " + e.getMessage());
        }
    }

    private static boolean isVisible(Engine engine, String schema, Set<String> allowed) {
        if (!allowed.isEmpty()) return schema != null && allowed.contains(schema.toLowerCase());
        return !engine.isSystemSchema(schema);
    }

    private static Set<String> parseFilter(String filter) {
        Set<String> set = new HashSet<>();
        if (filter == null) return set;
        for (String s : filter.split(",")) {
            if (!s.isBlank()) set.add(s.trim().toLowerCase());
        }
        return set;
    }

    private static String key(String schema, String table) {
        return schema + "." + table;
    }
}
