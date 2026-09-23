import {
  Suspense,
  lazy,
  useEffect,
  useState,
  type ComponentType,
  type LazyExoticComponent,
} from "react";

let SpikePage: LazyExoticComponent<ComponentType> | null = null;
if (import.meta.env.DEV) {
  SpikePage = lazy(() => import("./spike/SpikePage"));
}

function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  return hash;
}

export default function App() {
  const hash = useHash();
  return (
    <main>
      <h1>IVR Builder</h1>
      {SpikePage !== null && hash === "#/spike" ? (
        <Suspense fallback={null}>
          <SpikePage />
        </Suspense>
      ) : null}
    </main>
  );
}
