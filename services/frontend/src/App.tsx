import {
  Suspense,
  lazy,
  useEffect,
  useState,
  type ComponentType,
  type LazyExoticComponent,
} from "react";
import BuilderScreen from "./screens/builder/BuilderScreen";
import NumbersScreen from "./screens/numbers/NumbersScreen";

let SpikePage: LazyExoticComponent<ComponentType> | null = null;
if (import.meta.env.DEV) {
  SpikePage = lazy(() => import("./spike/SpikePage"));
}

const FLOW_ROUTE = /^#\/flows\/([^/]+)$/;

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
  const flowMatch = FLOW_ROUTE.exec(hash);
  const flowId = flowMatch ? flowMatch[1] : null;
  return (
    <main>
      {flowId !== null ? (
        <BuilderScreen key={flowId} flowId={flowId} />
      ) : SpikePage !== null && hash === "#/spike" ? (
        <Suspense fallback={null}>
          <SpikePage />
        </Suspense>
      ) : (
        // Mọi hash khác (kể cả rỗng và hash lạ) rơi về màn quản lý đầu số —
        // trang mặc định của lô 5.
        <NumbersScreen />
      )}
    </main>
  );
}
