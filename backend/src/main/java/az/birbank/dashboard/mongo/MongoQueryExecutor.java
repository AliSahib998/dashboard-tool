package az.birbank.dashboard.mongo;

import az.birbank.dashboard.common.BadRequestException;
import az.birbank.dashboard.datasource.DataSourceEntity;
import az.birbank.dashboard.datasource.MetadataService;
import az.birbank.dashboard.query.QueryResult;
import com.mongodb.MongoException;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoCursor;
import com.mongodb.client.MongoDatabase;
import org.bson.BsonDocument;
import org.bson.BsonInt32;
import org.bson.Document;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.TimeUnit;

@Service
public class MongoQueryExecutor {

    private static final int MAX_COLUMNS = 200;
    private static final int MAX_COLLECTIONS = 300;
    private static final int SAMPLE_SIZE = 100;

    private final MongoClientRegistry clients;

    public MongoQueryExecutor(MongoClientRegistry clients) {
        this.clients = clients;
    }

    public QueryResult run(DataSourceEntity ds, String collection, String pipelineText, int maxRows, int timeoutSeconds) {
        long start = System.currentTimeMillis();
        MongoPipelineGuard.validateCollection(collection);
        List<BsonDocument> pipeline = new ArrayList<>(MongoPipelineGuard.parse(pipelineText));
        pipeline.add(new BsonDocument("$limit", new BsonInt32(maxRows + 1)));

        List<Map<String, Object>> docs = new ArrayList<>();
        boolean truncated = false;
        try (MongoCursor<Document> cursor = clients.database(ds).getCollection(collection)
                .aggregate(pipeline)
                .maxTime(timeoutSeconds, TimeUnit.SECONDS)
                .allowDiskUse(false)
                .batchSize(500)
                .iterator()) {
            while (cursor.hasNext()) {
                Document d = cursor.next();
                if (docs.size() >= maxRows) {
                    truncated = true;
                    break;
                }
                docs.add(DocumentFlattener.flatten(d));
            }
        } catch (MongoException e) {
            throw new MongoQueryException(e.getMessage(), e);
        }
        return toResult(docs, truncated, start);
    }

    public List<MetadataService.Table> schema(DataSourceEntity ds) {
        Set<String> allowed = new HashSet<>();
        if (ds.getSchemaFilter() != null) {
            for (String s : ds.getSchemaFilter().split(",")) {
                if (!s.isBlank()) allowed.add(s.trim());
            }
        }
        try {
            MongoDatabase db = clients.database(ds);
            List<String> names = new ArrayList<>();
            for (String name : db.listCollectionNames()) {
                if (name.startsWith("system.")) continue;
                if (!allowed.isEmpty() && !allowed.contains(name)) continue;
                names.add(name);
                if (names.size() >= MAX_COLLECTIONS) break;
            }
            Collections.sort(names);

            List<MetadataService.Table> tables = new ArrayList<>();
            for (String name : names) {
                Map<String, String> fields = new LinkedHashMap<>();
                for (Document d : db.getCollection(name)
                        .aggregate(List.of(new Document("$sample", new Document("size", SAMPLE_SIZE))))
                        .maxTime(10, TimeUnit.SECONDS)) {
                    DocumentFlattener.flatten(d).forEach((k, v) -> {
                        // Keep the first non-null type seen for each field.
                        if (v != null && "null".equals(fields.getOrDefault(k, "null"))) fields.put(k, mongoType(v));
                        else fields.putIfAbsent(k, "null");
                    });
                }
                List<MetadataService.Column> columns = fields.entrySet().stream()
                    .map(e -> new MetadataService.Column(e.getKey(), e.getValue(), true))
                    .toList();
                tables.add(new MetadataService.Table(null, name, "COLLECTION", columns));
            }
            return tables;
        } catch (MongoException e) {
            throw new BadRequestException("Could not read the MongoDB collections: " + e.getMessage());
        }
    }

    public String test(String url, String username, String password) {
        MongoClientRegistry.validateUrl(url);
        try (MongoClient client = clients.createUnpooled(url, username, password)) {
            MongoDatabase db = client.getDatabase(MongoClientRegistry.databaseName(url));
            db.runCommand(new Document("ping", 1));
            Document info = db.runCommand(new Document("buildInfo", 1));
            return "Connected to MongoDB " + info.getString("version") + ", database " + db.getName();
        }
    }

    private static QueryResult toResult(List<Map<String, Object>> docs, boolean truncated, long start) {
        LinkedHashMap<String, String> columnTypes = new LinkedHashMap<>();
        for (Map<String, Object> d : docs) {
            for (var e : d.entrySet()) {
                if (!columnTypes.containsKey(e.getKey())) {
                    if (columnTypes.size() >= MAX_COLUMNS) continue;
                    columnTypes.put(e.getKey(), null);
                }
                if (columnTypes.get(e.getKey()) == null && e.getValue() != null) {
                    columnTypes.put(e.getKey(), DocumentFlattener.typeOf(e.getValue()));
                }
            }
        }
        List<QueryResult.ResultColumn> columns = columnTypes.entrySet().stream()
            .map(e -> new QueryResult.ResultColumn(e.getKey(), e.getValue() == null ? "string" : e.getValue()))
            .toList();

        List<List<Object>> rows = new ArrayList<>(docs.size());
        for (Map<String, Object> d : docs) {
            List<Object> row = new ArrayList<>(columns.size());
            for (QueryResult.ResultColumn c : columns) {
                row.add(DocumentFlattener.toJsonValue(d.get(c.name())));
            }
            rows.add(row);
        }
        return new QueryResult(columns, rows, rows.size(), truncated, System.currentTimeMillis() - start);
    }

    private static String mongoType(Object v) {
        return switch (v) {
            case Integer i -> "int";
            case Long l -> "long";
            case Double d -> "double";
            case org.bson.types.Decimal128 d -> "decimal";
            case Boolean b -> "bool";
            case Date d -> "date";
            case org.bson.types.ObjectId o -> "objectId";
            case List<?> l -> "array";
            case Document d -> "object";
            default -> "string";
        };
    }

    /** A query that MongoDB itself rejected or failed (bad syntax, timeout, permission). */
    public static class MongoQueryException extends RuntimeException {
        public MongoQueryException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
