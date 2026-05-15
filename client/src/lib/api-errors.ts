// Extracts a human-readable message from an Axios / fetch error response.
// Server endpoints return `{ success: false, error: { message: '...' } }` or
// `{ message: '...' }`; this helper unwraps both. Falls back to the JS
// `error.message` (e.g. "Request failed with status code 403") only when no
// server message is present — that fallback is not user-friendly so prefer a
// caller-provided `fallback` for the no-message case.
export function extractApiErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (typeof error === 'object' && error !== null) {
    const maybe = error as {
      response?: { data?: { error?: { message?: string }; message?: string } };
      message?: string;
    };

    const serverMessage =
      maybe.response?.data?.error?.message || maybe.response?.data?.message;
    if (serverMessage) {
      return serverMessage;
    }

    if (maybe.message && !/request failed with status code/i.test(maybe.message)) {
      return maybe.message;
    }
  }

  if (error instanceof Error && !/request failed with status code/i.test(error.message)) {
    return error.message;
  }

  return fallback;
}
