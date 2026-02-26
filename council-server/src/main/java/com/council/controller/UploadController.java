package com.council.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;

/**
 * POST /api/upload — Base64 file upload endpoint.
 * Decodes base64 file data and stores to disk. Images stay client-side;
 * this handles non-image files (code, text, PDFs, etc.).
 */
@RestController
@RequestMapping("/api")
public class UploadController {

    private static final Logger log = LoggerFactory.getLogger(UploadController.class);
    private static final long MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

    @Value("${app.upload.dir:uploads}")
    private String uploadDir;

    @PostMapping("/upload")
    @SuppressWarnings("unchecked")
    public ResponseEntity<?> upload(@RequestBody Map<String, Object> body,
            Authentication auth) {
        try {
            String fileName = (String) body.get("fileName");
            String fileData = (String) body.get("fileData");
            String mimeType = (String) body.get("mimeType");

            if (fileName == null || fileData == null) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "fileName and fileData are required"));
            }

            // Decode base64
            byte[] decoded;
            try {
                decoded = Base64.getDecoder().decode(fileData);
            } catch (IllegalArgumentException e) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Invalid base64 data"));
            }

            // Size check
            if (decoded.length > MAX_FILE_SIZE) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "File exceeds 10MB limit"));
            }

            // Sanitize filename — keep extension, replace name with UUID
            String ext = "";
            int dotIdx = fileName.lastIndexOf('.');
            if (dotIdx > 0) {
                ext = fileName.substring(dotIdx);
            }
            String safeFileName = UUID.randomUUID().toString() + ext;

            // Ensure upload directory exists
            Path uploadPath = Paths.get(uploadDir).toAbsolutePath();
            Files.createDirectories(uploadPath);

            // Write file
            Path filePath = uploadPath.resolve(safeFileName);
            Files.write(filePath, decoded);

            log.info("File uploaded: {} -> {} ({} bytes)", fileName, safeFileName, decoded.length);

            // Return metadata matching frontend contract
            return ResponseEntity.ok(Map.of(
                    "filename", safeFileName,
                    "originalName", fileName,
                    "mimeType", mimeType != null ? mimeType : "application/octet-stream",
                    "sizeBytes", decoded.length,
                    "url", "/uploads/" + safeFileName));
        } catch (IOException e) {
            log.error("Upload failed: {}", e.getMessage());
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to save file"));
        }
    }
}
