package az.birbank.dashboard.mongo;

import az.birbank.dashboard.common.BadRequestException;
import az.birbank.dashboard.datasource.CryptoService;
import az.birbank.dashboard.datasource.DataSourceEntity;
import com.mongodb.ConnectionString;
import com.mongodb.MongoClientSettings;
import com.mongodb.MongoCredential;
import com.mongodb.ReadPreference;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import com.mongodb.client.MongoDatabase;
import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** One MongoClient (which pools connections itself) per MongoDB data source. */
@Component
public class MongoClientRegistry {

    private static final Pattern AUTH_SOURCE = Pattern.compile("[?&]authSource=([^&]+)");

    private final Map<Long, MongoClient> clients = new ConcurrentHashMap<>();
    private final CryptoService crypto;

    public MongoClientRegistry(CryptoService crypto) {
        this.crypto = crypto;
    }

    public MongoDatabase database(DataSourceEntity ds) {
        MongoClient client = clients.computeIfAbsent(ds.getId(),
            id -> create(ds.getJdbcUrl(), ds.getUsername(), crypto.decrypt(ds.getPasswordEncrypted())));
        return client.getDatabase(databaseName(ds.getJdbcUrl()));
    }

    public void evict(Long id) {
        MongoClient client = clients.remove(id);
        if (client != null) client.close();
    }

    /** Creates a short-lived client; the caller must close it. Used for "Test connection". */
    public MongoClient createUnpooled(String url, String username, String password) {
        return create(url, username, password);
    }

    /** The URL must name a database and must not contain a user or password (those go in the separate fields). */
    public static void validateUrl(String url) {
        ConnectionString cs;
        try {
            cs = new ConnectionString(url);
        } catch (RuntimeException e) {
            throw new BadRequestException("Invalid MongoDB connection string: " + e.getMessage());
        }
        if (cs.getCredential() != null) {
            throw new BadRequestException("Put the username and password in their own fields, not in the connection string");
        }
        if (cs.getDatabase() == null || cs.getDatabase().isBlank()) {
            throw new BadRequestException("The connection string must include the database, e.g. mongodb://host:27017/mydb");
        }
    }

    public static String databaseName(String url) {
        return new ConnectionString(url).getDatabase();
    }

    private static MongoClient create(String url, String username, String password) {
        ConnectionString cs = new ConnectionString(url);
        MongoClientSettings.Builder settings = MongoClientSettings.builder()
            .applyConnectionString(cs)
            .applicationName("birbank-dashboard")
            // Keep analytics load off the primary when a replica set is available.
            .readPreference(ReadPreference.secondaryPreferred())
            .applyToClusterSettings(c -> c.serverSelectionTimeout(10, TimeUnit.SECONDS))
            .applyToConnectionPoolSettings(p -> p.maxSize(5).maxConnectionIdleTime(5, TimeUnit.MINUTES))
            .applyToSocketSettings(s -> s.connectTimeout(10, TimeUnit.SECONDS));
        if (username != null && !username.isBlank()) {
            Matcher m = AUTH_SOURCE.matcher(url);
            String source = m.find() ? m.group(1) : "admin";
            settings.credential(MongoCredential.createCredential(username, source,
                password == null ? new char[0] : password.toCharArray()));
        }
        return MongoClients.create(settings.build());
    }

    @PreDestroy
    void closeAll() {
        clients.values().forEach(MongoClient::close);
        clients.clear();
    }
}
