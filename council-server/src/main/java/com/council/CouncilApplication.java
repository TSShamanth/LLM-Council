package com.council;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.mongodb.config.EnableMongoAuditing;
import org.springframework.scheduling.annotation.EnableAsync;

/**
 * Council of LLMs — Spring Boot Backend
 * Blind peer-review system for LLM outputs.
 */
@SpringBootApplication
@EnableMongoAuditing
@EnableAsync
public class CouncilApplication {

    public static void main(String[] args) {
        SpringApplication.run(CouncilApplication.class, args);
    }
}
