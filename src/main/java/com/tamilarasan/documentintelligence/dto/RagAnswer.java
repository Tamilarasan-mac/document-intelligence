package com.tamilarasan.documentintelligence.dto;

import java.util.List;

public record RagAnswer(
        String question,
        String answer,
        List<SourceReference> sources
) {}
