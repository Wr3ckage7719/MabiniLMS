export interface CourseMetadata {
  section?: string;
  block?: string;
  level?: string;
  room?: string;
  schedule?: string;
  theme?: string;
  coverImage?: string;
}

interface StoredCourseMetadata extends CourseMetadata {
  version?: number;
}

const trimOrUndefined = (value?: string): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const parseMetadataLines = (source?: string): CourseMetadata => {
  if (!source) {
    return {};
  }

  const metadata: CourseMetadata = {};
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex < 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    if (!value) {
      continue;
    }

    if (key === 'section') metadata.section = value;
    if (key === 'block') metadata.block = value;
    if (key === 'level') metadata.level = value;
    if (key === 'room') metadata.room = value;
    if (key === 'schedule') metadata.schedule = value;
    if (key === 'theme') metadata.theme = value;
    if (key === 'cover_image' || key === 'coverimage' || key === 'headerimage') {
      metadata.coverImage = value;
    }
  }

  return metadata;
};

export const parseCourseMetadataFromDescription = (description?: string): CourseMetadata => {
  return parseMetadataLines(description);
};

export const parseCourseMetadataFromSyllabus = (syllabus?: string): CourseMetadata => {
  if (!syllabus) {
    return {};
  }

  try {
    const parsed = JSON.parse(syllabus) as StoredCourseMetadata | null;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    return {
      section: trimOrUndefined(parsed.section),
      block: trimOrUndefined(parsed.block),
      level: trimOrUndefined(parsed.level),
      room: trimOrUndefined(parsed.room),
      schedule: trimOrUndefined(parsed.schedule),
      theme: trimOrUndefined(parsed.theme),
      coverImage: trimOrUndefined(parsed.coverImage),
    };
  } catch {
    return parseMetadataLines(syllabus);
  }
};

export const buildCourseMetadata = (metadata: CourseMetadata): CourseMetadata => {
  return {
    section: trimOrUndefined(metadata.section),
    block: trimOrUndefined(metadata.block),
    level: trimOrUndefined(metadata.level),
    room: trimOrUndefined(metadata.room),
    schedule: trimOrUndefined(metadata.schedule),
    theme: trimOrUndefined(metadata.theme),
    coverImage: trimOrUndefined(metadata.coverImage),
  };
};

export const serializeCourseMetadata = (metadata: CourseMetadata): string | undefined => {
  const normalized = buildCourseMetadata(metadata);
  const hasData = Object.values(normalized).some((value) => Boolean(value));

  if (!hasData) {
    return undefined;
  }

  return JSON.stringify({
    version: 1,
    ...normalized,
  });
};
