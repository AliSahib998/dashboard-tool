package az.birbank.dashboard.query;

import az.birbank.dashboard.auth.UserPrincipal;
import az.birbank.dashboard.params.FieldValuesService;
import az.birbank.dashboard.params.ParameterDef;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/query")
public class QueryController {

    private final QueryService queryService;
    private final FieldValuesService fieldValues;

    public QueryController(QueryService queryService, FieldValuesService fieldValues) {
        this.queryService = queryService;
        this.fieldValues = fieldValues;
    }

    /** sql holds SQL, or for MongoDB the aggregation pipeline; collection is only used for MongoDB. */
    public record RunSql(@NotNull Long dataSourceId, @NotBlank String sql, String collection,
                         List<ParameterDef> parameters, Map<String, String> values) {}

    public record ValuesRequest(@NotNull Long dataSourceId, @NotBlank String table, @NotBlank String column) {}

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN','ANALYST')")
    public QueryResult run(@Valid @RequestBody RunSql body, @AuthenticationPrincipal UserPrincipal user) {
        return queryService.run(body.dataSourceId(), body.sql(), body.collection(), body.parameters(),
            body.values(), null, user);
    }

    /** Dropdown values while building a question (before it is saved). */
    @PostMapping("/values")
    @PreAuthorize("hasAnyRole('ADMIN','ANALYST')")
    public List<String> values(@Valid @RequestBody ValuesRequest body, @AuthenticationPrincipal UserPrincipal user) {
        return fieldValues.values(body.dataSourceId(), body.table(), body.column(), user);
    }
}
