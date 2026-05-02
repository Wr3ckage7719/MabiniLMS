// Lazy-load pdfjs and configure the worker once. The worker is shipped via the
// pdfjs-dist package, served from the bundler as a URL.
type PdfModule = typeof import('pdfjs-dist');

let pdfModulePromise: Promise<PdfModule> | null = null;

const loadPdfModule = (): Promise<PdfModule> => {
  if (!pdfModulePromise) {
    pdfModulePromise = (async () => {
      const pdfjs = (await import('pdfjs-dist')) as PdfModule;
      // Vite/Rollup understands ?url to import the worker as a URL.
      const workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      (pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = workerSrc;
      return pdfjs;
    })();
  }
  return pdfModulePromise;
};

export interface PdfDocumentHandle {
  numPages: number;
  renderPage: (pageNumber: number, canvas: HTMLCanvasElement, scale?: number) => Promise<void>;
  destroy: () => Promise<void>;
}

export const openPdf = async (url: string): Promise<PdfDocumentHandle> => {
  const pdfjs = await loadPdfModule();
  const loadingTask = (pdfjs as unknown as {
    getDocument: (params: { url: string }) => { promise: Promise<unknown> };
  }).getDocument({ url });

  const pdf = (await loadingTask.promise) as {
    numPages: number;
    getPage: (n: number) => Promise<{
      getViewport: (params: { scale: number }) => { width: number; height: number };
      render: (params: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> };
    }>;
    destroy: () => Promise<void>;
  };

  return {
    numPages: pdf.numPages,
    renderPage: async (pageNumber, canvas, scale = 1.5) => {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const context = canvas.getContext('2d');
      if (!context) return;

      const dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      await page.render({ canvasContext: context, viewport }).promise;
    },
    destroy: async () => {
      await pdf.destroy();
    },
  };
};
