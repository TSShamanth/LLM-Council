package com.council.controller;

import com.council.dto.GenerateRequest;
import com.council.service.GenerateService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * POST /api/generate — Multi-provider LLM generation endpoint.
 */
@RestController
@RequestMapping("/api")
public class GenerateController {

    private final GenerateService generateService;

    public GenerateController(GenerateService generateService) {
        this.generateService = generateService;
    }

    @PostMapping("/generate")
    public ResponseEntity<?> generate(@Valid @RequestBody GenerateRequest request,
            Authentication auth) {
        try {
            String systemPrompt = request.getSystemPrompt() != null
                    ? request.getSystemPrompt()
                    : "You are a helpful assistant. Provide a comprehensive, accurate response.";

            Map<String, Object> result = generateService.generate(
                    request.getProviders(),
                    systemPrompt,
                    request.getPrompt(),
                    request.getTemperature() != null ? request.getTemperature() : 0.7,
                    request.getMaxTokens() != null ? request.getMaxTokens() : 2000);

            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Internal server error"));
        }
    }
}
