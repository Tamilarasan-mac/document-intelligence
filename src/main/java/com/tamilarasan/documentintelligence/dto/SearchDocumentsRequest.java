package com.tamilarasan.documentintelligence.dto;

import jakarta.validation.constraints.NotBlank;

public record SearchDocumentsRequest(

        @NotBlank(message = "Question is required")
        String question

) {}
