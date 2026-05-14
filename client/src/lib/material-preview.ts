export interface PptxSlidePreview {
  slideNumber: number;
  title: string;
  lines: string[];
  imageDataUrl?: string;
}

const IMAGE_REL_TYPE_SUFFIX = '/relationships/image';

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

const getFileExtension = (value: string): string => {
  const normalized = value.split('?')[0].split('#')[0];
  const segment = normalized.split('/').pop() || '';
  const dotIndex = segment.lastIndexOf('.');
  if (dotIndex === -1) {
    return '';
  }

  return segment.slice(dotIndex + 1).toLowerCase();
};

const normalizeZipPath = (basePath: string, target: string): string => {
  const sanitizedTarget = target.replace(/\\/g, '/').trim();
  if (!sanitizedTarget) {
    return '';
  }

  if (sanitizedTarget.startsWith('/')) {
    return sanitizedTarget.replace(/^\/+/, '');
  }

  const baseSegments = basePath.replace(/\\/g, '/').split('/').filter(Boolean);
  baseSegments.pop();

  for (const segment of sanitizedTarget.split('/')) {
    if (!segment || segment === '.') {
      continue;
    }

    if (segment === '..') {
      baseSegments.pop();
      continue;
    }

    baseSegments.push(segment);
  }

  return baseSegments.join('/');
};

const parseXml = (xml: string): Document => {
  const parser = new DOMParser();
  return parser.parseFromString(xml, 'application/xml');
};

const readZipText = async (
  zip: { file: (path: string) => { async: (type: 'text') => Promise<string> } | null },
  path: string
): Promise<string | null> => {
  const file = zip.file(path);
  if (!file) {
    return null;
  }

  return file.async('text');
};

const readZipBase64 = async (
  zip: { file: (path: string) => { async: (type: 'base64') => Promise<string> } | null },
  path: string
): Promise<string | null> => {
  const file = zip.file(path);
  if (!file) {
    return null;
  }

  return file.async('base64');
};

const getRelationshipMap = (relsXml: string): Map<string, string> => {
  const relsDoc = parseXml(relsXml);
  const relationshipNodes = Array.from(relsDoc.getElementsByTagName('Relationship'));
  const relationshipMap = new Map<string, string>();

  for (const node of relationshipNodes) {
    const id = node.getAttribute('Id');
    const target = node.getAttribute('Target');

    if (!id || !target) {
      continue;
    }

    relationshipMap.set(id, target);
  }

  return relationshipMap;
};

const getSlideRelationshipIds = (presentationXml: string): string[] => {
  const presentationDoc = parseXml(presentationXml);
  const nodes = Array.from(presentationDoc.getElementsByTagName('p:sldId'));
  const fallbackNodes = nodes.length === 0
    ? Array.from(presentationDoc.getElementsByTagName('sldId'))
    : nodes;

  return fallbackNodes
    .map((node) => node.getAttribute('r:id'))
    .filter((value): value is string => Boolean(value));
};

const extractSlideTextLines = (slideXml: string): string[] => {
  const slideDoc = parseXml(slideXml);
  const textNodes = Array.from(slideDoc.getElementsByTagName('a:t'));
  const fallbackNodes = textNodes.length === 0
    ? Array.from(slideDoc.getElementsByTagName('t'))
    : textNodes;

  const lines: string[] = [];
  for (const node of fallbackNodes) {
    const text = (node.textContent || '').trim();
    if (text) {
      lines.push(text);
    }
  }

  return lines;
};

const buildImageDataUrl = (path: string, base64: string): string => {
  const extension = getFileExtension(path);
  const mimeType = MIME_BY_EXTENSION[extension] || 'application/octet-stream';
  return `data:${mimeType};base64,${base64}`;
};

// Simple mammoth-based single-page HTML conversion used by the teacher
// MaterialPreviewDialog (non-paginated scroll view).
export const convertDocxToHtml = async (url: string): Promise<string> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch DOCX document');
  }

  const arrayBuffer = await response.arrayBuffer();
  const mammothModule: any = await import('mammoth');
  const result = await mammothModule.convertToHtml({ arrayBuffer });

  return String(result?.value || '');
};

