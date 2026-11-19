package az.birbank.dashboard.datasource;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Keeps one small, read-only connection pool per connected database. */
@Component
public class ConnectionPoolRegistry {

    private final Map<Long, HikariDataSource> pools = new ConcurrentHashMap<>();
    private final CryptoService crypto;

    public ConnectionPoolRegistry(CryptoService crypto) {
        this.crypto = crypto;
    }

    public DataSource get(DataSourceEntity ds) {
        return pools.computeIfAbsent(ds.getId(), id -> create(ds));
    }

    public void evict(Long id) {
        HikariDataSource pool = pools.remove(id);
        if (pool != null) pool.close();
    }

    private HikariDataSource create(DataSourceEntity ds) {
        HikariConfig cfg = new HikariConfig();
        cfg.setPoolName("ds-" + ds.getId());
        cfg.setDriverClassName(ds.getEngine().driverClass());
        cfg.setJdbcUrl(ds.getJdbcUrl());
        cfg.setUsername(ds.getUsername());
        cfg.setPassword(crypto.decrypt(ds.getPasswordEncrypted()));
        cfg.setReadOnly(true);
        cfg.setMaximumPoolSize(5);
        cfg.setMinimumIdle(0);
        cfg.setIdleTimeout(300_000);
        cfg.setConnectionTimeout(10_000);
        cfg.setInitializationFailTimeout(-1);
        return new HikariDataSource(cfg);
    }

    @PreDestroy
    void closeAll() {
        pools.values().forEach(HikariDataSource::close);
        pools.clear();
    }
}
