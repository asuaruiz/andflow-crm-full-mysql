// apps/frontend/src/router/index.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const RouterContext = createContext({ path: "/", navigate: () => {} });

export function Router({ children, defaultPath = "/inventario/maestra" }) {
  const getPath = () =>
    (window.location.hash ? window.location.hash.slice(1) : defaultPath);
  const [path, setPath] = useState(getPath);

  useEffect(() => {
    const onHash = () => setPath(getPath());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = (to) => {
    if (!to) return;
    if (to === path) return;
    window.location.hash = to;
    setPath(to);
    try { localStorage.setItem("andflow:lastRoute", to); } catch {}
  };

  useEffect(() => {
    if (!window.location.hash) {
      try {
        const last = localStorage.getItem("andflow:lastRoute");
        if (last) navigate(last);
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(() => ({ path, navigate }), [path]);
  return (
    <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
  );
}

export function useRoute() {
  return useContext(RouterContext);
}

export function Link({ to, children, className = "", activeClassName = "", ...props }) {
  const { path, navigate } = useRoute();
  const isActive = path === to || (to !== "/" && path.startsWith(to));
  const cls = className + (isActive && activeClassName ? ` ${activeClassName}` : "");
  const onClick = (e) => { e.preventDefault(); navigate(to); };
  return (
    <a href={`#${to}`} onClick={onClick} className={cls} {...props}>
      {children}
    </a>
  );
}
