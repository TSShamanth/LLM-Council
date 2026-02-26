package com.council.model;

import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.List;

/**
 * Deliberation document — records which provider won a council session.
 */
@Data
@NoArgsConstructor
@Document(collection = "deliberations")
public class Deliberation {

    @Id
    private String id;

    private String userId;
    private String promptPurpose; // "code" | "content" | "logical"
    private String winnerId;
    private List<String> allProviders;

    @CreatedDate
    private Instant createdAt;

    public Deliberation(String userId, String promptPurpose, String winnerId, List<String> allProviders) {
        this.userId = userId;
        this.promptPurpose = promptPurpose;
        this.winnerId = winnerId;
        this.allProviders = allProviders;
    }
}
