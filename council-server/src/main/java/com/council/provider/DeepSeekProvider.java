package com.council.provider;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

/**
 * DeepSeek provider implementation.
 */
@Component
public class DeepSeekProvider extends BaseOpenRouterProvider {

    public DeepSeekProvider(
            WebClient webClient,
            @Value("${app.deepseek.api-key}") String apiKey,
            @Value("${app.deepseek.model}") String model) {
        super(webClient, "https://openrouter.ai/api/v1/chat/completions", apiKey, model);
    }

    @Override
    public String getProviderId() {
        return "deepseek";
    }
}
