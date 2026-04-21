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
