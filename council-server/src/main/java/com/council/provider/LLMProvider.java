package com.council.provider;

import java.util.concurrent.CompletableFuture;

/**
 * Common interface for all LLM provider implementations.
 * Each provider returns text output asynchronously via CompletableFuture.
 */
public interface LLMProvider {

    /**
     * Call the LLM provider with the given parameters.
     *
     * @param system      System prompt
     * @param user        User prompt
     * @param temperature Temperature (0.0 - 2.0)
     * @param maxTokens   Maximum tokens to generate
     * @return CompletableFuture with the result
     */
    CompletableFuture<ProviderResult> call(String system, String user,
            double temperature, int maxTokens);

    /** Unique identifier for this provider (e.g., "gemini", "groq") */
    String getProviderId();

    /** Whether this provider is enabled (API key is configured) */
    boolean isEnabled();

    /**
     * Result from an LLM provider call.
     */
    record ProviderResult(
            String text,
            String providerId,
            String requestId,
            int tokensUsed,
            long latencyMs) {
    }
}
