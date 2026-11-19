package az.birbank.dashboard.params;

import org.springframework.stereotype.Component;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;
import java.util.Map;

/** Reads and writes the JSON stored in text columns (parameters, filters, mappings). */
@Component
public class JsonColumns {

    private static final TypeReference<List<ParameterDef>> PARAMS = new TypeReference<>() {};
    private static final TypeReference<Map<String, String>> MAP = new TypeReference<>() {};

    private final JsonMapper mapper;

    public JsonColumns(JsonMapper mapper) {
        this.mapper = mapper;
    }

    public String write(Object value) {
        return value == null ? null : mapper.writeValueAsString(value);
    }

    public List<ParameterDef> params(String json) {
        return json == null || json.isBlank() ? List.of() : mapper.readValue(json, PARAMS);
    }

    public Map<String, String> map(String json) {
        return json == null || json.isBlank() ? Map.of() : mapper.readValue(json, MAP);
    }
}
