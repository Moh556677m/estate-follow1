import React from 'react';
import { Navigate } from 'react-router-dom';
import { useEditorAuth } from '@/contexts/EditorAuthContext';

const EditorRoute = ({ children }) => {
  const { isEditorAuthed, bootstrapped } = useEditorAuth();

  if (bootstrapped === false) {
    return (
      <div className="flex min-h-[100svh] items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isEditorAuthed) return <Navigate to="/editor/login" replace />;

  return children;
};

export default EditorRoute;
