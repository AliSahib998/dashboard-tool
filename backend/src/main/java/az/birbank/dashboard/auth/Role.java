package az.birbank.dashboard.auth;

/**
 * ADMIN   - manage users and data sources, view the audit log, everything an analyst can do.
 * ANALYST - write SQL, create and edit questions and dashboards.
 * VIEWER  - open dashboards and run saved questions only.
 */
public enum Role {
    ADMIN, ANALYST, VIEWER
}
