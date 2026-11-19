package az.birbank.dashboard.question;

import jakarta.persistence.*;

import java.time.Instant;

@Entity
@Table(name = "question")
public class Question {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    private String description;

    @Column(name = "data_source_id", nullable = false)
    private Long dataSourceId;

    @Column(name = "sql_text", nullable = false)
    private String sql;

    /** MongoDB only: the collection the pipeline in sql runs against. */
    @Column(name = "collection_name")
    private String collectionName;

    @Enumerated(EnumType.STRING)
    @Column(name = "viz_type", nullable = false)
    private VizType vizType;

    /** JSON chosen by the frontend, e.g. {"x":"day","y":["total"]} */
    @Column(name = "viz_settings")
    private String vizSettings;

    /** JSON array of ParameterDef for the {{variables}} in the query. */
    @Column(name = "parameters")
    private String parameters;

    @Column(name = "created_by")
    private Long createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    void onCreate() {
        createdAt = updatedAt = Instant.now();
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    public Long getId() { return id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public Long getDataSourceId() { return dataSourceId; }
    public void setDataSourceId(Long dataSourceId) { this.dataSourceId = dataSourceId; }
    public String getSql() { return sql; }
    public void setSql(String sql) { this.sql = sql; }
    public String getCollectionName() { return collectionName; }
    public void setCollectionName(String collectionName) { this.collectionName = collectionName; }
    public VizType getVizType() { return vizType; }
    public void setVizType(VizType vizType) { this.vizType = vizType; }
    public String getVizSettings() { return vizSettings; }
    public void setVizSettings(String vizSettings) { this.vizSettings = vizSettings; }
    public String getParameters() { return parameters; }
    public void setParameters(String parameters) { this.parameters = parameters; }
    public Long getCreatedBy() { return createdBy; }
    public void setCreatedBy(Long createdBy) { this.createdBy = createdBy; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
