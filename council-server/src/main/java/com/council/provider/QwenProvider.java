package com.council.provider;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

/**
 * Qwen provider implementation.
 */
@Component
public class QwenProvider extends BaseOpenRouterProvider {

    public QwenProvider(
            WebClient webClient,
            @Value("${app.qwen.api-key}") String apiKey,
            @Value("${app.qwen.model}") String model) {
        super(webClient, "https://openrouter.ai/api/v1/chat/completions", apiKey, model);
    }

    @Override
    public String getProviderId() {
        return "qwen";
    }
}
