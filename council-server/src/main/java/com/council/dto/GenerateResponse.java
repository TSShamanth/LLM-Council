package com.council.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
@AllArgsConstructor
public class GenerateResponse {
    private List<Map<String, Object>> outputs;
    private List<Map<String, Object>> failures;
    private Map<String, Object> metadata;
}
