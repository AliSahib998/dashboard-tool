package az.birbank.dashboard.audit;

import jakarta.persistence.*;

import java.time.Instant;

@Entity
@Table(name = "audit_log")
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id")
    private Long userId;

    @Column(name = "user_email")
    private String userEmail;

    @Column(nullable = false)
    private String action;

    @Column(name = "data_source_id")
    private Long dataSourceId;

    @Column(name = "question_id")
    private Long questionId;

    @Column(name = "sql_text")
    private String sqlText;

    @Column(name = "row_count")
    private Integer rowCount;

    @Column(name = "duration_ms")
    private Long durationMs;

    @Column(nullable = false)
    private boolean success;

    @Column(name = "error_message")
    private String errorMessage;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected AuditLog() {}

    public AuditLog(Long userId, String userEmail, String action, Long dataSourceId, Long questionId, String sqlText,
                    Integer rowCount, Long durationMs, boolean success, String errorMessage) {
        this.userId = userId;
        this.userEmail = userEmail;
        this.action = action;
        this.dataSourceId = dataSourceId;
        this.questionId = questionId;
        this.sqlText = sqlText;
        this.rowCount = rowCount;
        this.durationMs = durationMs;
        this.success = success;
        this.errorMessage = errorMessage;
        this.createdAt = Instant.now();
    }

    public Long getId() { return id; }
    public Long getUserId() { return userId; }
    public String getUserEmail() { return userEmail; }
    public String getAction() { return action; }
    public Long getDataSourceId() { return dataSourceId; }
    public Long getQuestionId() { return questionId; }
    public String getSqlText() { return sqlText; }
    public Integer getRowCount() { return rowCount; }
    public Long getDurationMs() { return durationMs; }
    public boolean isSuccess() { return success; }
    public String getErrorMessage() { return errorMessage; }
    public Instant getCreatedAt() { return createdAt; }
}
