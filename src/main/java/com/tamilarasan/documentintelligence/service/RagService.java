
package com.tamilarasan.documentintelligence.service;

import com.tamilarasan.documentintelligence.dto.RagAnswer;
import com.tamilarasan.documentintelligence.dto.SourceReference;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class RagService {

    private final VectorStore vectorStore;
    private final ChatClient chatClient;

    public RagService(
            VectorStore vectorStore,
            ChatClient.Builder chatClientBuilder) {

        this.vectorStore = vectorStore;
        this.chatClient = chatClientBuilder.build();
    }

    // Step 1: Retrieve relevant document chunks
    public List<Document> searchDocuments(String question) {

        if (question == null || question.isBlank()) {
            throw new IllegalArgumentException(
                    "Search question cannot be empty");
        }

        SearchRequest searchRequest = SearchRequest.builder()
                .query(question)
                .topK(5)
                .build();

        return vectorStore.similaritySearch(searchRequest);
    }

    // Step 2: Generate an answer using retrieved context
    public RagAnswer askQuestion(String question) {

        if (question == null || question.isBlank()) {
            throw new IllegalArgumentException(
                    "Question cannot be empty");
        }

        List<Document> documents = searchDocuments(question);

        // No relevant documents found
        if (documents.isEmpty()) {
            return new RagAnswer(
                    question,
                    "I couldn't find relevant information "
                            + "in the uploaded documents.",
                    List.of()
            );
        }

        // Step 3: Build context from retrieved chunks
        String context = documents.stream()
                .map(document -> {
                    String filename = String.valueOf(
                            document.getMetadata()
                                    .getOrDefault("source", "Unknown")
                    );

                    return "Source: " + filename
                            + "\nContent:\n" + document.getText();
                })
                .collect(Collectors.joining("\n\n"));

        // Step 4: Send context and question to Ollama
        String answer = chatClient.prompt()
                .system("""
                        You are a document question-answering assistant.

                        Rules:
                        1. Answer using ONLY the supplied document context.
                        2. Do not use outside knowledge.
                        3. Do not invent facts or information.
                        4. If the context does not contain the answer,
                           clearly say that the uploaded documents
                           do not provide enough information.
                        5. Keep the answer clear and relevant.
                        6. Mention the source filename when possible.
                        """)
                .user("""
                        DOCUMENT CONTEXT:

                        %s

                        USER QUESTION:

                        %s

                        Answer based only on the document context.
                        """.formatted(context, question))
                .call()
                .content();

        // Step 5: Prepare source references
        List<SourceReference> sources = documents.stream()
                .map(document -> new SourceReference(
                        document.getId(),
                        String.valueOf(
                                document.getMetadata()
                                        .getOrDefault("source", "Unknown")
                        ),
                        document.getText()
                ))
                .toList();

        return new RagAnswer(
                question,
                answer,
                sources
        );
    }
}

