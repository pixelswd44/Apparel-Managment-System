import { createContext, useContext, useState, useCallback } from 'react';

const DirtyContext = createContext({ isDirty: false, setDirty: () => {} });

export function DirtyProvider({ children }) {
  const [isDirty, setDirtyState] = useState(false);
  const setDirty = useCallback((v) => setDirtyState(Boolean(v)), []);
  return (
    <DirtyContext.Provider value={{ isDirty, setDirty }}>
      {children}
    </DirtyContext.Provider>
  );
}

export function useDirty() {
  return useContext(DirtyContext);
}
