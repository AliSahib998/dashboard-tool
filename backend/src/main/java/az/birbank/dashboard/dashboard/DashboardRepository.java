package az.birbank.dashboard.dashboard;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DashboardRepository extends JpaRepository<Dashboard, Long> {
    List<Dashboard> findAllByOrderByUpdatedAtDesc();

    boolean existsByName(String name);
}
