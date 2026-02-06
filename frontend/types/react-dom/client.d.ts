declare module "react-dom/client" {
  export function createRoot(container: HTMLElement): {
    render(node: any): void;
  };
}
