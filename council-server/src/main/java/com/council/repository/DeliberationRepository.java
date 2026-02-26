package com.council.repository;

import com.council.model.Deliberation;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface DeliberationRepository extends MongoRepository<Deliberation, String> {
    List<Deliberation> findByUserId(String userId);

    long countByWinnerId(String winnerId);
}
