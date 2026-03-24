package com.council.provider;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

/**
 * Minimax provider implementation.
 */
@Component
public class MinimaxProvider extends BaseOpenRouterProvider {

    public MinimaxProvider(
            WebClient webClient,
            @Value("${app.minimax.api-key}") String apiKey,
            @Value("${app.minimax.model}") String model) {
        super(webClient, "https://openrouter.ai/api/v1/chat/completions", apiKey, model);
    }

    @Override
    public String getProviderId() {
        return "minimax";
    }
}
