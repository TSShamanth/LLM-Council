package com.council.controller;

import com.council.model.Deliberation;
import com.council.model.SystemLog;
import com.council.model.User;
import com.council.repository.DeliberationRepository;
import com.council.repository.SessionRepository;
import com.council.repository.SystemLogRepository;
import com.council.repository.UserRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
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

    public AdminController(UserRepository userRepository,
            SessionRepository sessionRepository,
            DeliberationRepository deliberationRepository,
            SystemLogRepository systemLogRepository) {
        this.userRepository = userRepository;
        this.sessionRepository = sessionRepository;
        this.deliberationRepository = deliberationRepository;
        this.systemLogRepository = systemLogRepository;
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
     * Provider metrics — calculates latency, tokens, and failures from system logs.
     */
    private List<Map<String, Object>> computeProviderMetrics() {
        // Fetch all logs once to avoid multiple DB hits
        List<SystemLog> allLogs = systemLogRepository.findAll();
        
        // Get unique provider list from deliberations or logs
        Set<String> providers = new LinkedHashSet<>();
        deliberationRepository.findAll().forEach(d -> {
            if (d.getAllProviders() != null) providers.addAll(d.getAllProviders());
        });
        allLogs.forEach(l -> {
            if (l.getMeta() != null && l.getMeta().containsKey("provider")) {
                providers.add(l.getMeta().get("provider").toString());
            }
        });

        List<Deliberation> deliberations = deliberationRepository.findAll();
        Map<String, Long> winCounts = deliberations.stream()
                .filter(d -> d.getWinnerId() != null)
                .collect(Collectors.groupingBy(Deliberation::getWinnerId, Collectors.counting()));

        return providers.stream().map(pid -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("provider_id", pid);

            // Filter logs for this provider
            List<SystemLog> providerLogs = allLogs.stream()
                .filter(l -> l.getMeta() != null && pid.equals(l.getMeta().get("provider")))
                .toList();

            long failures = providerLogs.stream().filter(l -> "error".equalsIgnoreCase(l.getLevel())).count();
            
            // Calculate averages from 'info' logs
            List<SystemLog> successLogs = providerLogs.stream()
                .filter(l -> "info".equalsIgnoreCase(l.getLevel()))
                .toList();
            
            double avgLatency = successLogs.stream()
                .filter(l -> l.getMeta().containsKey("latency"))
                .mapToLong(l -> ((Number) l.getMeta().get("latency")).longValue())
                .average().orElse(0.0);
                
            double avgTokens = successLogs.stream()
                .filter(l -> l.getMeta().containsKey("tokens"))
                .mapToLong(l -> ((Number) l.getMeta().get("tokens")).longValue())
                .average().orElse(0.0);

            m.put("avgLatency", avgLatency); 
            m.put("avgTokens", avgTokens);
            m.put("failureCount", failures);
            m.put("totalCalls", providerLogs.size());
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
