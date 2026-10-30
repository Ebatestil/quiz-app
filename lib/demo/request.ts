export async function demoRequest(path: string, options?: RequestInit) {
  const response = await fetch(`/api/demo/${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.message || "Could not complete the request.");
  return data;
}
