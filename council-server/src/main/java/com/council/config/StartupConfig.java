package com.council.config;

import com.council.provider.LLMProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Runs on application startup to print the status of all configured LLM
 * Providers.
 */
@Component
public class StartupConfig implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(StartupConfig.class);

    private final List<LLMProvider> providers;

    public StartupConfig(List<LLMProvider> providers) {
        this.providers = providers;
    }

    @Override
    public void run(String... args) throws Exception {
        log.info("=========================================================");
        log.info("                 COUNCIL OF LLMs                   ");
        log.info("=========================================================");
        log.info("Loaded Providers:");

        long enabledCount = 0;
        for (LLMProvider provider : providers) {
            if (provider.isEnabled()) {
                log.info(" ✅ [ENABLED]  {}", provider.getProviderId().toUpperCase());
                enabledCount++;
            } else {
                log.info(" ❌ [DISABLED] {}", provider.getProviderId().toUpperCase());
            }
        }

        log.info("---------------------------------------------------------");
        log.info("Total Active Providers: {}/{}", enabledCount, providers.size());
        log.info("=========================================================");
    }
}
