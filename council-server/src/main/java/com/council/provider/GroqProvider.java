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
 * Groq provider — uses the OpenAI-compatible chat completions API.
 */
@Component
public class GroqProvider implements LLMProvider {

    private static final Logger log = LoggerFactory.getLogger(GroqProvider.class);
    private static final String API_URL = "https://api.groq.com/openai/v1/chat/completions";
    private static final AtomicInteger counter = new AtomicInteger(0);

    private final WebClient webClient;
    private final String apiKey;
    private final String model;

    public GroqProvider(
            WebClient webClient,
            @Value("${app.groq.api-key}") String apiKey,
            @Value("${app.groq.model}") String model) {
        this.webClient = webClient;
        this.apiKey = apiKey;
        this.model = model;
    }

    @Override
    public String getProviderId() {
        return "groq";
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
                    new RuntimeException("Groq API key not configured"));
        }

        String requestId = "groq_" + System.currentTimeMillis() + "_" + counter.incrementAndGet();
        long start = System.currentTimeMillis();

        Map<String, Object> body = Map.of(
                "model", model,
                "temperature", temperature,
                "max_tokens", maxTokens,
                "messages", List.of(
                        Map.of("role", "system", "content", system),
                        Map.of("role", "user", "content", user)));

        return webClient.post()
                .uri(API_URL)
                .header("Authorization", "Bearer " + apiKey)
                .header("Content-Type", "application/json")
                .bodyValue(body)
                .retrieve()
                .bodyToMono(Map.class)
                .map(response -> {
                    long latency = System.currentTimeMillis() - start;
                    @SuppressWarnings("unchecked")
                    var choices = (List<Map<String, Object>>) response.get("choices");
                    if (choices == null || choices.isEmpty()) {
                        throw new RuntimeException("No choices in Groq response");
                    }
                    @SuppressWarnings("unchecked")
                    var message = (Map<String, Object>) choices.get(0).get("message");
                    String text = (String) message.get("content");

                    @SuppressWarnings("unchecked")
                    var usage = (Map<String, Object>) response.get("usage");
                    int tokens = usage != null && usage.get("total_tokens") != null
                            ? ((Number) usage.get("total_tokens")).intValue()
                            : 0;

                    return new ProviderResult(text.trim(), getProviderId(), requestId, tokens, latency);
                })
                .toFuture();
    }
}
