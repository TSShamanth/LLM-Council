package com.council.service;

import com.council.model.SystemLog;
import com.council.provider.LLMProvider;
import com.council.provider.LLMProvider.ProviderResult;
import com.council.repository.SystemLogRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * Orchestrates parallel LLM provider calls using CompletableFuture.
 * Port of the Node.js /api/generate endpoint logic.
 */
@Service
public class GenerateService {

    private static final Logger log = LoggerFactory.getLogger(GenerateService.class);
    private static final long TIMEOUT_SECONDS = 60;

    private final Map<String, LLMProvider> providerMap;
    private final SanitizeService sanitizeService;
    private final SystemLogRepository logRepository;

    public GenerateService(List<LLMProvider> providers,
            SanitizeService sanitizeService,
            SystemLogRepository logRepository) {
        this.providerMap = providers.stream()
                .collect(Collectors.toMap(LLMProvider::getProviderId, p -> p));
        this.sanitizeService = sanitizeService;
        this.logRepository = logRepository;
    }

    /**
     * Get all enabled provider IDs.
     */
    public List<String> getEnabledProviders() {
        return providerMap.values().stream()
                .filter(LLMProvider::isEnabled)
                .map(LLMProvider::getProviderId)
                .toList();
    }

    /**
     * Get all registered provider IDs (enabled or not).
     */
    public List<String> getAllProviderIds() {
        return providerMap.keySet().stream().sorted().toList();
    }

    /**
     * Check if a specific provider is enabled.
     */
    public boolean isProviderEnabled(String providerId) {
        LLMProvider provider = providerMap.get(providerId);
        return provider != null && provider.isEnabled();
    }

    /**
     * Fire all requested providers in parallel and collect results.
     *
     * @param providerIds List of provider IDs to call (null = all enabled)
     * @param system      System prompt
     * @param user        User prompt
     * @param temperature Temperature
     * @param maxTokens   Max tokens
     * @return Map with "outputs" and "failures" lists
     */
    public Map<String, Object> generate(List<String> providerIds, String system,
            String user, double temperature, int maxTokens) {
        // Sanitize input
        var sanitized = sanitizeService.sanitizeInput(user);
        if (!sanitized.safe()) {
            throw new IllegalArgumentException("Input rejected: " + sanitized.reason());
        }
        String cleanPrompt = sanitized.cleaned();

        // Determine which providers to use
        List<String> targetProviders = providerIds != null && !providerIds.isEmpty()
                ? providerIds.stream().filter(this::isProviderEnabled).toList()
                : getEnabledProviders();

        if (targetProviders.isEmpty()) {
            throw new IllegalStateException("No enabled providers available");
        }

        long startTime = System.currentTimeMillis();

        // Fire all providers in parallel
        List<CompletableFuture<ProviderResult>> futures = targetProviders.stream()
                .map(id -> {
                    LLMProvider provider = providerMap.get(id);
                    return provider.call(system, cleanPrompt, temperature, maxTokens)
                            .orTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
                            .exceptionally(ex -> {
                                log.warn("Provider {} failed: {}", id, ex.getMessage());
                                return null; // null = failure
                            });
                })
                .toList();

        // Wait for all to complete
        CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();

        // Collect results
        List<Map<String, Object>> outputs = new ArrayList<>();
        List<Map<String, Object>> failures = new ArrayList<>();

        for (int i = 0; i < futures.size(); i++) {
            String providerId = targetProviders.get(i);
            try {
                ProviderResult result = futures.get(i).getNow(null);
                if (result != null) {
                    // Sanitize output
                    var sanitizedOutput = sanitizeService.sanitizeOutput(result.text());

                    outputs.add(Map.of(
                            "providerId", result.providerId(),
                            "text", sanitizedOutput.cleaned(),
                            "requestId", result.requestId(),
                            "tokensUsed", result.tokensUsed(),
                            "latencyMs", result.latencyMs()));

                    // PERSIST SUCCESS LOG FOR METRICS
                    logRepository.save(new SystemLog("info",
                            "Provider " + providerId + " success",
                            Map.of("provider", providerId, "latency", result.latencyMs(), "tokens",
                                    result.tokensUsed())));
                } else {
                    String errorMsg = "Provider returned no result or timed out";
                    failures.add(Map.of(
                            "provider", providerId,
                            "error", errorMsg));

                    // PERSIST ERROR LOG
                    logRepository.save(new SystemLog("error",
                            "Provider " + providerId + " failed",
                            Map.of("provider", providerId, "error", errorMsg)));
                }
            } catch (Exception ex) {
                failures.add(Map.of(
                        "provider", providerId,
                        "error", ex.getMessage() != null ? ex.getMessage() : "Unknown error"));
                logRepository.save(new SystemLog("error",
                        "Provider " + providerId + " failed",
                        Map.of("error", ex.getMessage() != null ? ex.getMessage() : "unknown")));
            }
        }

        long elapsed = System.currentTimeMillis() - startTime;

        return Map.of(
                "outputs", outputs,
                "failures", failures,
                "metadata", Map.of(
                        "elapsedMs", elapsed,
                        "providersQueried", targetProviders.size()));
    }
}
