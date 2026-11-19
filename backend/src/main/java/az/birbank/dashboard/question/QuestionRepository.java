package az.birbank.dashboard.question;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface QuestionRepository extends JpaRepository<Question, Long> {
    List<Question> findAllByOrderByUpdatedAtDesc();
    boolean existsByDataSourceId(Long dataSourceId);
}
