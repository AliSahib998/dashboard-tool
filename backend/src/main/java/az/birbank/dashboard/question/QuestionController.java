package az.birbank.dashboard.question;

import az.birbank.dashboard.auth.UserPrincipal;
import az.birbank.dashboard.common.NotFoundException;
import az.birbank.dashboard.datasource.DataSourceRepository;
import az.birbank.dashboard.mongo.MongoPipelineGuard;
import az.birbank.dashboard.params.FieldValuesService;
import az.birbank.dashboard.params.JsonColumns;
import az.birbank.dashboard.params.ParameterDef;
import az.birbank.dashboard.query.QueryResult;
import az.birbank.dashboard.query.QueryService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/questions")
public class QuestionController {

    private final QuestionRepository repo;
    private final DataSourceRepository dataSources;
    private final QueryService queryService;
    private final JsonColumns json;
    private final FieldValuesService fieldValues;

    public QuestionController(QuestionRepository repo, DataSourceRepository dataSources, QueryService queryService,
                              JsonColumns json, FieldValuesService fieldValues) {
        this.repo = repo;
        this.dataSources = dataSources;
        this.queryService = queryService;
        this.json = json;
        this.fieldValues = fieldValues;
    }

    public record QuestionDto(Long id, String name, String description, Long dataSourceId, String sql,
                              String collection, List<ParameterDef> parameters, VizType vizType, String vizSettings,
                              Instant updatedAt) {
        public static QuestionDto of(Question q, JsonColumns json) {
            return new QuestionDto(q.getId(), q.getName(), q.getDescription(), q.getDataSourceId(), q.getSql(),
                q.getCollectionName(), json.params(q.getParameters()), q.getVizType(), q.getVizSettings(),
                q.getUpdatedAt());
        }
    }

    /** Filter values for a run; keys are variable names. */
    public record RunRequest(Map<String, String> values) {}

    public record SaveQuestion(@NotBlank String name, String description, @NotNull Long dataSourceId,
                               @NotBlank String sql, String collection, List<ParameterDef> parameters,
                               @NotNull VizType vizType, String vizSettings) {}

    @GetMapping
    public List<QuestionDto> list() {
        return repo.findAllByOrderByUpdatedAtDesc().stream().map(q -> QuestionDto.of(q, json)).toList();
    }

    @GetMapping("/{id}")
    public QuestionDto get(@PathVariable Long id) {
        return QuestionDto.of(find(id), json);
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN','ANALYST')")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public QuestionDto create(@Valid @RequestBody SaveQuestion body, @AuthenticationPrincipal UserPrincipal user) {
        Question q = new Question();
        apply(q, body);
        q.setCreatedBy(user.id());
        return QuestionDto.of(repo.save(q), json);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','ANALYST')")
    @Transactional
    public QuestionDto update(@PathVariable Long id, @Valid @RequestBody SaveQuestion body) {
        Question q = find(id);
        apply(q, body);
        return QuestionDto.of(repo.saveAndFlush(q), json);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','ANALYST')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void delete(@PathVariable Long id) {
        repo.delete(find(id));
    }

    /** Runs the saved SQL. Viewers can do this; they cannot run their own SQL. */
    @PostMapping("/{id}/run")
    public QueryResult run(@PathVariable Long id, @RequestBody(required = false) RunRequest body,
                           @AuthenticationPrincipal UserPrincipal user) {
        Question q = find(id);
        return queryService.run(q.getDataSourceId(), q.getSql(), q.getCollectionName(), json.params(q.getParameters()),
            body == null ? Map.of() : body.values(), q.getId(), user);
    }

    /** Dropdown values for one of the question's filters. */
    @GetMapping("/{id}/parameters/{name}/values")
    public List<String> parameterValues(@PathVariable Long id, @PathVariable String name,
                                        @AuthenticationPrincipal UserPrincipal user) {
        ParameterDef def = json.params(find(id).getParameters()).stream()
            .filter(p -> p.name().equals(name)).findFirst()
            .orElseThrow(() -> new NotFoundException("Filter", name));
        return fieldValues.valuesFor(def, user);
    }

    private Question find(Long id) {
        return repo.findById(id).orElseThrow(() -> new NotFoundException("Question", id));
    }

    private void apply(Question q, SaveQuestion body) {
        var ds = dataSources.findById(body.dataSourceId())
            .orElseThrow(() -> new NotFoundException("Data source", body.dataSourceId()));
        if (!ds.getEngine().isJdbc()) {
            MongoPipelineGuard.validateCollection(body.collection());
            MongoPipelineGuard.parse(body.sql());
        }
        q.setCollectionName(ds.getEngine().isJdbc() ? null : body.collection());
        q.setName(body.name().trim());
        q.setDescription(body.description());
        q.setDataSourceId(body.dataSourceId());
        q.setSql(body.sql());
        q.setParameters(json.write(body.parameters() == null ? List.of() : body.parameters()));
        q.setVizType(body.vizType());
        q.setVizSettings(body.vizSettings());
    }
}
