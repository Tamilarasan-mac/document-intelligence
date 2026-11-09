package com.tamilarasan.documentintelligence.dto;

public record SourceReference(
        String chunkId,
        String filename,
        String content
) {}
