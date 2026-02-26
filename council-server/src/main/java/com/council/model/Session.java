package com.council.model;

import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Session document — maps from SQLite 'chat_sessions' + 'chat_attachments'.
 * Stores a complete council session with verdict and outputs as embedded
 * documents.
 */
@Data
@NoArgsConstructor
@Document(collection = "sessions")
public class Session {

    @Id
    private String id;

    @Indexed
    private String userId;

    private String title;
    private String prompt;
    private String purpose; // "code" | "content" | "logical"

    /** Full verdict breakdown as a flexible JSON map */
    private Map<String, Object> verdictData;

    /** Anonymized outputs as a flexible JSON list */
    private List<Map<String, Object>> outputsData;

    /** Combined output from all providers */
    private String combinedOutput;

    /** Filenames of attached files */
    private List<String> attachments;

    @CreatedDate
    private Instant createdAt;
}
