import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import editorClient from '@/lib/editorClient';

const EditorAuthContext = createContext(null);

export const EditorAuthProvider = ({ children }) => {
  const [editor, setEditor] = useState(editorClient.authStore.record);
  const [bootstrapped, setBootstrapped] = useState(!editorClient.authStore.isValid);

  useEffect(() => editorClient.authStore.onChange((_t, rec) => setEditor(rec)), []);

  useEffect(() => {
    if (!editorClient.authStore.isValid) {
      setBootstrapped(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await editorClient.collection('editors').authRefresh({
          requestKey: `editor-boot-${Date.now()}`,
        });
        if (!cancelled) setEditor(res?.record || editorClient.authStore.record);
      } catch {
        if (!editorClient.authStore.isValid) setEditor(null);
      } finally {
        if (!cancelled) setBootstrapped(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const value = useMemo(
    () => ({
      editor,
      isEditorAuthed: !!(editor && editorClient.authStore.isValid && editor.active !== false),
      bootstrapped,
      editorClient,
      login: async (email, password) => {
        const res = await editorClient.collection('editors').authWithPassword(email, password, {
          requestKey: `editor-login-${Date.now()}`,
        });
        const rec = res?.record;
        if (rec && rec.active === false) {
          editorClient.authStore.clear();
          setEditor(null);
          throw new Error('ACCOUNT_INACTIVE');
        }
        setEditor(rec);
        return res;
      },
      logout: () => {
        editorClient.authStore.clear();
        setEditor(null);
      },
    }),
    [editor, bootstrapped],
  );

  return <EditorAuthContext.Provider value={value}>{children}</EditorAuthContext.Provider>;
};

export const useEditorAuth = () => useContext(EditorAuthContext);

export default EditorAuthContext;
