import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { isStaff } from '@/lib/permissions';

/**
 * Guards Admin Portal routes. Only Super Admin and staff accounts may enter.
 * A signed-in regular user (owner/broker/company) is sent back to their
 * customer dashboard; an anonymous visitor is sent to the admin login.
 */
const StaffRoute = ({ children }) => {
  const { user, isAuthed, bootstrapped } = useAuth();

  if (bootstrapped === false) {
    return (
      <div className="flex min-h-[100svh] items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthed) return <Navigate to="/admin/login" replace />;

  if (!isStaff(user)) return <Navigate to="/dashboard" replace />;

  return children;
};

export default StaffRoute;
export { StaffRoute };