// Renders a DOCX to an array of page HTML strings using docx-preview, then
// paginates each rendered <section.docx> by measuring child heights against
// the section's content-area height. docx-preview's breakPages only honors
// EXPLICIT w:br page breaks; most natural Word docs (3-page A4 by overflow)
// have none, so without this measurement step we'd get one giant page.
export const renderDocxToPages = async (url: string): Promise<string[]> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch DOCX document');
  }

  const arrayBuffer = await response.arrayBuffer();
  const { renderAsync } = await import('docx-preview');

  // Off-screen but laid out so getBoundingClientRect measurements are
  // accurate. We give the host an EXPLICIT width wider than any standard
  // page (25cm > A4's 21cm > Letter's 21.59cm) so docx-preview's flex
  // wrapper doesn't shrink-to-fit and squeeze the section narrower than
  // its inline `width: 21cm`. A squeezed section forces extra line wraps,
  // inflating each block's measured height and flushing pages too early.
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-99999px';
  host.style.top = '0';
  host.style.width = '25cm';
  host.style.visibility = 'hidden';
  host.style.pointerEvents = 'none';
  document.body.appendChild(host);

  try {
    await renderAsync(arrayBuffer, host, undefined, {
      className: 'docx',
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      breakPages: true,
      useBase64URL: true,
    });

    // Wait for fonts before measuring. If we paginate against the system
    // fallback font and the displayed reader uses a different (loaded)
    // font, paragraphs render at a different height than measured — which
    // is exactly how the white A4 sheet ended up half-empty.
    if (document.fonts && typeof document.fonts.ready?.then === 'function') {
      await document.fonts.ready;
    }

    const sections = Array.from(host.querySelectorAll<HTMLElement>('section.docx'));
    if (sections.length === 0) {
      return [host.innerHTML];
    }

    const pages: string[] = [];
    for (const section of sections) {
      pages.push(...paginateDocxSection(section));
    }

    return pages.length > 0 ? pages : sections.map((s) => s.outerHTML);
  } finally {
    document.body.removeChild(host);
  }
};

// A4 portrait at 96dpi: 297mm × (96 / 25.4) ≈ 1122.52px. Used as the page
// height fallback when neither inline nor computed styles expose a usable
// value — without it, the paginator would treat the entire section as one
// page (see comment below for why).
const A4_HEIGHT_PX = 1122.52;

// Splits a single rendered <section.docx> into one or more page-sized chunks
// by walking its block-level content top-to-bottom and accumulating heights.
// Returns serialized outerHTML strings — each is a clone of the section with
// the same inline styles + class, holding only that page's blocks.
//
// IMPORTANT: docx-preview wraps the section's flow content in an <article>:
//   <section class="docx" style="min-height: 29.7cm; ...">
//     <article>
//       <p>...</p> <p>...</p> ...
//     </article>
//   </section>
// Iterating section.children directly therefore yields ONE element (the
// article), whose offsetHeight is the entire document's rendered height. The
// overflow check (bufferHeight + childHeight > contentAreaHeight) never
// fires because bufferHeight starts at 0, so the whole document collapses to
// a single "page" — exactly the bug we're paid to fix. We descend into the
// article to reach the real paragraphs, headings, tables, etc.
const paginateDocxSection = (section: HTMLElement): string[] => {
  const computed = window.getComputedStyle(section);

  // Page height detection: try inline first (docx-preview sets `min-height`
  // there from <w:pgSz>), then computed, then A4. The previous code used
  // `parseFloat(computed.minHeight) || section.offsetHeight` — but
  // section.offsetHeight equals the FULL content height when content
  // overflows the page-sized min-height, which made contentAreaHeight ≈
  // total content height and produced one page. The A4 fallback removes
  // that footgun.
  const parsePx = (...values: string[]): number => {
    for (const v of values) {
      if (!v || v === 'auto') continue;
      const n = parseFloat(v);
      if (n > 100) return n;
    }
    return 0;
  };

  const pageHeight =
    parsePx(section.style.minHeight, computed.minHeight) ||
    parsePx(section.style.height, computed.height) ||
    A4_HEIGHT_PX;

  const paddingTop = parseFloat(computed.paddingTop) || 0;
  const paddingBottom = parseFloat(computed.paddingBottom) || 0;
  const contentAreaHeight = Math.max(100, pageHeight - paddingTop - paddingBottom);

  const directChildren = Array.from(section.children) as HTMLElement[];
  const article = directChildren.find((c) => c.tagName === 'ARTICLE') ?? null;
  const blocks = article
    ? (Array.from(article.children) as HTMLElement[])
    : directChildren;

  if (blocks.length === 0) {
    return [section.outerHTML];
  }

  const flushedPages: string[] = [];
  let buffer: HTMLElement[] = [];
  let anchorTop: number | null = null;

  // When flushing, preserve the original order of direct children (e.g.
  // <header>, <article>, <footer>). Non-article siblings appear on every
  // page; only the article's children are partitioned.
  const flushBuffer = () => {
    if (buffer.length === 0) return;
    const sectionClone = section.cloneNode(false) as HTMLElement;

    if (article) {
      for (const child of directChildren) {
        if (child === article) {
          const articleClone = article.cloneNode(false) as HTMLElement;
          for (const block of buffer) {
            articleClone.appendChild(block.cloneNode(true));
          }
          sectionClone.appendChild(articleClone);
        } else {
          sectionClone.appendChild(child.cloneNode(true));
        }
      }
    } else {
      for (const block of buffer) {
        sectionClone.appendChild(block.cloneNode(true));
      }
    }

    flushedPages.push(sectionClone.outerHTML);
    buffer = [];
    anchorTop = null;
  };

  // Position-based pagination. Anchor on the first block's `top`, then
  // for each subsequent block check if its `bottom` would exceed
  // `anchor + contentAreaHeight`. Using real bounding-rect positions (not
  // summed offsetHeight + margins) is what makes pages fill: CSS margins
  // collapse between adjacent blocks, so the SUM of margins overcounts
  // the actual rendered height by 30-50% — flushing pages half-empty.
  for (const block of blocks) {
    const rect = block.getBoundingClientRect();
    if (anchorTop === null) {
      anchorTop = rect.top;
      buffer.push(block);
      continue;
    }
    const usedHeight = rect.bottom - anchorTop;
    if (usedHeight > contentAreaHeight && buffer.length > 0) {
      flushBuffer();
      anchorTop = rect.top;
    }
    buffer.push(block);
  }

  flushBuffer();

  return flushedPages.length > 0 ? flushedPages : [section.outerHTML];
};

