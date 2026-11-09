package com.tamilarasan.documentintelligence.controller;

import com.tamilarasan.documentintelligence.dto.RagAnswer;
import com.tamilarasan.documentintelligence.dto.SearchDocumentsRequest;
import com.tamilarasan.documentintelligence.dto.SearchResult;
import com.tamilarasan.documentintelligence.service.DocumentIngestionService;
import com.tamilarasan.documentintelligence.service.DocumentIngestionService.UploadResult;
import com.tamilarasan.documentintelligence.service.RagService;
import jakarta.validation.Valid;
import org.apache.tika.exception.TikaException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/documents")
public class DocumentController {

    private final DocumentIngestionService ingestionService;
    private final RagService ragService;

    public DocumentController(
            DocumentIngestionService ingestionService,
            RagService ragService) {
        this.ingestionService = ingestionService;
        this.ragService = ragService;
    }

    @PostMapping(
            value = "/upload",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE
    )
    public ResponseEntity<?> uploadDocument(
            @RequestParam("file") MultipartFile file) {
        try {
            UploadResult result = ingestionService.ingest(file);

            return ResponseEntity
                    .status(HttpStatus.CREATED)
                    .body(result);
        } catch (IllegalArgumentException e) {
            return ResponseEntity
                    .badRequest()
                    .body(Map.of("error", e.getMessage()));
        } catch (IOException | TikaException e) {
            return ResponseEntity
                    .internalServerError()
                    .body(Map.of("error", "Document processing failed"));
        }
    }

    @PostMapping("/search")
    public ResponseEntity<?> searchDocuments(
            @Valid @RequestBody SearchDocumentsRequest request) {
        try {
            List<SearchResult> results =
                    ragService.searchDocuments(request.question())
                            .stream()
                            .map(document -> new SearchResult(
                                    document.getId(),
                                    String.valueOf(
                                            document.getMetadata()
                                                    .getOrDefault("source", "Unknown")
                                    ),
                                    document.getText()
                            ))
                            .toList();

            return ResponseEntity.ok(results);
        } catch (IllegalArgumentException e) {
            return ResponseEntity
                    .badRequest()
                    .body(Map.of("error", e.getMessage()));
        }
    }


    @PostMapping("/ask")
    public ResponseEntity<?> askQuestion(
            @Valid @RequestBody SearchDocumentsRequest request) {

        try {
            RagAnswer answer =
                    ragService.askQuestion(request.question());

            return ResponseEntity.ok(answer);

        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", e.getMessage()));
        }
    }



}
