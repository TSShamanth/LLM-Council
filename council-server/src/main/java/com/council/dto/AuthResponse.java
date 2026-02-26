package com.council.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.Map;

@Data
@AllArgsConstructor
public class AuthResponse {
    private String token;
    private Map<String, Object> user;
}
