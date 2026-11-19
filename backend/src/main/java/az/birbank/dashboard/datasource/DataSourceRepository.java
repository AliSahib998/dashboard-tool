package az.birbank.dashboard.datasource;

import org.springframework.data.jpa.repository.JpaRepository;

public interface DataSourceRepository extends JpaRepository<DataSourceEntity, Long> {
    boolean existsByEngine(Engine engine);

    java.util.Optional<DataSourceEntity> findByName(String name);
}
