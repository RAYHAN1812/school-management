/** Human-readable message from an API/axios error. */
export function getErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return fallback;
  if (error.code === 'ECONNABORTED') return 'The server took too long to respond. Please try again.';
  if (!error.response) return 'Cannot reach the server. Check your connection and try again.';
  return error.response.data?.error?.message ?? fallback;
}

export function getErrorCode(error) {
  return error?.response?.data?.error?.code;
}

/** Map server VALIDATION_ERROR details to { field: message }. */
export function getFieldErrors(error) {
  const details = error?.response?.data?.error?.details;
  if (!Array.isArray(details)) return {};
  return Object.fromEntries(details.filter((d) => d.field).map((d) => [d.field, d.message]));
}
