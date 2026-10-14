export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      signal: options?.signal ?? AbortSignal.timeout(30000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError')
      throw new Error('The app server took too long to respond. Please try again.');
    throw new Error('Cannot reach the app server. Check that it is running, then try again.');
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('The server returned an unreadable response.');
  }
  if (!response.ok) throw new Error(data.error?.message ?? 'The request failed. Please try again.');
  return data as T;
}
