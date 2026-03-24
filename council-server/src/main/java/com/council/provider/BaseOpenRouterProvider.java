package com.council.provider;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import reactor.util.retry.Retry;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicInteger;

import com.council.provider.LLMProvider.ProviderResult;

/**
 * Base provider containing standard OpenRouter API compatible logic.
 * Several models (Qwen, DeepSeek, Minimax, Moonshot) use this identical format.
 */
public abstract class BaseOpenRouterProvider implements LLMProvider {

    protected final Logger log = LoggerFactory.getLogger(getClass());
    protected static final AtomicInteger counter = new AtomicInteger(0);

    protected final WebClient webClient;
    protected final String apiKey;
    protected final String model;
    protected final String apiUrl;

    public BaseOpenRouterProvider(WebClient webClient, String apiUrl, String apiKey, String model) {
        this.webClient = webClient;
        this.apiUrl = apiUrl;
        this.apiKey = apiKey;
        this.model = model;
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
                    new RuntimeException(getProviderId() + " API key not configured"));
        }

        String requestId = getProviderId() + "_" + System.currentTimeMillis() + "_" + counter.incrementAndGet();
        long start = System.currentTimeMillis();

        Map<String, Object> body = Map.of(
                "model", model,
                "temperature", temperature,
                "max_tokens", maxTokens,
                "messages", List.of(
                        Map.of("role", "system", "content", system),
                        Map.of("role", "user", "content", user)));

        return webClient.post()
                .uri(apiUrl)
                .header("Authorization", "Bearer " + apiKey)
                .header("Content-Type", "application/json")
                .header("HTTP-Referer", "https://council-of-llms.app")
                .header("X-Title", "Council of LLMs")
                .bodyValue(body)
                .retrieve()
                .onStatus(status -> status.isError(), response -> 
                    response.bodyToMono(String.class).flatMap(errorBody -> {
                        log.error("OpenRouter API error: {}", errorBody);
                        return Mono.error(new RuntimeException("OpenRouter API error: " + errorBody));
                    })
                )
                .bodyToMono(Map.class)
                .retryWhen(Retry.backoff(3, Duration.ofSeconds(5))
                        .filter(throwable -> throwable.getMessage() != null && 
                                throwable.getMessage().contains("429"))
                        .doBeforeRetry(signal -> log.warn("OpenRouter API rate limited (429). Retrying... (attempt {})", 
                                signal.totalRetriesInARow() + 1)))
                .map(response -> {
                    long latency = System.currentTimeMillis() - start;
                    @SuppressWarnings("unchecked")
                    var choices = (List<Map<String, Object>>) response.get("choices");
                    if (choices == null || choices.isEmpty()) {
                        throw new RuntimeException("No choices in " + getProviderId() + " response");
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
