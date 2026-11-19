package az.birbank.dashboard.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthenticationManager authenticationManager;
    private final SecurityContextRepository contextRepository;

    public AuthController(AuthenticationManager authenticationManager, SecurityContextRepository contextRepository) {
        this.authenticationManager = authenticationManager;
        this.contextRepository = contextRepository;
    }

    public record LoginRequest(@NotBlank String email, @NotBlank String password) {}

    public record Me(Long id, String email, String fullName, Role role) {
        static Me of(UserPrincipal p) {
            return new Me(p.id(), p.email(), p.fullName(), p.role());
        }
    }

    /** Touching the token makes Spring Security write the XSRF-TOKEN cookie. */
    @GetMapping("/csrf")
    public void csrf(CsrfToken token) {
        token.getToken();
    }

    @PostMapping("/login")
    public Me login(@Valid @RequestBody LoginRequest body, HttpServletRequest request, HttpServletResponse response) {
        Authentication auth = authenticationManager.authenticate(
            UsernamePasswordAuthenticationToken.unauthenticated(body.email(), body.password()));
        // Prevent session fixation: drop any pre-login session before storing the authenticated context.
        if (request.getSession(false) != null) {
            request.changeSessionId();
        }
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(auth);
        SecurityContextHolder.setContext(context);
        contextRepository.saveContext(context, request, response);
        return Me.of((UserPrincipal) auth.getPrincipal());
    }

    @GetMapping("/me")
    public Me me(@AuthenticationPrincipal UserPrincipal principal) {
        return Me.of(principal);
    }
}
