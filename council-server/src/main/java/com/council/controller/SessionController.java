package com.council.controller;

import com.council.model.Session;
import com.council.service.SessionService;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Session CRUD controller — chat history management.
 * Matches the Node.js /api/sessions endpoints.
 */
@RestController
@RequestMapping("/api/sessions")
public class SessionController {

    private final SessionService sessionService;

    public SessionController(SessionService sessionService) {
        this.sessionService = sessionService;
    }

    @PostMapping
    @SuppressWarnings("unchecked")
    public ResponseEntity<?> save(@RequestBody Map<String, Object> body,
            Authentication auth) {
        String userId = getUserId(auth);

        String title = (String) body.getOrDefault("title", "Untitled Session");
        String prompt = (String) body.get("prompt");
        String purpose = (String) body.getOrDefault("purpose", "content");
        Map<String, Object> verdictData = (Map<String, Object>) body.get("verdictData");
        List<Map<String, Object>> outputsData = (List<Map<String, Object>>) body.get("outputsData");
        String combinedOutput = (String) body.get("combinedOutput");
        List<String> attachments = (List<String>) body.get("attachments");

        Session session = sessionService.save(userId, title, prompt, purpose,
                verdictData, outputsData, combinedOutput, attachments);

        return ResponseEntity.status(201).body(Map.of(
                "id", session.getId(),
                "message", "Session saved"));
    }

    @GetMapping
    public ResponseEntity<?> list(Authentication auth,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int limit) {
        String userId = getUserId(auth);
        Page<Session> sessions = sessionService.listByUser(userId, page, limit);

        return ResponseEntity.ok(Map.of(
                "sessions", sessions.getContent(),
                "total", sessions.getTotalElements(),
                "page", sessions.getNumber(),
                "totalPages", sessions.getTotalPages()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> get(@PathVariable String id, Authentication auth) {
        String userId = getUserId(auth);
        return sessionService.getByIdAndUser(id, userId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable String id, Authentication auth) {
        String userId = getUserId(auth);
        sessionService.delete(id, userId);
        return ResponseEntity.ok(Map.of("message", "Session deleted"));
    }

    @SuppressWarnings("unchecked")
    private String getUserId(Authentication auth) {
        Map<String, String> user = (Map<String, String>) auth.getPrincipal();
        return user.get("id");
    }
}
