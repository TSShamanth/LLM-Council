package com.council.controller;

import com.council.model.Deliberation;
import com.council.repository.DeliberationRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * POST /api/deliberations/record — Record a council deliberation result.
 * Tracks which provider won each session for admin statistics.
 */
@RestController
@RequestMapping("/api/deliberations")
public class DeliberationController {

    private final DeliberationRepository deliberationRepository;

    public DeliberationController(DeliberationRepository deliberationRepository) {
        this.deliberationRepository = deliberationRepository;
    }

    @PostMapping("/record")
    @SuppressWarnings("unchecked")
    public ResponseEntity<?> record(@RequestBody Map<String, Object> body,
            Authentication auth) {
        Map<String, String> user = (Map<String, String>) auth.getPrincipal();
        String userId = user.get("id");

        String purpose = (String) body.getOrDefault("purpose", "content");
        String winnerId = (String) body.get("winnerId");
        List<String> providers = (List<String>) body.get("providers");

        Deliberation d = new Deliberation();
        d.setUserId(userId);
        d.setPromptPurpose(purpose);
        d.setWinnerId(winnerId);
        d.setAllProviders(providers);
        d.setCreatedAt(Instant.now());

        deliberationRepository.save(d);

        return ResponseEntity.status(201).body(Map.of("message", "Deliberation recorded"));
    }
}
