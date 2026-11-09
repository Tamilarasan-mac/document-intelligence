package com.tamilarasan.documentintelligence.service;

import org.junit.jupiter.api.Test;
import org.springframework.ai.document.Document;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DocumentChunkingServiceTest {

    private final DocumentChunkingService service = new DocumentChunkingService();

    @Test
    void createChunksIncludesSourceAndDocumentIdMetadata() {
        UUID documentId = UUID.randomUUID();
        String text = "A searchable document sentence. ".repeat(250);

        var chunks = service.createChunks(text, "guide.txt", documentId);

        assertFalse(chunks.isEmpty());
        assertTrue(chunks.size() > 1, "Long input should be split into multiple chunks");
        for (Document chunk : chunks) {
            assertTrue(chunk.getText() != null && !chunk.getText().isBlank());
            assertEquals("guide.txt", chunk.getMetadata().get("source"));
            assertEquals(documentId.toString(), chunk.getMetadata().get("documentId"));
        }
    }

    @Test
    void createChunksReturnsNoChunksForBlankText() {
        var chunks = service.createChunks("", "empty.txt", UUID.randomUUID());

        assertTrue(chunks.isEmpty());
    }
}
