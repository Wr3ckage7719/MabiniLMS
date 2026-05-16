export type QuizQuestionType = 'multiple_choice' | 'true_false' | 'short_answer' | 'fill_in_blank' | 'essay';

export interface QuizBuilderQuestion {
  id: string;
  serverId?: string;
  type: QuizQuestionType;
  prompt: string;
  choices: string[];
  answerKey: string;
  points?: number;
  chapterTag?: string | null;
  imageUrl?: string | null;
  explanation?: string;
}

export interface ImportedQuestionDraft {
  id: string;
  type: QuizQuestionType;
  prompt: string;
  choices: string[];
  answerKey: string;
  points: number;
  explanation: string;
  chapterTag: string | null;
}

export interface QuestionImportParseResult {
  questions: ImportedQuestionDraft[];
  skippedCount: number;
}

export const QUESTION_IMPORT_RECOMMENDED_FILE_TYPE = 'DOCX or JSON';

export const QUESTION_IMPORT_ACCEPT =
  '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.json,application/json';

export const QUESTION_IMPORT_DOCX_GUIDE =
  'DOCX format guide: Each question block starts with "Question N:" followed by field lines (Type:, Prompt:, Choices:, Answer:, Points:, Chapter:, Explanation:). Separate blocks with "---" or start a new "Question N:" header. Download the DOCX template below for a ready-to-edit example of all question types.';

export const QUIZ_QUESTION_TYPE_OPTIONS: Array<{ value: QuizQuestionType; label: string }> = [
  { value: 'multiple_choice', label: 'Multiple Choice' },
  { value: 'true_false', label: 'True or False' },
  { value: 'short_answer', label: 'Short Answer' },
  { value: 'fill_in_blank', label: 'Fill in the Blank' },
  { value: 'essay', label: 'Essay' },
];

export const createQuizDraftQuestion = (type: QuizQuestionType = 'multiple_choice'): QuizBuilderQuestion => ({
  id: Math.random().toString(36).slice(2, 11),
  type,
  prompt: '',
  choices: type === 'multiple_choice' ? ['', '', '', ''] : [],
  answerKey: type === 'true_false' ? 'true' : type === 'multiple_choice' ? 'A' : '',
});

const normalizeQuestionImportType = (value: unknown): QuizQuestionType => {
  const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
  if (normalized === 'multiple_choice' || normalized === 'mcq') return 'multiple_choice';
  if (normalized === 'true_false' || normalized === 'truefalse') return 'true_false';
  if (normalized === 'short_answer' || normalized === 'shortanswer') return 'short_answer';
  if (normalized === 'fill_in_blank' || normalized === 'fillintheblank' || normalized === 'fill_in_the_blank') return 'fill_in_blank';
  if (normalized === 'essay') return 'essay';
  return 'multiple_choice';
};

const splitInlineChoices = (value: string): string[] => {
  const source = value.trim();
  if (!source) return [];
  if (source.includes('|')) return source.split('|').map((item) => item.trim()).filter(Boolean);
  if (source.includes(';')) return source.split(';').map((item) => item.trim()).filter(Boolean);
  return [source];
};

const extractDocxText = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const { strFromU8, unzipSync } = await import('fflate');

  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(new Uint8Array(arrayBuffer));
  } catch {
    throw new Error('Unable to read DOCX file. Please ensure the file is a valid .docx document.');
  }

  const documentXml = archive['word/document.xml'];
  if (!documentXml) throw new Error('Invalid DOCX format. Could not find document content.');

  const xmlText = strFromU8(documentXml);
  const xmlDocument = new DOMParser().parseFromString(xmlText, 'application/xml');

  if (xmlDocument.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Unable to parse DOCX content.');
  }

  const paragraphs = Array.from(xmlDocument.getElementsByTagName('w:p'))
    .map((paragraphNode) => {
      const textParts = Array.from(paragraphNode.getElementsByTagName('w:t')).map((textNode) => textNode.textContent ?? '');
      return textParts.join('').trim();
    })
    .filter(Boolean);

  const combinedText = paragraphs.join('\n').trim();
  if (!combinedText) throw new Error('DOCX file is empty or has no readable question content.');
  return combinedText;
};

