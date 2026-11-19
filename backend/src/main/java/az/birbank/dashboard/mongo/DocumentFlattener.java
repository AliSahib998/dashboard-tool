package az.birbank.dashboard.mongo;

import org.bson.Document;
import org.bson.json.JsonMode;
import org.bson.json.JsonWriterSettings;
import org.bson.types.Binary;
import org.bson.types.Decimal128;
import org.bson.types.ObjectId;

import java.time.ZoneOffset;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Turns nested documents into flat rows: {customer: {city: "Baku"}} becomes column "customer.city". */
final class DocumentFlattener {

    private static final int MAX_DEPTH = 5;
    private static final JsonWriterSettings JSON = JsonWriterSettings.builder().outputMode(JsonMode.RELAXED).build();

    private DocumentFlattener() {}

    static Map<String, Object> flatten(Document doc) {
        Map<String, Object> out = new LinkedHashMap<>();
        flatten("", doc, out, 0);
        return out;
    }

    private static void flatten(String prefix, Document doc, Map<String, Object> out, int depth) {
        for (var e : doc.entrySet()) {
            String key = prefix.isEmpty() ? e.getKey() : prefix + "." + e.getKey();
            Object v = e.getValue();
            if (v instanceof Document nested && depth < MAX_DEPTH && !nested.isEmpty()) {
                flatten(key, nested, out, depth + 1);
            } else {
                out.put(key, v);
            }
        }
    }

    /** number, date, boolean or string, matching the SQL result types. */
    static String typeOf(Object raw) {
        if (raw instanceof Number || raw instanceof Decimal128) return "number";
        if (raw instanceof Date) return "date";
        if (raw instanceof Boolean) return "boolean";
        return "string";
    }

    static Object toJsonValue(Object v) {
        if (v == null || v instanceof String || v instanceof Boolean) return v;
        if (v instanceof Number n) {
            if (n instanceof Double d && (d.isNaN() || d.isInfinite())) return null;
            return n;
        }
        if (v instanceof Decimal128 d) {
            return d.isNaN() || d.isInfinite() ? null : d.bigDecimalValue();
        }
        if (v instanceof ObjectId id) return id.toHexString();
        if (v instanceof Date d) return d.toInstant().atOffset(ZoneOffset.UTC).toLocalDateTime().toString();
        if (v instanceof Binary) return "[binary]";
        if (v instanceof List<?> || v instanceof Document) {
            String json = new Document("v", v).toJson(JSON);
            return json.substring(json.indexOf(':') + 1, json.length() - 1).trim();
        }
        return v.toString();
    }
}
