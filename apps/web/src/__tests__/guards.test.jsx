import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// This project has no global testing-library setup file (no auto-cleanup
// between tests) — without this, DOM from an earlier render() in this file
// stays mounted and a later getByText() sees duplicate matches.
afterEach(() => cleanup());

// Regression guards for route protection. Estate Follow is a public-browsing
// site: an anonymous visitor must be able to see public pages with no login
// wall, and only /dashboard/* (owner) and /admin/* (staff) are gated — the
// two guards must stay completely independent (a regular owner account must
// never pass StaffRoute; a signed-in-but-not-staff account is sent to their
// own dashboard, not to login). See ProtectedRoute.jsx / StaffRoute.jsx.

const mockUseAuth = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/lib/pocketbaseClient', () => ({
  default: { authStore: { isValid: false, record: null } },
}));

import ProtectedRoute from '@/components/ProtectedRoute';
import StaffRoute from '@/components/StaffRoute';
import pb from '@/lib/pocketbaseClient';

function renderWithRouter(ui) {
  return render(<MemoryRouter initialEntries={['/dashboard']}>{ui}</MemoryRouter>);
}

describe('ProtectedRoute (public browsing / sensitive-action gating)', () => {
  it('shows a loader, not the login redirect, while bootstrapping', () => {
    mockUseAuth.mockReturnValue({ isAuthed: false, bootstrapped: false });
    pb.authStore.isValid = false;
    const { container } = renderWithRouter(
      <ProtectedRoute>
        <div>secret</div>
      </ProtectedRoute>,
    );
    expect(screen.queryByText('secret')).toBeNull();
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders the gated content once authed and bootstrapped', () => {
    mockUseAuth.mockReturnValue({ isAuthed: true, bootstrapped: true });
    pb.authStore.isValid = true;
    renderWithRouter(
      <ProtectedRoute>
        <div>secret</div>
      </ProtectedRoute>,
    );
    expect(screen.getByText('secret')).toBeTruthy();
  });

  it('redirects an anonymous visitor who never had a session (no soft-recovery flash)', () => {
    mockUseAuth.mockReturnValue({ isAuthed: false, bootstrapped: true });
    pb.authStore.isValid = false;
    renderWithRouter(
      <ProtectedRoute>
        <div>secret</div>
      </ProtectedRoute>,
    );
    expect(screen.queryByText('secret')).toBeNull();
  });
});

describe('StaffRoute (admin guard is fully independent of ProtectedRoute)', () => {
  it('sends an anonymous visitor to /admin/login, never /login', () => {
    mockUseAuth.mockReturnValue({ user: null, isAuthed: false, bootstrapped: true });
    renderWithRouter(
      <StaffRoute>
        <div>admin only</div>
      </StaffRoute>,
    );
    expect(screen.queryByText('admin only')).toBeNull();
  });

  it('sends a signed-in regular owner back to /dashboard, not to login (never treated as unauthenticated)', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u1', role: 'owner', is_super_admin: false },
      isAuthed: true,
      bootstrapped: true,
    });
    renderWithRouter(
      <StaffRoute>
        <div>admin only</div>
      </StaffRoute>,
    );
    expect(screen.queryByText('admin only')).toBeNull();
  });

  it('renders admin content for a real staff account', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'a1', role: 'admin', is_super_admin: false },
      isAuthed: true,
      bootstrapped: true,
    });
    renderWithRouter(
      <StaffRoute>
        <div>admin only</div>
      </StaffRoute>,
    );
    expect(screen.getByText('admin only')).toBeTruthy();
  });

  it('renders admin content for the super admin even without an explicit staff role', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 's1', role: 'owner', is_super_admin: true },
      isAuthed: true,
      bootstrapped: true,
    });
    renderWithRouter(
      <StaffRoute>
        <div>admin only</div>
      </StaffRoute>,
    );
    expect(screen.getByText('admin only')).toBeTruthy();
  });
});