const parseDocxQuestionCandidates = (rawText: string): Array<Record<string, unknown>> => {
  const lines = rawText.replace(/\r/g, '').split('\n').map((line) => line.trim());
  const blocks: string[][] = [];
  let currentBlock: string[] = [];

  const pushBlock = () => {
    if (currentBlock.some((line) => line.length > 0)) blocks.push(currentBlock);
    currentBlock = [];
  };

  lines.forEach((line) => {
    if (!line || /^[-*_]{3,}$/.test(line)) { pushBlock(); return; }
    const questionHeaderMatch = line.match(/^question\s+\d+\s*[:.)-]?\s*(.*)$/i);
    if (questionHeaderMatch) {
      pushBlock();
      const inlinePrompt = questionHeaderMatch[1]?.trim();
      if (inlinePrompt) currentBlock.push(`Prompt: ${inlinePrompt}`);
      return;
    }
    currentBlock.push(line);
  });
  pushBlock();

  return blocks.map((block) => {
    const row: Record<string, unknown> = {};
    const extractedChoices: string[] = [];
    let collectingChoices = false;

    block.forEach((line) => {
      const keyValueMatch = line.match(/^([A-Za-z][A-Za-z _-]{0,30})\s*:\s*(.*)$/);
      if (keyValueMatch) {
        const key = keyValueMatch[1].trim().toLowerCase().replace(/\s+/g, '_');
        const value = keyValueMatch[2].trim();
        collectingChoices = false;

        if (key === 'type') { row.type = value; return; }
        if (key === 'prompt' || key === 'question' || key === 'q') { row.prompt = value; return; }
        if (key === 'choices' || key === 'options') { collectingChoices = true; extractedChoices.push(...splitInlineChoices(value)); return; }
        if (key === 'answer' || key === 'answer_key' || key === 'a' || key === 'correct_answer') { row.answer = value; return; }
        if (key === 'accepted_answers') { row.accepted_answers = value.split('|').map((item) => item.trim()).filter(Boolean); return; }
        if (key === 'points' || key === 'score') { row.points = Number(value); return; }
        if (key === 'chapter' || key === 'chapter_tag' || key === 'category' || key === 'tag') { row.chapter_tag = value; return; }
        if (key === 'explanation' || key === 'rationale') { row.explanation = value; return; }
      }

      if (collectingChoices) {
        if (/^[-*•]\s+/.test(line)) { extractedChoices.push(line.replace(/^[-*•]\s+/, '').trim()); return; }
        if (/^\d+[.):-]\s+/.test(line)) { extractedChoices.push(line.replace(/^\d+[.):-]\s+/, '').trim()); return; }
        if (/^[A-Za-z][.):-]\s+/.test(line)) { extractedChoices.push(line.replace(/^[A-Za-z][.):-]\s+/, '').trim()); return; }
        collectingChoices = false;
      }

      if (!row.prompt) { row.prompt = line.replace(/^q(?:uestion)?\s*[:.-]\s*/i, '').trim(); return; }
      row.prompt = `${String(row.prompt).trim()} ${line}`.trim();
    });

    if (extractedChoices.length > 0) row.choices = extractedChoices;
    return row;
  }).filter((row) => String(row.prompt || '').trim().length > 0);
};

