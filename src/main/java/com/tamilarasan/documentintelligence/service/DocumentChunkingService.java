package com.tamilarasan.documentintelligence.service;

import org.springframework.ai.document.Document;
import org.springframework.ai.transformer.splitter.TokenTextSplitter;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class DocumentChunkingService {

    private final TokenTextSplitter splitter;

    public DocumentChunkingService() {
        this.splitter = TokenTextSplitter.builder()
                .withChunkSize(800)
                .withMinChunkSizeChars(350)
                .withMinChunkLengthToEmbed(10)
                .withMaxNumChunks(10000)
                .withKeepSeparator(true)
                .build();
    }

    public List<Document> createChunks(
            String text,
            String filename,
            UUID documentId) {

        // Create original document
        Document document = new Document(
                text,
                Map.of(
                        "source", filename,
                        "documentId", documentId.toString()
                )
        );

        // Split document into smaller chunks
        return splitter.apply(List.of(document));
    }
}
