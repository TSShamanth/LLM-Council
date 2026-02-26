package com.council.service;

import com.council.model.Session;
import com.council.repository.SessionRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Session CRUD service — chat history management.
 * Port of the Node.js /api/sessions endpoints.
 */
@Service
public class SessionService {

    private final SessionRepository sessionRepository;

    public SessionService(SessionRepository sessionRepository) {
        this.sessionRepository = sessionRepository;
    }

    /**
     * Save a new session for a user.
     */
    public Session save(String userId, String title, String prompt, String purpose,
            Map<String, Object> verdictData, List<Map<String, Object>> outputsData,
            String combinedOutput, List<String> attachments) {
        Session session = new Session();
        session.setUserId(userId);
        session.setTitle(title);
        session.setPrompt(prompt);
        session.setPurpose(purpose);
        session.setVerdictData(verdictData);
        session.setOutputsData(outputsData);
        session.setCombinedOutput(combinedOutput);
        session.setAttachments(attachments);
        return sessionRepository.save(session);
    }

    /**
     * List sessions for a user with pagination.
     */
    public Page<Session> listByUser(String userId, int page, int size) {
        // Frontend sends 1-indexed pages, Spring Data uses 0-indexed
        int zeroBasedPage = Math.max(0, page - 1);
        PageRequest pageRequest = PageRequest.of(zeroBasedPage, size, Sort.by("createdAt").descending());
        return sessionRepository.findByUserIdOrderByCreatedAtDesc(userId, pageRequest);
    }

    /**
     * Get a specific session by ID (user-scoped for security).
     */
    public Optional<Session> getByIdAndUser(String sessionId, String userId) {
        return sessionRepository.findById(sessionId)
                .filter(s -> s.getUserId().equals(userId));
    }

    /**
     * Delete a session (user-scoped).
     */
    public void delete(String sessionId, String userId) {
        sessionRepository.deleteByIdAndUserId(sessionId, userId);
    }

    /**
     * Count sessions for a user.
     */
    public long countByUser(String userId) {
        return sessionRepository.countByUserId(userId);
    }
}
