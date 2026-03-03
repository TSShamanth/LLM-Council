package com.council.controller;

import com.council.service.GenerateService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Health check endpoint — public, no auth required.
 * Returns DB connectivity, uptime, memory, and provider status.
 */
@RestController
@RequestMapping("/api")
public class HealthController {

    private static final Instant START_TIME = Instant.now();

    private final MongoTemplate mongoTemplate;
    private final GenerateService generateService;

    @Value("${server.port}")
    private int serverPort;

    public HealthController(MongoTemplate mongoTemplate,
            GenerateService generateService) {
        this.mongoTemplate = mongoTemplate;
        this.generateService = generateService;
    }

    @GetMapping("/health")
    public ResponseEntity<?> health() {
        // Check DB connectivity
        boolean dbOk = false;
        try {
            mongoTemplate.getDb().runCommand(new org.bson.Document("ping", 1));
            dbOk = true;
        } catch (Exception ignored) {
        }

        // Uptime
        long uptimeSeconds = java.time.Duration.between(START_TIME, Instant.now()).getSeconds();
        String uptimeHuman = String.format("%dh %dm %ds",
                uptimeSeconds / 3600,
                (uptimeSeconds % 3600) / 60,
                uptimeSeconds % 60);

        // Memory
        Runtime runtime = Runtime.getRuntime();
        long heapUsedMB = (runtime.totalMemory() - runtime.freeMemory()) / (1024 * 1024);
        long heapTotalMB = runtime.totalMemory() / (1024 * 1024);
        long maxMB = runtime.maxMemory() / (1024 * 1024);

        // Providers
        var enabledProviders = generateService.getEnabledProviders();
        Map<String, Boolean> providers = new LinkedHashMap<>();
        for (String p : new String[] { "gemini", "groq", "openrouter" }) {
            providers.put(p, enabledProviders.contains(p));
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("status", dbOk ? "ok" : "degraded");
        result.put("timestamp", Instant.now().toString());
        result.put("uptime", Map.of("seconds", uptimeSeconds, "human", uptimeHuman));
        result.put("database", dbOk ? "connected" : "unreachable");
        result.put("memory", Map.of(
                "heapUsedMB", heapUsedMB,
                "heapTotalMB", heapTotalMB,
                "maxMB", maxMB));
        result.put("providers", providers);
        result.put("enabledCount", enabledProviders.size());
        result.put("javaVersion", System.getProperty("java.version"));
        result.put("port", serverPort);

        return ResponseEntity.ok(result);
    }
}
