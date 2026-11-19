package az.birbank.dashboard.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public record AppProperties(String secretKey, Admin admin, SampleDb sampleDb, SampleDb sampleMongo, Query query) {

    public record Admin(String email, String password) {}

    public record SampleDb(String url, String username, String password) {}

    public record Query(int maxRows, int timeoutSeconds) {}
}
