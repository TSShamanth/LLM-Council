package com.council.service;

import com.council.dto.AuthRequest;
import com.council.dto.AuthResponse;
import com.council.model.SystemLog;
import com.council.model.User;
import com.council.repository.SystemLogRepository;
import com.council.repository.UserRepository;
import com.council.security.JwtUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Authentication service — register, login, account lockout, password policy.
 * Port of the Node.js auth routes with all security hardening.
 */
@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    // Account lockout settings (§3.3 #5)
    private static final int MAX_ATTEMPTS = 5;
    private static final long LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

    private final UserRepository userRepository;
    private final SystemLogRepository logRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;

    @Value("${app.admin.email:}")
    private String adminEmail;

    // In-memory lockout tracker
    private final ConcurrentHashMap<String, LoginAttempt> loginAttempts = new ConcurrentHashMap<>();

    private record LoginAttempt(int count, long lockedUntil) {
    }

    public AuthService(UserRepository userRepository,
            SystemLogRepository logRepository,
            PasswordEncoder passwordEncoder,
            JwtUtil jwtUtil) {
        this.userRepository = userRepository;
        this.logRepository = logRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
    }

    /**
     * Register a new user with strong password policy and admin role control.
     */
    public AuthResponse register(AuthRequest request) {
        String email = request.getEmail().trim().toLowerCase();
        String password = request.getPassword();

        // §3.3 #6: Strong password policy
        validatePasswordStrength(password);

        if (userRepository.existsByEmail(email)) {
            throw new IllegalArgumentException("Email already registered");
        }

        // §3.1 #4: Admin role via ADMIN_EMAIL env or first-user fallback
        String role = "user";
        if (adminEmail != null && !adminEmail.isBlank()) {
            if (email.equalsIgnoreCase(adminEmail.trim())) {
                role = "admin";
            }
        } else {
            // Legacy fallback: first registered user becomes admin
            if (userRepository.count() == 0) {
                role = "admin";
                log.warn("First user auto-admin — set ADMIN_EMAIL env var for explicit control");
                logRepository.save(new SystemLog("warn",
                        "First user auto-admin", Map.of("email", email)));
            }
        }

        String hashedPassword = passwordEncoder.encode(password);
        User user = new User(email, hashedPassword, role);
        user = userRepository.save(user);

        String token = jwtUtil.generateToken(user.getId(), user.getEmail(), user.getRole());
        return new AuthResponse(token, Map.of(
                "id", user.getId(),
                "email", user.getEmail(),
                "role", user.getRole()));
    }

    /**
     * Login with account lockout protection.
     */
    public AuthResponse login(AuthRequest request) {
        String email = request.getEmail().trim().toLowerCase();
        String password = request.getPassword();

        // §3.3 #5: Check lockout
        checkLockout(email);

        User user = userRepository.findByEmail(email)
                .orElse(null);

        if (user == null) {
            recordFailedLogin(email);
            throw new IllegalArgumentException("Invalid email or password");
        }

        if (!passwordEncoder.matches(password, user.getPassword())) {
            recordFailedLogin(email);
            throw new IllegalArgumentException("Invalid email or password");
        }

        // Success — clear lockout
        loginAttempts.remove(email);

        String token = jwtUtil.generateToken(user.getId(), user.getEmail(), user.getRole());
        return new AuthResponse(token, Map.of(
                "id", user.getId(),
                "email", user.getEmail(),
                "role", user.getRole()));
    }

    // ── Password Policy ──────────────────────────────────────────────

    private void validatePasswordStrength(String password) {
        if (password == null || password.length() < 8) {
            throw new IllegalArgumentException("Password must be at least 8 characters");
        }
        if (!password.matches(".*[a-z].*")) {
            throw new IllegalArgumentException("Password must contain at least one lowercase letter");
        }
        if (!password.matches(".*[A-Z].*")) {
            throw new IllegalArgumentException("Password must contain at least one uppercase letter");
        }
        if (!password.matches(".*[0-9].*")) {
            throw new IllegalArgumentException("Password must contain at least one number");
        }
    }

    // ── Account Lockout ──────────────────────────────────────────────

    private void checkLockout(String email) {
        LoginAttempt attempt = loginAttempts.get(email);
        if (attempt != null && attempt.lockedUntil() > 0) {
            if (System.currentTimeMillis() < attempt.lockedUntil()) {
                // Return same error to avoid enumeration
                throw new IllegalArgumentException("Invalid email or password");
            } else {
                // Lockout expired
                loginAttempts.remove(email);
            }
        }
    }

    private void recordFailedLogin(String email) {
        loginAttempts.compute(email, (k, existing) -> {
            int count = (existing != null ? existing.count() : 0) + 1;
            long lockedUntil = 0;
            if (count >= MAX_ATTEMPTS) {
                lockedUntil = System.currentTimeMillis() + LOCKOUT_MS;
                log.warn("Account locked: {} (failed {} times)", email, count);
                logRepository.save(new SystemLog("warn",
                        "Account locked due to failed login attempts",
                        Map.of("email", email, "lockoutMinutes", 15)));
            }
            return new LoginAttempt(count, lockedUntil);
        });
    }
}
