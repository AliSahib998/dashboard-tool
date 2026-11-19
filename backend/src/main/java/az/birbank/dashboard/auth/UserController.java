package az.birbank.dashboard.auth;

import az.birbank.dashboard.common.BadRequestException;
import az.birbank.dashboard.common.NotFoundException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;

@RestController
@RequestMapping("/api/users")
@PreAuthorize("hasRole('ADMIN')")
public class UserController {

    private final AppUserRepository users;
    private final PasswordEncoder encoder;

    public UserController(AppUserRepository users, PasswordEncoder encoder) {
        this.users = users;
        this.encoder = encoder;
    }

    public record UserDto(Long id, String email, String fullName, Role role, boolean active, Instant createdAt) {
        static UserDto of(AppUser u) {
            return new UserDto(u.getId(), u.getEmail(), u.getFullName(), u.getRole(), u.isActive(), u.getCreatedAt());
        }
    }

    public record CreateUser(@NotBlank @Email String email, @NotBlank String fullName,
                             @NotBlank @Size(min = 8) String password, @NotNull Role role) {}

    public record UpdateUser(@NotBlank String fullName, @NotNull Role role, boolean active,
                             @Size(min = 8) String password) {}

    @GetMapping
    public List<UserDto> list() {
        return users.findAll().stream().map(UserDto::of).toList();
    }

    @PostMapping
    @Transactional
    public UserDto create(@Valid @RequestBody CreateUser body) {
        if (users.findByEmailIgnoreCase(body.email()).isPresent()) {
            throw new BadRequestException("A user with this email already exists");
        }
        AppUser u = new AppUser();
        u.setEmail(body.email().toLowerCase());
        u.setFullName(body.fullName());
        u.setPasswordHash(encoder.encode(body.password()));
        u.setRole(body.role());
        return UserDto.of(users.save(u));
    }

    @PutMapping("/{id}")
    @Transactional
    public UserDto update(@PathVariable Long id, @Valid @RequestBody UpdateUser body,
                          @AuthenticationPrincipal UserPrincipal me) {
        AppUser u = users.findById(id).orElseThrow(() -> new NotFoundException("User", id));
        if (u.getId().equals(me.id()) && (body.role() != Role.ADMIN || !body.active())) {
            throw new BadRequestException("You cannot remove your own admin access");
        }
        u.setFullName(body.fullName());
        u.setRole(body.role());
        u.setActive(body.active());
        if (body.password() != null && !body.password().isBlank()) {
            u.setPasswordHash(encoder.encode(body.password()));
        }
        return UserDto.of(u);
    }
}
