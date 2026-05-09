// Single source of truth: delegate to the richer config/logger implementation.
// All files importing from this path get DailyRotateFile transport, structured
// formatting, and process-level exception handlers automatically.
export { default, logError, logRequest, logQuery, logAPICall, sanitizeLogData, createChildLogger } from '../config/logger.js';
