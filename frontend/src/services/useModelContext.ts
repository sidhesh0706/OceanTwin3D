import { useEffect, useRef } from 'react';
// Optional read-only browser agent interface. No network or settings mutations.
type ContextDocument = Document & {
  modelContext?: {
    registerTool: (
      tool: {
        name: string;
        description: string;
        inputSchema: object;
        annotations: object;
        execute: (input: unknown) => unknown;
      },
      options: { signal: AbortSignal },
    ) => void | Promise<void>;
  };
};
export function useModelContext(state: unknown) {
  const current = useRef(state);
  current.current = state;
  useEffect(() => {
    const context = (document as ContextDocument).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: 'read_ocean_view',
            description:
              'Read the currently rendered OceanTwin dataset, variable, depth, model time, mode and sensor selection. Does not modify the viewer.',
            inputSchema: { type: 'object', properties: {}, additionalProperties: false },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute(input) {
              if (
                input === null ||
                typeof input !== 'object' ||
                Array.isArray(input) ||
                Object.keys(input).length
              )
                throw new Error('Expected an empty object.');
              return current.current;
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {
      /* Browsers without the proposed API keep the standard UI. */
    }
    return () => lifecycle.abort();
  }, []);
}
