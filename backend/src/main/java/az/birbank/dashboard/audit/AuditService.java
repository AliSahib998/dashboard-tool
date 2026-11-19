package az.birbank.dashboard.audit;

import az.birbank.dashboard.auth.UserPrincipal;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuditService {

    private static final Logger log = LoggerFactory.getLogger(AuditService.class);

    private final AuditLogRepository repo;

    public AuditService(AuditLogRepository repo) {
        this.repo = repo;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(UserPrincipal user, String action, Long dataSourceId, Long questionId, String sql,
                       Integer rowCount, Long durationMs, boolean success, String error) {
        try {
            repo.save(new AuditLog(user == null ? null : user.id(), user == null ? null : user.email(), action,
                dataSourceId, questionId, sql, rowCount, durationMs, success, error));
        } catch (RuntimeException e) {
            log.error("Failed to write audit log entry for action {}", action, e);
            throw e;
        }
    }
}
