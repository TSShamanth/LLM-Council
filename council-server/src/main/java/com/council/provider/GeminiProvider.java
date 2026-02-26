package com.council.provider;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Google Gemini provider — uses the generateContent REST API.
 */
@Component
public class GeminiProvider implements LLMProvider {

    private static final Logger log = LoggerFactory.getLogger(GeminiProvider.class);
    private static final AtomicInteger counter = new AtomicInteger(0);

    private final WebClient webClient;
    private final String apiKey;
    private final String model;

    public GeminiProvider(
            WebClient webClient,
            @Value("${app.google.api-key}") String apiKey,
            @Value("${app.google.model}") String model) {
        this.webClient = webClient;
        this.apiKey = apiKey;
        this.model = model;
    }

    @Override
    public String getProviderId() {
        return "gemini";
    }

    @Override
    public boolean isEnabled() {
        return apiKey != null && !apiKey.isBlank();
    }

    @Override
    public CompletableFuture<ProviderResult> call(String system, String user,
            double temperature, int maxTokens) {
        if (!isEnabled()) {
            return CompletableFuture.failedFuture(
                    new RuntimeException("Gemini API key not configured"));
        }

        String requestId = "gemini_" + System.currentTimeMillis() + "_" + counter.incrementAndGet();
        long start = System.currentTimeMillis();

        String url = "https://generativelanguage.googleapis.com/v1beta/models/"
                + model + ":generateContent?key=" + apiKey;

        // Build Gemini-specific request body
        Map<String, Object> body = Map.of(
                "system_instruction", Map.of("parts", List.of(Map.of("text", system))),
                "contents", List.of(Map.of("parts", List.of(Map.of("text", user)))),
                "generationConfig", Map.of(
                        "temperature", temperature,
                        "maxOutputTokens", maxTokens));

        return webClient.post()
                .uri(url)
                .bodyValue(body)
                .retrieve()
                .bodyToMono(Map.class)
                .map(response -> {
                    long latency = System.currentTimeMillis() - start;
                    @SuppressWarnings("unchecked")
                    var candidates = (List<Map<String, Object>>) response.get("candidates");
                    if (candidates == null || candidates.isEmpty()) {
                        throw new RuntimeException("No candidates in Gemini response");
                    }
                    @SuppressWarnings("unchecked")
                    var content = (Map<String, Object>) candidates.get(0).get("content");
                    @SuppressWarnings("unchecked")
                    var parts = (List<Map<String, Object>>) content.get("parts");
                    String text = (String) parts.get(0).get("text");

                    // Extract token usage
                    @SuppressWarnings("unchecked")
                    var usage = (Map<String, Object>) response.get("usageMetadata");
                    int tokens = usage != null && usage.get("totalTokenCount") != null
                            ? ((Number) usage.get("totalTokenCount")).intValue()
                            : 0;

                    return new ProviderResult(text.trim(), getProviderId(), requestId, tokens, latency);
                })
                .toFuture();
    }
}