const toImportedQuestionDraft = (candidate: unknown): ImportedQuestionDraft | null => {
  if (!candidate || typeof candidate !== 'object') return null;
  const row = candidate as Record<string, unknown>;
  const prompt = String(row.prompt || '').trim();
  if (!prompt) return null;

  const type = normalizeQuestionImportType(row.type);
  const rawChoices = Array.isArray(row.choices) ? row.choices.map((choice) => String(choice).trim()).filter(Boolean) : [];
  const choices =
    type === 'multiple_choice' ? (rawChoices.length >= 2 ? rawChoices : ['Option A', 'Option B'])
    : type === 'true_false' ? ['True', 'False']
    : [];

  const rawAnswer = row.answer ?? row.answer_key ?? row.accepted_answers;
  const answerText = Array.isArray(rawAnswer)
    ? rawAnswer.map((value) => String(value).trim()).filter(Boolean).join('|')
    : String(rawAnswer ?? '').trim();

  const answerIndex = Number.isFinite(Number(row.answer_index)) ? Number(row.answer_index) : null;
  let answerKey = answerText;

  if (type === 'multiple_choice') {
    if (answerIndex !== null && answerIndex >= 0 && answerIndex < choices.length) {
      answerKey = choices[answerIndex];
    } else if (/^[a-d]$/i.test(answerText)) {
      const letterIndex = answerText.toUpperCase().charCodeAt(0) - 65;
      if (letterIndex >= 0 && letterIndex < choices.length) answerKey = choices[letterIndex];
    }
  }

  if (type === 'true_false') {
    const normalizedAnswer = answerText.toLowerCase();
    answerKey = normalizedAnswer === 'false' || normalizedAnswer === 'f' ? 'False' : 'True';
  }

  const parsedPoints = Number(row.points);
  const points = Number.isFinite(parsedPoints) && parsedPoints > 0 ? parsedPoints : 1;

  return {
    id: Math.random().toString(36).slice(2, 11),
    type,
    prompt,
    choices,
    answerKey,
    points,
    explanation: String(row.explanation || '').trim(),
    chapterTag: row.chapter_tag ? String(row.chapter_tag).trim() : null,
  };
};

export const parseQuestionImportFile = async (file: File): Promise<QuestionImportParseResult> => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  let candidates: unknown[] | null = null;

  if (extension === 'json') {
    const rawText = await file.text();
    let parsedContent: unknown;
    try {
      parsedContent = JSON.parse(rawText);
    } catch {
      throw new Error('Invalid JSON file. Please validate the file format and try again.');
    }
    candidates = Array.isArray(parsedContent)
      ? parsedContent
      : Array.isArray((parsedContent as { questions?: unknown[] })?.questions)
        ? ((parsedContent as { questions: unknown[] }).questions)
        : null;
    if (!candidates) throw new Error('Expected a questions array in the JSON file.');
  } else if (extension === 'docx') {
    const rawDocxText = await extractDocxText(file);
    candidates = parseDocxQuestionCandidates(rawDocxText);
    if (!candidates || candidates.length === 0) throw new Error('No question blocks were detected in the DOCX file.');
  } else {
    throw new Error('Please upload a DOCX or JSON file.');
  }

  const importedQuestions: ImportedQuestionDraft[] = [];
  let skippedCount = 0;

  candidates.forEach((candidate) => {
    const mappedQuestion = toImportedQuestionDraft(candidate);
    if (!mappedQuestion) { skippedCount += 1; return; }
    importedQuestions.push(mappedQuestion);
  });

  if (importedQuestions.length === 0) throw new Error('No valid questions were found in the import file.');
  return { questions: importedQuestions, skippedCount };
};

// ---------------------------------------------------------------------------
// DOCX template generation
// ---------------------------------------------------------------------------

