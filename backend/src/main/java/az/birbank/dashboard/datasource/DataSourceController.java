package az.birbank.dashboard.datasource;

import az.birbank.dashboard.common.BadRequestException;
import az.birbank.dashboard.common.NotFoundException;
import az.birbank.dashboard.mongo.MongoClientRegistry;
import az.birbank.dashboard.mongo.MongoQueryExecutor;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.sql.Connection;
import java.sql.DriverManager;
import java.time.Instant;
import java.util.List;

@RestController
@RequestMapping("/api/datasources")
public class DataSourceController {

    private final DataSourceRepository repo;
    private final CryptoService crypto;
    private final ConnectionPoolRegistry pools;
    private final MetadataService metadata;
    private final MongoClientRegistry mongoClients;
    private final MongoQueryExecutor mongo;

    public DataSourceController(DataSourceRepository repo, CryptoService crypto, ConnectionPoolRegistry pools,
                                MetadataService metadata, MongoClientRegistry mongoClients, MongoQueryExecutor mongo) {
        this.repo = repo;
        this.crypto = crypto;
        this.pools = pools;
        this.metadata = metadata;
        this.mongoClients = mongoClients;
        this.mongo = mongo;
    }

    /** The password is never sent back to the browser. */
    public record DataSourceDto(Long id, String name, Engine engine, String jdbcUrl, String username,
                                String schemaFilter, Instant createdAt) {
        static DataSourceDto of(DataSourceEntity d) {
            return new DataSourceDto(d.getId(), d.getName(), d.getEngine(), d.getJdbcUrl(), d.getUsername(),
                d.getSchemaFilter(), d.getCreatedAt());
        }
    }

    /** On update, a blank password keeps the stored one. */
    public record SaveDataSource(@NotBlank String name, @NotNull Engine engine, @NotBlank String jdbcUrl,
                                 String username, String password, String schemaFilter) {}

    public record TestResult(boolean ok, String message) {}

    @GetMapping
    public List<DataSourceDto> list() {
        return repo.findAll().stream().map(DataSourceDto::of).toList();
    }

    @GetMapping("/{id}/schema")
    @PreAuthorize("hasAnyRole('ADMIN','ANALYST')")
    public List<MetadataService.Table> schema(@PathVariable Long id) {
        DataSourceEntity ds = find(id);
        return ds.getEngine().isJdbc() ? metadata.schema(ds) : mongo.schema(ds);
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public DataSourceDto create(@Valid @RequestBody SaveDataSource body) {
        validateUrl(body);
        DataSourceEntity d = new DataSourceEntity();
        apply(d, body);
        d.setPasswordEncrypted(crypto.encrypt(body.password() == null ? "" : body.password()));
        return DataSourceDto.of(repo.save(d));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    public DataSourceDto update(@PathVariable Long id, @Valid @RequestBody SaveDataSource body) {
        validateUrl(body);
        DataSourceEntity d = find(id);
        apply(d, body);
        if (body.password() != null && !body.password().isEmpty()) {
            d.setPasswordEncrypted(crypto.encrypt(body.password()));
        }
        pools.evict(id);
        mongoClients.evict(id);
        return DataSourceDto.of(d);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void delete(@PathVariable Long id) {
        repo.delete(find(id));
        repo.flush();
        pools.evict(id);
        mongoClients.evict(id);
    }

    /** Tests connection settings before saving. Pass id to reuse the stored password. */
    @PostMapping("/test")
    @PreAuthorize("hasRole('ADMIN')")
    public TestResult test(@Valid @RequestBody SaveDataSource body, @RequestParam(required = false) Long id) {
        validateUrl(body);
        String password = body.password();
        if ((password == null || password.isEmpty()) && id != null) {
            password = crypto.decrypt(find(id).getPasswordEncrypted());
        }
        if (!body.engine().isJdbc()) {
            try {
                return new TestResult(true, mongo.test(body.jdbcUrl().trim(), body.username(), password));
            } catch (Exception e) {
                return new TestResult(false, e.getMessage());
            }
        }
        try {
            Class.forName(body.engine().driverClass());
            DriverManager.setLoginTimeout(10);
            try (Connection c = DriverManager.getConnection(body.jdbcUrl(), body.username(), password)) {
                var md = c.getMetaData();
                return new TestResult(true, "Connected to " + md.getDatabaseProductName() + " " + md.getDatabaseProductVersion());
            }
        } catch (Exception e) {
            return new TestResult(false, e.getMessage());
        }
    }

    private DataSourceEntity find(Long id) {
        return repo.findById(id).orElseThrow(() -> new NotFoundException("Data source", id));
    }

    private static void apply(DataSourceEntity d, SaveDataSource body) {
        d.setName(body.name().trim());
        d.setEngine(body.engine());
        d.setJdbcUrl(body.jdbcUrl().trim());
        d.setUsername(body.username());
        d.setSchemaFilter(body.schemaFilter());
    }

    private static void validateUrl(SaveDataSource body) {
        String prefix = switch (body.engine()) {
            case POSTGRES -> "jdbc:postgresql:";
            case MYSQL -> "jdbc:mysql:";
            case SQLSERVER -> "jdbc:sqlserver:";
            case ORACLE -> "jdbc:oracle:";
            case MONGODB -> "mongodb";
        };
        String url = body.jdbcUrl().trim();
        if (body.engine() == Engine.MONGODB) {
            if (!url.startsWith("mongodb://") && !url.startsWith("mongodb+srv://")) {
                throw new BadRequestException("MongoDB connection string must start with mongodb:// or mongodb+srv://");
            }
            MongoClientRegistry.validateUrl(url);
        } else if (!url.startsWith(prefix)) {
            throw new BadRequestException("JDBC URL for " + body.engine() + " must start with " + prefix);
        }
    }
}
