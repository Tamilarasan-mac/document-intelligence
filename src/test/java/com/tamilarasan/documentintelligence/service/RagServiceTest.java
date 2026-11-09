package com.tamilarasan.documentintelligence.service;

import com.tamilarasan.documentintelligence.dto.RagAnswer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.RETURNS_DEEP_STUBS;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RagServiceTest {

    private VectorStore vectorStore;
    private ChatClient chatClient;
    private RagService service;

    @BeforeEach
    void setUp() {
        vectorStore = mock(VectorStore.class);
        chatClient = mock(ChatClient.class, RETURNS_DEEP_STUBS);
        ChatClient.Builder builder = mock(ChatClient.Builder.class);
        when(builder.build()).thenReturn(chatClient);
        service = new RagService(vectorStore, builder);
    }

    @Test
    void searchDocumentsRejectsBlankQuestion() {
        assertThrows(IllegalArgumentException.class, () -> service.searchDocuments(null));
        assertThrows(IllegalArgumentException.class, () -> service.searchDocuments("  "));
        verify(vectorStore, never()).similaritySearch(any(SearchRequest.class));
    }

    @Test
    void searchDocumentsUsesQuestionAndReturnsMatches() {
        var documents = List.of(new Document("Relevant passage"));
        when(vectorStore.similaritySearch(any(SearchRequest.class))).thenReturn(documents);

        var result = service.searchDocuments("What does the guide say?");

        assertEquals(documents, result);
        verify(vectorStore).similaritySearch(any(SearchRequest.class));
    }

    @Test
    void askQuestionRejectsBlankQuestion() {
        assertThrows(IllegalArgumentException.class, () -> service.askQuestion(""));
        verify(vectorStore, never()).similaritySearch(any(SearchRequest.class));
    }

    @Test
    void askQuestionReturnsFallbackWhenNoDocumentsMatch() {
        when(vectorStore.similaritySearch(any(SearchRequest.class))).thenReturn(List.of());

        RagAnswer answer = service.askQuestion("What does the guide say?");

        assertEquals("What does the guide say?", answer.question());
        assertEquals("I couldn't find relevant information in the uploaded documents.", answer.answer());
        assertEquals(List.of(), answer.sources());
        verify(chatClient, never()).prompt();
    }

    @Test
    void askQuestionGeneratesAnswerAndIncludesSourceReferences() {
        Document document = new Document("The office opens at nine.", Map.of("source", "hours.txt"));
        when(vectorStore.similaritySearch(any(SearchRequest.class))).thenReturn(List.of(document));
        when(chatClient.prompt().system(anyString()).user(anyString()).call().content())
                .thenReturn("The office opens at nine (hours.txt).");

        RagAnswer answer = service.askQuestion("When does the office open?");

        assertEquals("The office opens at nine (hours.txt).", answer.answer());
        assertEquals("When does the office open?", answer.question());
        assertEquals(1, answer.sources().size());
        assertEquals("hours.txt", answer.sources().getFirst().filename());
        assertEquals(document.getId(), answer.sources().getFirst().chunkId());
        assertEquals(document.getText(), answer.sources().getFirst().content());
    }
}