export const convertPptxToSlides = async (url: string): Promise<PptxSlidePreview[]> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch PPTX file');
  }

  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(await response.arrayBuffer());

  const presentationPath = 'ppt/presentation.xml';
  const presentationRelsPath = 'ppt/_rels/presentation.xml.rels';
  const presentationXml = await readZipText(zip, presentationPath);
  const presentationRelsXml = await readZipText(zip, presentationRelsPath);

  if (!presentationXml || !presentationRelsXml) {
    throw new Error('PPTX package is missing presentation metadata');
  }

  const relationshipMap = getRelationshipMap(presentationRelsXml);
  const slideIds = getSlideRelationshipIds(presentationXml);

  const slidePaths = slideIds
    .map((id) => relationshipMap.get(id))
    .filter((value): value is string => Boolean(value))
    .map((target) => normalizeZipPath(presentationPath, target));

  if (slidePaths.length === 0) {
    const inferredSlidePaths = Object.keys(zip.files)
      .filter((key) => /^ppt\/slides\/slide\d+\.xml$/i.test(key))
      .sort((a, b) => {
        const getNumber = (value: string) => Number(value.match(/slide(\d+)\.xml/i)?.[1] || '0');
        return getNumber(a) - getNumber(b);
      });

    slidePaths.push(...inferredSlidePaths);
  }

  const slides: PptxSlidePreview[] = [];

  for (let index = 0; index < slidePaths.length; index += 1) {
    const slidePath = slidePaths[index];
    const slideXml = await readZipText(zip, slidePath);

    if (!slideXml) {
      continue;
    }

    const lines = extractSlideTextLines(slideXml);
    const title = lines[0] || `Slide ${index + 1}`;

    const slideRelsPath = slidePath.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels';
    const slideRelsXml = await readZipText(zip, slideRelsPath);

    let imageDataUrl: string | undefined;
    if (slideRelsXml) {
      const relsDoc = parseXml(slideRelsXml);
      const relationshipNodes = Array.from(relsDoc.getElementsByTagName('Relationship'));
      const imageRelationship = relationshipNodes.find((node) => {
        const type = node.getAttribute('Type') || '';
        return type.endsWith(IMAGE_REL_TYPE_SUFFIX);
      });

      const imageTarget = imageRelationship?.getAttribute('Target');
      if (imageTarget) {
        const imagePath = normalizeZipPath(slideRelsPath, imageTarget);
        const imageBase64 = await readZipBase64(zip, imagePath);
        if (imageBase64) {
          imageDataUrl = buildImageDataUrl(imagePath, imageBase64);
        }
      }
    }

    slides.push({
      slideNumber: index + 1,
      title,
      lines,
      imageDataUrl,
    });
  }

  return slides;
};
