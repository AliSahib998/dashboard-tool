package az.birbank.dashboard.dashboard;

import jakarta.persistence.*;

@Entity
@Table(name = "dashboard_card")
public class DashboardCard {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "dashboard_id")
    private Dashboard dashboard;

    @Column(name = "question_id", nullable = false)
    private Long questionId;

    @Column(name = "pos_x", nullable = false)
    private int posX;

    @Column(name = "pos_y", nullable = false)
    private int posY;

    @Column(name = "width", nullable = false)
    private int width;

    @Column(name = "height", nullable = false)
    private int height;

    /** JSON object: dashboard filter name -> question variable name. */
    @Column(name = "parameter_mappings")
    private String parameterMappings;

    protected DashboardCard() {}

    public DashboardCard(Dashboard dashboard, Long questionId, int posX, int posY, int width, int height) {
        this.dashboard = dashboard;
        this.questionId = questionId;
        this.posX = posX;
        this.posY = posY;
        this.width = width;
        this.height = height;
    }

    public Long getId() { return id; }
    public Long getQuestionId() { return questionId; }
    public int getPosX() { return posX; }
    public int getPosY() { return posY; }
    public int getWidth() { return width; }
    public int getHeight() { return height; }
    public String getParameterMappings() { return parameterMappings; }
    public void setParameterMappings(String parameterMappings) { this.parameterMappings = parameterMappings; }
}
