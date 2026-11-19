package az.birbank.dashboard.params;

import az.birbank.dashboard.common.BadRequestException;
import org.bson.BsonDateTime;
import org.bson.BsonDocument;
import org.bson.BsonDouble;
import org.bson.BsonInt64;
import org.bson.BsonString;
import org.bson.BsonValue;
import org.bson.json.JsonMode;
import org.bson.json.JsonWriterSettings;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Turns a query template into an executable query.
 * <ul>
 *   <li>{@code {{name}}} is a variable. Do not put quotes around it.</li>
 *   <li>{@code [[ ... ]]} is optional: it is removed when any variable inside has no value.</li>
 * </ul>
 * Values are never spliced into SQL text: each variable becomes a JDBC {@code ?} parameter.
 * For MongoDB, each value is encoded as a typed BSON literal, so it cannot change the pipeline structure.
 */
public final class TemplateRenderer {

    private static final Pattern VARIABLE = Pattern.compile("\\{\\{\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*}}");
    private static final Pattern OPTIONAL = Pattern.compile("\\[\\[(.*?)]]", Pattern.DOTALL);
    private static final JsonWriterSettings JSON = JsonWriterSettings.builder().outputMode(JsonMode.RELAXED).build();

    private TemplateRenderer() {}

    /** SQL with ? placeholders, the typed values in order, and the values used (for the audit log). */
    public record SqlQuery(String sql, List<Object> parameters, Map<String, String> used) {}

    public record MongoQuery(String pipeline, Map<String, String> used) {}

    public static boolean hasVariables(String template) {
        return template != null && (VARIABLE.matcher(template).find() || template.contains("[["));
    }

    public static SqlQuery renderSql(String template, List<ParameterDef> defs, Map<String, String> values) {
        Context ctx = new Context(defs, values);
        String text = ctx.resolveOptionalBlocks(template);
        List<Object> params = new ArrayList<>();
        Matcher m = VARIABLE.matcher(text);
        StringBuilder out = new StringBuilder();
        while (m.find()) {
            params.add(ctx.typedValue(m.group(1)));
            m.appendReplacement(out, "?");
        }
        m.appendTail(out);
        return new SqlQuery(out.toString(), params, ctx.used);
    }

    public static MongoQuery renderMongo(String template, List<ParameterDef> defs, Map<String, String> values) {
        Context ctx = new Context(defs, values);
        String text = ctx.resolveOptionalBlocks(template);
        Matcher m = VARIABLE.matcher(text);
        StringBuilder out = new StringBuilder();
        while (m.find()) {
            m.appendReplacement(out, Matcher.quoteReplacement(bsonLiteral(ctx.typedValue(m.group(1)))));
        }
        m.appendTail(out);
        return new MongoQuery(out.toString(), ctx.used);
    }

    private static String bsonLiteral(Object value) {
        BsonValue bson = switch (value) {
            case BigDecimal d when d.stripTrailingZeros().scale() <= 0 && d.abs().compareTo(BigDecimal.valueOf(Long.MAX_VALUE)) <= 0 ->
                new BsonInt64(d.longValueExact());
            case BigDecimal d -> new BsonDouble(d.doubleValue());
            case LocalDate d -> new BsonDateTime(d.atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli());
            default -> new BsonString(value.toString());
        };
        String json = new BsonDocument("v", bson).toJson(JSON);
        return json.substring(json.indexOf(':') + 1, json.lastIndexOf('}')).trim();
    }

    private static final class Context {
        private final Map<String, ParameterDef> defs = new HashMap<>();
        private final Map<String, String> values;
        private final Map<String, String> used = new LinkedHashMap<>();

        Context(List<ParameterDef> defs, Map<String, String> values) {
            if (defs != null) defs.forEach(d -> this.defs.put(d.name(), d));
            this.values = values == null ? Map.of() : values;
        }

        /** The raw value: the one given, else the default, else null. */
        String raw(String name) {
            String v = values.get(name);
            if (v != null && !v.isBlank()) return v.trim();
            ParameterDef d = defs.get(name);
            return d != null && d.defaultValue() != null && !d.defaultValue().isBlank() ? d.defaultValue().trim() : null;
        }

        String resolveOptionalBlocks(String template) {
            Matcher m = OPTIONAL.matcher(template);
            StringBuilder out = new StringBuilder();
            while (m.find()) {
                String inner = m.group(1);
                Matcher vars = VARIABLE.matcher(inner);
                boolean keep = true;
                while (vars.find()) {
                    if (raw(vars.group(1)) == null) keep = false;
                }
                m.appendReplacement(out, Matcher.quoteReplacement(keep ? inner : ""));
            }
            m.appendTail(out);
            return out.toString();
        }

        Object typedValue(String name) {
            ParameterDef def = defs.get(name);
            String label = def == null ? name : def.labelOrName();
            String raw = raw(name);
            if (raw == null) {
                throw new BadRequestException("Enter a value for \"" + label + "\" (or make that part of the query optional with [[ ]])");
            }
            used.put(name, raw);
            String type = def == null ? "text" : def.typeOrText();
            return switch (type) {
                case "number" -> {
                    try {
                        yield new BigDecimal(raw);
                    } catch (NumberFormatException e) {
                        throw new BadRequestException("\"" + raw + "\" is not a number for " + label);
                    }
                }
                case "date" -> DateResolver.resolve(raw, label);
                default -> raw;
            };
        }
    }
}
