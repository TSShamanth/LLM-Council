package com.council.controller;

import com.council.model.Deliberation;
import com.council.model.Session;
import com.council.model.SystemLog;
import com.council.model.User;
import com.council.repository.DeliberationRepository;
import com.council.repository.SessionRepository;
import com.council.repository.SystemLogRepository;
import com.council.repository.UserRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.aggregation.*;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Admin-only stats endpoint.
 * Requires ROLE_ADMIN (enforced by SecurityConfig).
 * Returns data matching the frontend AdminDashboard component contract.
 */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final UserRepository userRepository;
    private final SessionRepository sessionRepository;
    private final DeliberationRepository deliberationRepository;
    private final SystemLogRepository systemLogRepository;
    private final MongoTemplate mongoTemplate;

    public AdminController(UserRepository userRepository,
            SessionRepository sessionRepository,
            DeliberationRepository deliberationRepository,
            SystemLogRepository systemLogRepository,
            MongoTemplate mongoTemplate) {
        this.userRepository = userRepository;
        this.sessionRepository = sessionRepository;
        this.deliberationRepository = deliberationRepository;
        this.systemLogRepository = systemLogRepository;
        this.mongoTemplate = mongoTemplate;
    }

    @GetMapping("/stats")
    public ResponseEntity<?> stats() {
        Map<String, Object> result = new LinkedHashMap<>();

        // ── Acceptance Rates (wins per provider) ──
        result.put("acceptanceRates", computeAcceptanceRates());

        // ── Performance by Purpose (wins per provider per purpose) ──
        result.put("performanceByPurpose", computePerformanceByPurpose());

        // ── Provider Metrics (latency, tokens, failures — placeholder) ──
        result.put("providerMetrics", computeProviderMetrics());

        // ── Top Active Users ──
        result.put("topUsers", computeTopUsers());

        // ── Recent Failures ──
        result.put("recentFailures", computeRecentFailures());

        // ── Basic Counts ──
        result.put("totalUsers", userRepository.count());
        result.put("totalSessions", sessionRepository.count());
        result.put("totalDeliberations", deliberationRepository.count());

        return ResponseEntity.ok(result);
    }

    /**
     * Acceptance rates: group deliberations by winnerId, count wins, compute rate.
     */
    private List<Map<String, Object>> computeAcceptanceRates() {
        List<Deliberation> all = deliberationRepository.findAll();
        if (all.isEmpty())
            return List.of();

        long total = all.size();
        Map<String, Long> winCounts = all.stream()
                .filter(d -> d.getWinnerId() != null)
                .collect(Collectors.groupingBy(Deliberation::getWinnerId, Collectors.counting()));

        return winCounts.entrySet().stream()
                .map(e -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("winner_id", e.getKey());
                    m.put("wins", e.getValue());
                    m.put("rate", (e.getValue() * 100.0) / total);
                    return m;
                })
                .sorted((a, b) -> Long.compare((Long) b.get("wins"), (Long) a.get("wins")))
                .collect(Collectors.toList());
    }

    /**
     * Performance by purpose: group deliberations by (purpose, winnerId), count.
     */
    private List<Map<String, Object>> computePerformanceByPurpose() {
        List<Deliberation> all = deliberationRepository.findAll();
        if (all.isEmpty())
            return List.of();

        Map<String, Map<String, Long>> grouped = all.stream()
                .filter(d -> d.getPromptPurpose() != null && d.getWinnerId() != null)
                .collect(Collectors.groupingBy(
                        Deliberation::getPromptPurpose,
                        Collectors.groupingBy(Deliberation::getWinnerId, Collectors.counting())));

        List<Map<String, Object>> result = new ArrayList<>();
        grouped.forEach((purpose, winners) -> winners.forEach((winner, count) -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("prompt_purpose", purpose);
            m.put("winner_id", winner);
            m.put("count", count);
            result.add(m);
        }));
        return result;
    }

    /**
     * Provider metrics — basic stats per provider from deliberations.
     * Full latency/token tracking would require a metrics collection.
     */
    private List<Map<String, Object>> computeProviderMetrics() {
        List<Deliberation> all = deliberationRepository.findAll();
        Set<String> providers = new LinkedHashSet<>();
        all.forEach(d -> {
            if (d.getAllProviders() != null)
                providers.addAll(d.getAllProviders());
        });

        long total = Math.max(1, all.size());
        Map<String, Long> winCounts = all.stream()
                .filter(d -> d.getWinnerId() != null)
                .collect(Collectors.groupingBy(Deliberation::getWinnerId, Collectors.counting()));

        return providers.stream().map(pid -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("provider_id", pid);
            m.put("avgLatency", 0); // Requires runtime metrics tracking
            m.put("avgTokens", 0); // Requires runtime metrics tracking
            m.put("failureCount", 0); // Could track from SystemLog
            m.put("totalCalls", total);
            m.put("wins", winCounts.getOrDefault(pid, 0L));
            return m;
        }).collect(Collectors.toList());
    }

    /**
     * Top active users: users with the most sessions.
     */
    private List<Map<String, Object>> computeTopUsers() {
        // Get all users and count sessions per user
        List<User> users = userRepository.findAll();
        return users.stream()
                .map(u -> {
                    long sessCount = sessionRepository.countByUserId(u.getId());
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("email", u.getEmail());
                    m.put("sessions", sessCount);
                    return m;
                })
                .sorted((a, b) -> Long.compare((Long) b.get("sessions"), (Long) a.get("sessions")))
                .limit(10)
                .collect(Collectors.toList());
    }

    /**
     * Recent failures from system logs.
     */
    private List<Map<String, Object>> computeRecentFailures() {
        List<SystemLog> logs = systemLogRepository.findAll(
                PageRequest.of(0, 20, Sort.by("createdAt").descending())).getContent();

        return logs.stream()
                .filter(l -> "error".equalsIgnoreCase(l.getLevel()))
                .limit(10)
                .map(l -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("provider_id",
                            l.getMeta() != null ? l.getMeta().getOrDefault("provider", "system") : "system");
                    m.put("created_at", l.getCreatedAt() != null ? l.getCreatedAt().toString() : "");
                    m.put("error_message", l.getMessage());
                    return m;
                })
                .collect(Collectors.toList());
    }
}
