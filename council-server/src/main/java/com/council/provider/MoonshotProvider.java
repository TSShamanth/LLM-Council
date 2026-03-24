package com.council.provider;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

/**
 * Moonshot provider implementation.
 */
@Component
public class MoonshotProvider extends BaseOpenRouterProvider {

    public MoonshotProvider(
            WebClient webClient,
            @Value("${app.moonshot.api-key}") String apiKey,
            @Value("${app.moonshot.model}") String model) {
        super(webClient, "https://openrouter.ai/api/v1/chat/completions", apiKey, model);
    }

    @Override
    public String getProviderId() {
        return "moonshot";
    }
}
