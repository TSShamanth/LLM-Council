package com.council.model;

import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.Map;

/**
 * SystemLog document — structured server logs with 30-day TTL auto-deletion.
 */
@Data
@NoArgsConstructor
@Document(collection = "systemLogs")
public class SystemLog {

    @Id
    private String id;

    private String level; // "error" | "warn" | "info"
    private String message;
    private Map<String, Object> meta;

    @Indexed(expireAfter = "30d")
    @CreatedDate
    private Instant createdAt;

    public SystemLog(String level, String message, Map<String, Object> meta) {
        this.level = level;
        this.message = message;
        this.meta = meta;
    }
}
