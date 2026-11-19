package az.birbank.dashboard.dashboard;

import az.birbank.dashboard.auth.UserPrincipal;
import az.birbank.dashboard.common.NotFoundException;
import az.birbank.dashboard.params.FieldValuesService;
import az.birbank.dashboard.params.JsonColumns;
import az.birbank.dashboard.params.ParameterDef;
import az.birbank.dashboard.question.Question;
import az.birbank.dashboard.question.QuestionController.QuestionDto;
import az.birbank.dashboard.question.QuestionRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
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
import java.util.function.Function;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/dashboards")
public class DashboardController {

    private final DashboardRepository repo;
    private final QuestionRepository questions;
    private final JsonColumns json;
    private final FieldValuesService fieldValues;

    public DashboardController(DashboardRepository repo, QuestionRepository questions, JsonColumns json,
                               FieldValuesService fieldValues) {
        this.repo = repo;
        this.questions = questions;
        this.json = json;
        this.fieldValues = fieldValues;
    }

    public record DashboardSummary(Long id, String name, String description, int cardCount, Instant updatedAt) {}

    /** mappings: dashboard filter name -> variable name in this card's question */
    public record CardDto(Long id, QuestionDto question, int x, int y, int w, int h, Map<String, String> mappings) {}

    public record DashboardDto(Long id, String name, String description, List<ParameterDef> filters,
                               List<CardDto> cards, Instant updatedAt) {}

    public record SaveCard(@NotNull Long questionId, @Min(0) int x, @Min(0) int y, @Min(1) int w, @Min(1) int h,
                           Map<String, String> mappings) {}

    public record SaveDashboard(@NotBlank String name, String description, List<ParameterDef> filters,
                                List<@Valid SaveCard> cards) {}

    @GetMapping
    @Transactional(readOnly = true)
    public List<DashboardSummary> list() {
        return repo.findAllByOrderByUpdatedAtDesc().stream()
            .map(d -> new DashboardSummary(d.getId(), d.getName(), d.getDescription(), d.getCards().size(), d.getUpdatedAt()))
            .toList();
    }

    @GetMapping("/{id}")
    @Transactional(readOnly = true)
    public DashboardDto get(@PathVariable Long id) {
        return toDto(find(id));
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN','ANALYST')")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public DashboardDto create(@Valid @RequestBody SaveDashboard body, @AuthenticationPrincipal UserPrincipal user) {
        Dashboard d = new Dashboard();
        d.setCreatedBy(user.id());
        apply(d, body);
        return toDto(repo.save(d));
    }

    /** Replaces name, description and the full card layout. */
    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','ANALYST')")
    @Transactional
    public DashboardDto update(@PathVariable Long id, @Valid @RequestBody SaveDashboard body) {
        Dashboard d = find(id);
        apply(d, body);
        d.touch();
        return toDto(repo.saveAndFlush(d));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','ANALYST')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void delete(@PathVariable Long id) {
        repo.delete(find(id));
    }

    /** Dropdown values for one of the dashboard's filters. */
    @GetMapping("/{id}/filters/{name}/values")
    @Transactional(readOnly = true)
    public List<String> filterValues(@PathVariable Long id, @PathVariable String name,
                                     @AuthenticationPrincipal UserPrincipal user) {
        ParameterDef def = json.params(find(id).getFilters()).stream()
            .filter(p -> p.name().equals(name)).findFirst()
            .orElseThrow(() -> new NotFoundException("Filter", name));
        return fieldValues.valuesFor(def, user);
    }

    private Dashboard find(Long id) {
        return repo.findById(id).orElseThrow(() -> new NotFoundException("Dashboard", id));
    }

    private void apply(Dashboard d, SaveDashboard body) {
        d.setName(body.name().trim());
        d.setDescription(body.description());
        d.setFilters(json.write(body.filters() == null ? List.of() : body.filters()));
        d.getCards().clear();
        if (body.cards() != null) {
            for (SaveCard c : body.cards()) {
                if (!questions.existsById(c.questionId())) {
                    throw new NotFoundException("Question", c.questionId());
                }
                DashboardCard card = new DashboardCard(d, c.questionId(), c.x(), c.y(), c.w(), c.h());
                card.setParameterMappings(json.write(c.mappings() == null ? Map.of() : c.mappings()));
                d.getCards().add(card);
            }
        }
    }

    private DashboardDto toDto(Dashboard d) {
        List<Long> ids = d.getCards().stream().map(DashboardCard::getQuestionId).distinct().toList();
        Map<Long, Question> byId = questions.findAllById(ids).stream()
            .collect(Collectors.toMap(Question::getId, Function.identity()));
        List<CardDto> cards = d.getCards().stream()
            .filter(c -> byId.containsKey(c.getQuestionId()))
            .map(c -> new CardDto(c.getId(), QuestionDto.of(byId.get(c.getQuestionId()), json),
                c.getPosX(), c.getPosY(), c.getWidth(), c.getHeight(), json.map(c.getParameterMappings())))
            .toList();
        return new DashboardDto(d.getId(), d.getName(), d.getDescription(), json.params(d.getFilters()), cards,
            d.getUpdatedAt());
    }
}