const escapeXml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const makeParagraph = (text: string, bold = false): string => {
  if (!text) return '<w:p/>';
  const rpr = bold ? '<w:rPr><w:b/></w:rPr>' : '';
  return `<w:p><w:r>${rpr}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
};

const buildDocxXml = (paragraphs: string[]): string => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs.join('\n    ')}
    <w:sectPr/>
  </w:body>
</w:document>`;

const DOCX_CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const DOCX_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOCX_WORD_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;

const TEMPLATE_QUESTIONS = [
  {
    num: 1,
    lines: [
      'Type: multiple_choice',
      'Prompt: What is the capital of the Philippines?',
      'Choices: Manila | Cebu | Davao | Quezon City',
      'Answer: Manila',
      'Points: 1',
      'Chapter: Philippine Geography',
    ],
  },
  {
    num: 2,
    lines: [
      'Type: true_false',
      'Prompt: The Earth revolves around the Sun.',
      'Answer: true',
      'Points: 1',
      'Chapter: Science Basics',
    ],
  },
  {
    num: 3,
    lines: [
      'Type: short_answer',
      'Prompt: Name the process by which plants produce food using sunlight.',
      'Answer: photosynthesis | Photosynthesis',
      'Points: 2',
      'Chapter: Biology',
      'Explanation: Accept any common spelling variation.',
    ],
  },
  {
    num: 4,
    lines: [
      'Type: fill_in_blank',
      'Prompt: The capital of Japan is _____.',
      'Answer: Tokyo',
      'Points: 1',
      'Chapter: World Geography',
    ],
  },
  {
    num: 5,
    lines: [
      'Type: essay',
      'Prompt: Explain the causes and long-term effects of the Industrial Revolution.',
      'Points: 10',
      'Chapter: World History',
      'Explanation: Grade based on depth of analysis, evidence, and clarity of argument.',
    ],
  },
];

const buildTemplateParagraphs = (): string[] => {
  const paragraphs: string[] = [];

  // Header instructions
  paragraphs.push(makeParagraph('MabiniLMS Question Import Template', true));
  paragraphs.push(makeParagraph('---'));
  paragraphs.push(makeParagraph('HOW TO USE THIS TEMPLATE', true));
  paragraphs.push(makeParagraph('1. Each question block starts with "Question N:" on its own line.'));
  paragraphs.push(makeParagraph('2. Use the exact field names: Type, Prompt, Choices, Answer, Points, Chapter, Explanation.'));
  paragraphs.push(makeParagraph('3. Separate question blocks with "---" on its own line.'));
  paragraphs.push(makeParagraph('4. For Multiple Choice: list choices inline separated by | (e.g. Choice A | Choice B | Choice C).'));
  paragraphs.push(makeParagraph('5. For Short Answer / Fill in the Blank: separate multiple accepted answers with | (e.g. Tokyo | tokyo).'));
  paragraphs.push(makeParagraph('6. For Essay: no Answer field is needed — the teacher grades manually.'));
  paragraphs.push(makeParagraph('7. Delete this instructions section (up to and including the === line) before importing.'));
  paragraphs.push(makeParagraph('8. Save the file as DOCX and click "Import File" in the quiz or exam builder.'));
  paragraphs.push(makeParagraph('==='));
  paragraphs.push(makeParagraph('EXAMPLE QUESTIONS BELOW — replace with your own:', true));
  paragraphs.push(makeParagraph('---'));

  // Example questions
  for (const q of TEMPLATE_QUESTIONS) {
    paragraphs.push(makeParagraph(`Question ${q.num}:`, true));
    for (const line of q.lines) {
      paragraphs.push(makeParagraph(line));
    }
    paragraphs.push(makeParagraph('---'));
  }

  return paragraphs;
};

export const downloadQuestionImportTemplate = async (): Promise<void> => {
  const { zipSync, strToU8 } = await import('fflate');

  const paragraphs = buildTemplateParagraphs();
  const documentXml = buildDocxXml(paragraphs);

  const docxZip = zipSync({
    '[Content_Types].xml': strToU8(DOCX_CONTENT_TYPES),
    '_rels/.rels': strToU8(DOCX_RELS),
    'word/document.xml': strToU8(documentXml),
    'word/_rels/document.xml.rels': strToU8(DOCX_WORD_RELS),
  });

  const blob = new Blob([docxZip], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = 'question-import-template.docx';
  link.click();
  URL.revokeObjectURL(objectUrl);
};
