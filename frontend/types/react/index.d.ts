declare module "react" {
  export type ReactNode = any;
  export interface SVGProps<T = any> {
    [key: string]: any;
  }
  export interface ComponentType<P = {}> {
    (props: P & { children?: ReactNode }): ReactNode;
  }

  export interface FC<P = {}> {
    (props: P & { children?: ReactNode }): ReactNode | null;
  }

  export const Fragment: unique symbol;

  export function useState<T>(initial: T | (() => T)): [T, (value: T | ((prev: T) => T)) => void];
  export function useEffect(effect: () => void | (() => void), deps?: ReadonlyArray<unknown>): void;
  export function useMemo<T>(factory: () => T, deps?: ReadonlyArray<unknown>): T;
  export function useCallback<T extends (...args: any[]) => any>(fn: T, deps?: ReadonlyArray<unknown>): T;

  const React: {
    ComponentType: ComponentType<any>;
    StrictMode: any;
  };

  export default React;
}

declare namespace JSX {
  interface IntrinsicAttributes {
    key?: any;
  }
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}

declare module "react/jsx-runtime" {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
}
