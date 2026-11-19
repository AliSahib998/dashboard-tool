package az.birbank.dashboard.auth;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.io.Serializable;
import java.util.Collection;
import java.util.List;

public record UserPrincipal(Long id, String email, String fullName, Role role, String passwordHash, boolean active)
        implements UserDetails, Serializable {

    static UserPrincipal of(AppUser u) {
        return new UserPrincipal(u.getId(), u.getEmail(), u.getFullName(), u.getRole(), u.getPasswordHash(), u.isActive());
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_" + role.name()));
    }

    @Override
    public String getPassword() { return passwordHash; }

    @Override
    public String getUsername() { return email; }

    @Override
    public boolean isEnabled() { return active; }
}
