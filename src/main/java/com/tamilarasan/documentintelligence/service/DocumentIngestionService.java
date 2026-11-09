package com.tamilarasan.documentintelligence.service;

import org.apache.tika.Tika;
import org.apache.tika.exception.TikaException;
import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
public class DocumentIngestionService {

    private final DocumentChunkingService chunkingService;
    private final VectorStore vectorStore;

    private final Tika tika = new Tika();
    private static final int MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

    public DocumentIngestionService(
            DocumentChunkingService chunkingService,
            VectorStore vectorStore) {

        this.chunkingService = chunkingService;
        this.vectorStore = vectorStore;
    }

    public UploadResult ingest(MultipartFile file)
            throws IOException, TikaException {

        // 1. Validate file
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException(
                    "Uploaded file is empty"
            );
        }

        String filename = file.getOriginalFilename();

        if (filename == null || filename.isBlank()) {
            throw new IllegalArgumentException(
                    "Filename is required"
            );
        }

        if (filename.length() > 255
                || filename.indexOf('/') >= 0
                || filename.indexOf('\\') >= 0
                || filename.chars().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException("Invalid filename");
        }

        String lowerName = filename.toLowerCase(Locale.ROOT);

        if (!(lowerName.endsWith(".pdf")
                || lowerName.endsWith(".docx")
                || lowerName.endsWith(".txt"))) {

            throw new IllegalArgumentException(
                    "Only PDF, DOCX and TXT files are supported"
            );
        }

        if (file.getSize() > MAX_FILE_SIZE_BYTES) {
            throw new IllegalArgumentException("File must be 10 MB or smaller");
        }

        byte[] content;
        try (var inputStream = file.getInputStream()) {
            content = inputStream.readNBytes(MAX_FILE_SIZE_BYTES + 1);
        }
        if (content.length == 0) {
            throw new IllegalArgumentException("Uploaded file is empty");
        }
        if (content.length > MAX_FILE_SIZE_BYTES) {
            throw new IllegalArgumentException("File must be 10 MB or smaller");
        }

        validateContent(filename, content);

        // Extract text only after checking the file's contents.
        String extractedText;

        try (var inputStream = new java.io.ByteArrayInputStream(content)) {
            extractedText = tika.parseToString(inputStream);
        } catch (TikaException e) {
            throw new IOException("Unable to extract document text", e);
        }

        if (extractedText == null || extractedText.isBlank()) {
            throw new IllegalArgumentException("Document contains no searchable text");
        }

        // 3. Generate unique document ID
        UUID documentId = UUID.randomUUID();

        // 4. Split text into chunks
        List<Document> chunks =
                chunkingService.createChunks(
                        extractedText,
                        filename,
                        documentId
                );

        if (chunks.isEmpty()) {
            throw new IllegalArgumentException(
                    "Document did not produce any searchable chunks"
            );
        }

        // 5. Generate embeddings and save to pgvector
        vectorStore.add(chunks);

        // 6. Return upload information
        return new UploadResult(
                documentId,
                filename,
                chunks.size(),
                "Document uploaded and indexed successfully"
        );
    }

    private void validateContent(String filename, byte[] content) throws IOException {
        String lowerName = filename.toLowerCase(Locale.ROOT);
        String detectedType = tika.detect(content, filename);

        if (lowerName.endsWith(".pdf")) {
            int headerLimit = Math.min(content.length, 1024);
            String header = new String(content, 0, headerLimit, StandardCharsets.ISO_8859_1);
            if (!header.contains("%PDF-") || !"application/pdf".equals(detectedType)) {
                throw new IllegalArgumentException("File contents do not match the .pdf extension");
            }
        } else if (lowerName.endsWith(".docx")) {
            boolean zipSignature = content.length >= 4
                    && content[0] == 'P' && content[1] == 'K'
                    && content[2] == 3 && content[3] == 4;
            if (!zipSignature
                    || !"application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            .equals(detectedType)) {
                throw new IllegalArgumentException("File contents do not match the .docx extension");
            }
        } else if (!"text/plain".equals(detectedType)) {
            throw new IllegalArgumentException("File contents do not match the .txt extension");
        }
    }

    public record UploadResult(
            UUID documentId,
            String filename,
            int totalChunks,
            String message
    ) {}
}
