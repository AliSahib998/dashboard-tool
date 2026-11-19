package az.birbank.dashboard.datasource;

import java.util.Set;

public enum Engine {
    POSTGRES("org.postgresql.Driver", Set.of("pg_catalog", "information_schema", "pg_toast")),
    MYSQL("com.mysql.cj.jdbc.Driver", Set.of("mysql", "information_schema", "performance_schema", "sys")),
    SQLSERVER("com.microsoft.sqlserver.jdbc.SQLServerDriver", Set.of("sys", "INFORMATION_SCHEMA", "guest", "db_owner",
        "db_accessadmin", "db_securityadmin", "db_ddladmin", "db_backupoperator", "db_datareader", "db_datawriter",
        "db_denydatareader", "db_denydatawriter")),
    ORACLE("oracle.jdbc.OracleDriver", Set.of("SYS", "SYSTEM", "OUTLN", "DBSNMP", "APPQOSSYS", "AUDSYS", "CTXSYS",
        "DVSYS", "GSMADMIN_INTERNAL", "LBACSYS", "MDSYS", "OJVMSYS", "OLAPSYS", "ORDDATA", "ORDSYS", "WMSYS", "XDB",
        "GSMCATUSER", "DBSFWUSER", "REMOTE_SCHEDULER_AGENT", "SYSBACKUP", "SYSDG", "SYSKM", "SYSRAC", "SYS$UMF",
        "ANONYMOUS", "DIP", "GGSYS", "XS$NULL", "ORACLE_OCM", "MDDATA", "SI_INFORMTN_SCHEMA", "ORDPLUGINS")),
    /** Not JDBC: queried with aggregation pipelines through the MongoDB Java driver. */
    MONGODB(null, Set.of());

    private final String driverClass;
    private final Set<String> systemSchemas;

    Engine(String driverClass, Set<String> systemSchemas) {
        this.driverClass = driverClass;
        this.systemSchemas = systemSchemas;
    }

    public String driverClass() { return driverClass; }

    public boolean isJdbc() { return this != MONGODB; }

    public boolean isSystemSchema(String schema) {
        return schema != null && systemSchemas.contains(schema);
    }
}
