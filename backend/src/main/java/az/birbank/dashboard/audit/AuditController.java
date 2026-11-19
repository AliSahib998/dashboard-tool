package az.birbank.dashboard.audit;

import org.springframework.data.domain.PageRequest;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/audit")
@PreAuthorize("hasRole('ADMIN')")
public class AuditController {

    private final AuditLogRepository repo;

    public AuditController(AuditLogRepository repo) {
        this.repo = repo;
    }

    public record AuditPage(List<AuditLog> items, long total, int page, int size) {}

    @GetMapping
    public AuditPage list(@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "50") int size) {
        int safeSize = Math.min(Math.max(size, 1), 200);
        var result = repo.findAllByOrderByCreatedAtDesc(PageRequest.of(Math.max(page, 0), safeSize));
        return new AuditPage(result.getContent(), result.getTotalElements(), page, safeSize);
    }
}
