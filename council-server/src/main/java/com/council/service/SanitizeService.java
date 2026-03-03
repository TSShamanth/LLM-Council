package com.council.service;

import org.springframework.stereotype.Service;

import java.util.List;
import java.util.regex.Pattern;

/**
 * Input/output sanitization to prevent XSS, injection, and prompt attacks.
 * Direct port of the Node.js sanitizer.js module.
 */
@Service
public class SanitizeService {

    // Prompt injection patterns
    private static final List<Pattern> INJECTION_PATTERNS = List.of(
            Pattern.compile("ignore (all )?previous (instructions|prompts)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("forget (all )?previous (instructions|context)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("you are now", Pattern.CASE_INSENSITIVE),
            Pattern.compile("new (instruction|directive|system prompt)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("disregard (all )?(previous|above)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("<script[^>]*>.*?</script>", Pattern.CASE_INSENSITIVE | Pattern.DOTALL),
            Pattern.compile("javascript:", Pattern.CASE_INSENSITIVE),
            Pattern.compile("<iframe", Pattern.CASE_INSENSITIVE));

    // XSS patterns for output sanitization
    private static final List<Pattern> XSS_PATTERNS = List.of(
            Pattern.compile("<script[^>]*>.*?</script>", Pattern.CASE_INSENSITIVE | Pattern.DOTALL),
            Pattern.compile("<iframe[^>]*>.*?</iframe>", Pattern.CASE_INSENSITIVE | Pattern.DOTALL),
            Pattern.compile("<iframe[^>]*>", Pattern.CASE_INSENSITIVE),
            Pattern.compile("javascript:", Pattern.CASE_INSENSITIVE),
            Pattern.compile("<embed[^>]*>", Pattern.CASE_INSENSITIVE),
            Pattern.compile("<object[^>]*>", Pattern.CASE_INSENSITIVE));

    // Identity leak patterns
    private static final List<Pattern> IDENTITY_PATTERNS = List.of(
            Pattern.compile("\\b(as an? (AI|language model|LLM|assistant|claude|gpt|gemini))\\b",
                    Pattern.CASE_INSENSITIVE),
            Pattern.compile("\\b(I('m| am) (claude|gpt|an AI|an artificial intelligence))\\b",
                    Pattern.CASE_INSENSITIVE),
            Pattern.compile("\\bclaude[\\s-]*(sonnet|opus|haiku)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("\\bgpt-?[0-4]", Pattern.CASE_INSENSITIVE),
            Pattern.compile("\\bgemini-?[0-2]", Pattern.CASE_INSENSITIVE));

    public record SanitizeResult(boolean safe, String cleaned, String reason) {
    }

    /**
     * Sanitize user input before sending to LLMs.
     */
    public SanitizeResult sanitizeInput(String input) {
        if (input == null || input.isBlank()) {
            return new SanitizeResult(false, "", "Input is empty");
        }

        String cleaned = input.trim();

        // Check injection patterns
        for (Pattern p : INJECTION_PATTERNS) {
            if (p.matcher(cleaned).find()) {
                return new SanitizeResult(false, cleaned,
                        "Potential prompt injection detected");
            }
        }

        return new SanitizeResult(true, cleaned, null);
    }

    /**
     * Sanitize LLM output before displaying to users.
     */
    public SanitizeResult sanitizeOutput(String output) {
        if (output == null)
            return new SanitizeResult(true, "", null);

        String cleaned = output;
        boolean hadXss = false;

        // Strip XSS patterns
        for (Pattern p : XSS_PATTERNS) {
            if (p.matcher(cleaned).find()) {
                hadXss = true;
                cleaned = p.matcher(cleaned).replaceAll("");
            }
        }

        // Strip identity leaks (replace with neutral phrasing)
        for (Pattern p : IDENTITY_PATTERNS) {
            cleaned = p.matcher(cleaned).replaceAll("[response]");
        }

        return new SanitizeResult(true, cleaned.trim(), hadXss ? "XSS patterns removed" : null);
    }
}
