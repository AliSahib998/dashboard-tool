package az.birbank.dashboard.question;

/** Chart types. Rendering and per-type settings live in the frontend (Visualization.tsx). */
public enum VizType {
    TABLE, NUMBER, TREND, PROGRESS, GAUGE,
    BAR, ROW, LINE, AREA, COMBO, PIE, SCATTER, FUNNEL, WATERFALL
}
