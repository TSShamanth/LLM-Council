package com.council.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

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
    // @SuppressWarnings("unchecked")
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

            // Extract text if it's a PDF or ZIP
            String extractedText = null;
            boolean isPdf = (mimeType != null && mimeType.equalsIgnoreCase("application/pdf")) || 
                           (fileName != null && fileName.toLowerCase().endsWith(".pdf"));
            
            boolean isZip = (mimeType != null && (mimeType.equalsIgnoreCase("application/zip") || 
                                                 mimeType.equalsIgnoreCase("application/x-zip-compressed"))) || 
                           (fileName != null && fileName.toLowerCase().endsWith(".zip"));

            if (isPdf) {
                extractedText = extractTextFromPdf(decoded);
            } else if (isZip) {
                extractedText = extractTextFromZip(decoded);
            }

            // Return metadata matching frontend contract
            Map<String, Object> response = new HashMap<>();
            response.put("filename", safeFileName);
            response.put("originalName", fileName);
            response.put("mimeType", mimeType != null ? mimeType : "application/octet-stream");
            response.put("sizeBytes", decoded.length);
            response.put("url", "/uploads/" + safeFileName);
            if (extractedText != null) {
                response.put("textContent", extractedText);
            }

            return ResponseEntity.ok(response);
        } catch (IOException e) {
            log.error("Upload failed: {}", e.getMessage());
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to save file"));
        }
    }

    private String extractTextFromPdf(byte[] pdfData) {
        try (PDDocument document = Loader.loadPDF(pdfData)) {
            PDFTextStripper stripper = new PDFTextStripper();
            return stripper.getText(document);
        } catch (IOException e) {
            log.warn("Failed to extract text from PDF: {}", e.getMessage());
            return null;
        }
    }

    private String extractTextFromZip(byte[] zipData) {
        StringBuilder sb = new StringBuilder();
        Set<String> textExtensions = Set.of(
            ".txt", ".md", ".json", ".js", ".ts", ".jsx", ".tsx", ".py", ".css", ".html", ".csv", ".yaml", ".yml", ".java", ".xml", ".properties"
        );

        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(zipData))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                if (!entry.isDirectory()) {
                    String name = entry.getName();
                    int dotIdx = name.lastIndexOf('.');
                    if (dotIdx > 0) {
                        String ext = name.substring(dotIdx).toLowerCase();
                        if (textExtensions.contains(ext)) {
                            sb.append("\n\n--- FILE: ").append(name).append(" ---\n");
                            byte[] content = zis.readAllBytes();
                            sb.append(new String(content, StandardCharsets.UTF_8));
                            sb.append("\n--- END FILE ---");
                        }
                    }
                }
                zis.closeEntry();
            }
        } catch (IOException e) {
            log.warn("Failed to extract text from ZIP: {}", e.getMessage());
            return null;
        }

        String result = sb.toString().trim();
        return result.isEmpty() ? null : result;
    }
}
