package com.tamilarasan.documentintelligence.mcp;

import com.tamilarasan.documentintelligence.dto.RagAnswer;
import com.tamilarasan.documentintelligence.service.RagService;

import org.springframework.ai.document.Document;
import org.springframework.ai.mcp.annotation.McpTool;
import org.springframework.ai.mcp.annotation.McpToolParam;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.stream.Collectors;

@Component
public class RagMcpTools {

    private final RagService ragService;

    public RagMcpTools(RagService ragService) {
        this.ragService = ragService;
    }

    // MCP Tool 1: Search uploaded documents
    @McpTool(
            name = "search_documents",
            description = "Search uploaded documents and return the most "
                    + "relevant text passages for a question."
    )
    public String searchDocuments(
            @McpToolParam(
                    description = "The question or keywords to search for",
                    required = true
            )
            String question) {

        List<Document> documents =
                ragService.searchDocuments(question);

        if (documents.isEmpty()) {
            return "No relevant information found in uploaded documents.";
        }

        return documents.stream()
                .map(document -> {
                    String source = String.valueOf(
                            document.getMetadata()
                                    .getOrDefault("source", "Unknown")
                    );

                    return "Source: " + source
                            + "\nContent:\n" + document.getText();
                })
                .collect(Collectors.joining("\n\n---\n\n"));
    }

    // MCP Tool 2: Ask questions using RAG
    @McpTool(
            name = "ask_documents",
            description = "Answer a question using only information "
                    + "retrieved from the uploaded documents. "
                    + "Returns the generated answer and source references."
    )
    public String askDocuments(
            @McpToolParam(
                    description = "The question to ask about uploaded documents",
                    required = true
            )
            String question) {

        RagAnswer result = ragService.askQuestion(question);

        String sources = result.sources().stream()
                .map(source ->
                        "- " + source.filename()
                                + " (chunk: " + source.chunkId() + ")"
                )
                .collect(Collectors.joining("\n"));

        if (sources.isBlank()) {
            sources = "No source documents found.";
        }

        return """
                Question:
                %s

                Answer:
                %s

                Sources:
                %s
                """.formatted(
                result.question(),
                result.answer(),
                sources
        );
    }
}
