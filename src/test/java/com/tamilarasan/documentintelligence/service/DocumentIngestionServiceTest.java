package com.tamilarasan.documentintelligence.service;

import org.apache.tika.exception.TikaException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.mock.web.MockMultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DocumentIngestionServiceTest {

    private DocumentChunkingService chunkingService;
    private VectorStore vectorStore;
    private DocumentIngestionService service;

    @BeforeEach
    void setUp() {
        chunkingService = mock(DocumentChunkingService.class);
        vectorStore = mock(VectorStore.class);
        service = new DocumentIngestionService(chunkingService, vectorStore);
    }

    @Test
    void ingestExtractsChunksStoresThemAndReturnsUploadDetails() throws Exception {
        String body = "The uploaded file contains searchable information.";
        var file = new MockMultipartFile("file", "guide.txt", "text/plain", body.getBytes());
        var chunks = List.of(new Document("A searchable chunk"));
        when(chunkingService.createChunks(any(), eq("guide.txt"), any(UUID.class)))
                .thenReturn(chunks);

        var result = service.ingest(file);

        assertNotNull(result.documentId());
        assertEquals("guide.txt", result.filename());
        assertEquals(1, result.totalChunks());
        assertEquals("Document uploaded and indexed successfully", result.message());
        verify(chunkingService).createChunks(any(), eq("guide.txt"), eq(result.documentId()));
        verify(vectorStore).add(chunks);
    }

    @Test
    void ingestRejectsNullOrEmptyFile() {
        assertThrows(IllegalArgumentException.class, () -> service.ingest(null));
        assertThrows(IllegalArgumentException.class,
                () -> service.ingest(new MockMultipartFile("file", "empty.txt", "text/plain", new byte[0])));
        verify(chunkingService, never()).createChunks(any(), any(), any());
        verify(vectorStore, never()).add(any());
    }

    @Test
    void ingestRejectsMissingFilenameAndUnsupportedExtension() {
        var missingName = new MockMultipartFile("file", "", "text/plain", "text".getBytes());
        var unsupported = new MockMultipartFile("file", "notes.md", "text/markdown", "text".getBytes());

        assertThrows(IllegalArgumentException.class, () -> service.ingest(missingName));
        assertThrows(IllegalArgumentException.class, () -> service.ingest(unsupported));
        verify(chunkingService, never()).createChunks(any(), any(), any());
        verify(vectorStore, never()).add(any());
    }

    @Test
    void ingestRejectsDocumentsThatProduceNoChunks() throws IOException, TikaException {
        var file = new MockMultipartFile("file", "guide.txt", "text/plain", "Readable content".getBytes());
        when(chunkingService.createChunks(any(), eq("guide.txt"), any(UUID.class))).thenReturn(List.of());

        assertThrows(IllegalArgumentException.class, () -> service.ingest(file));
        verify(vectorStore, never()).add(any());
    }
}
