import React, { useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import pb from '@/lib/pocketbaseClient';

const ProtectedRoute = ({ children, redirectTo = '/login' }) => {
  const { isAuthed, bootstrapped } = useAuth();
  // Once the user has been authenticated in this tab, do not bounce them to
  // login on a brief auth-store flicker (token refresh / heartbeat).
  const hadAuthRef = useRef(!!(isAuthed || pb.authStore.isValid));

  if (isAuthed || pb.authStore.isValid) {
    hadAuthRef.current = true;
  }

  // Wait for token refresh / session check so a valid refresh never flashes login.
  if (bootstrapped === false) {
    return (
      <div className="flex min-h-[100svh] items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const live = !!(isAuthed || pb.authStore.isValid);
  if (!live) {
    // Soft recovery window: if we previously had a session and the store is
    // only momentarily empty, keep the tree mounted so open forms are not
    // unmounted / redirected to home or login.
    if (hadAuthRef.current) {
      return children;
    }
    return <Navigate to={redirectTo} replace />;
  }

  return children;
};

export default ProtectedRoute;

export { ProtectedRoute };
