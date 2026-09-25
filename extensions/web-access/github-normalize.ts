export function githubRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function githubString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function githubInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

export function githubBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function normalizeGitHubUser(value: unknown): Record<string, unknown> | undefined {
  const entry = githubRecord(value);
  if (!entry) return undefined;
  return {
    login: githubString(entry.login),
    url: githubString(entry.html_url),
  };
}

export function normalizeGitHubUsers(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const normalized = normalizeGitHubUser(item);
    return normalized ? [normalized] : [];
  });
}

export function normalizeGitHubLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string") return [item];
    const name = githubString(githubRecord(item)?.name);
    return name ? [name] : [];
  });
}

export function normalizeGitHubReactions(value: unknown): Record<string, number> | undefined {
  const entry = githubRecord(value);
  if (!entry) return undefined;
  return {
    total: githubInteger(entry.total_count) ?? 0,
    plusOne: githubInteger(entry["+1"]) ?? 0,
    minusOne: githubInteger(entry["-1"]) ?? 0,
    laugh: githubInteger(entry.laugh) ?? 0,
    confused: githubInteger(entry.confused) ?? 0,
    heart: githubInteger(entry.heart) ?? 0,
    hooray: githubInteger(entry.hooray) ?? 0,
    rocket: githubInteger(entry.rocket) ?? 0,
    eyes: githubInteger(entry.eyes) ?? 0,
  };
}

export function normalizeGitHubIssueComment(
  comment: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id: githubInteger(comment.id),
    body: githubString(comment.body),
    author: normalizeGitHubUser(comment.user),
    authorAssociation: githubString(comment.author_association),
    createdAt: githubString(comment.created_at),
    updatedAt: githubString(comment.updated_at),
    url: githubString(comment.html_url),
    reactions: normalizeGitHubReactions(comment.reactions),
  };
}
