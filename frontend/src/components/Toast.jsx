import { createContext, useContext, useState, useCallback, useRef } from 'react';

const Ctx = createContext(() => {});

export function useToast() { return useContext(Ctx); }

export default function ToastProvider({ children }) {
  const [msg, setMsg] = useState('');
  const [show, setShow] = useState(false);
  const timer = useRef(null);

  const toast = useCallback((text) => {
    clearTimeout(timer.current);
    setMsg(text);
    setShow(true);
    timer.current = setTimeout(() => setShow(false), 2800);
  }, []);

  return (
    <Ctx.Provider value={toast}>
      {children}
      <div className={`toast${show ? ' show' : ''}`}>{msg}</div>
    </Ctx.Provider>
  );
}
