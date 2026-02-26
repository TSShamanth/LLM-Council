package com.council.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

@Data
public class GenerateRequest {
    @NotBlank(message = "Prompt is required")
    @Size(min = 1, max = 15000, message = "Prompt must be 1-15000 characters")
    private String prompt;

    private List<String> providers; // Optional — defaults to all enabled

    @DecimalMin(value = "0.0", message = "Temperature must be >= 0")
    @DecimalMax(value = "2.0", message = "Temperature must be <= 2")
    private Double temperature = 0.7;

    private Integer maxTokens = 2000;

    private String systemPrompt; // Optional custom system prompt

    private String purpose; // "code" | "content" | "logical"
}
