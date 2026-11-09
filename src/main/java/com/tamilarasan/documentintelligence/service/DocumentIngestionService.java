package com.tamilarasan.documentintelligence.service;

import org.apache.tika.Tika;
import org.apache.tika.exception.TikaException;
import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
public class DocumentIngestionService {

    private final DocumentChunkingService chunkingService;
    private final VectorStore vectorStore;

    private final Tika tika = new Tika();

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

        String lowerName = filename.toLowerCase(Locale.ROOT);

        if (!(lowerName.endsWith(".pdf")
                || lowerName.endsWith(".docx")
                || lowerName.endsWith(".txt"))) {

            throw new IllegalArgumentException(
                    "Only PDF, DOCX and TXT files are supported"
            );
        }

// 2. Extract text using Apache Tika
        String extractedText;

        try (var inputStream = file.getInputStream()) {
            extractedText = tika.parseToString(inputStream);
        } catch (TikaException e) {
            throw new IOException("Unable to extract document text", e);
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

    public record UploadResult(
            UUID documentId,
            String filename,
            int totalChunks,
            String message
    ) {}
}
