export function toTwoFactorChallengeKey(portal: 'app' | 'admin', normalizedEmail: string): string {
  return `${portal}:${normalizedEmail}`;
}

export function addTwoFactorChallenge(
  currentMap: Record<string, string>,
  challengeKey: string,
  nextChallengeId: string,
): Record<string, string> {
  return { ...currentMap, [challengeKey]: nextChallengeId };
}

export function removeTwoFactorChallenge(
  currentMap: Record<string, string>,
  challengeKey: string,
): Record<string, string> {
  if (!(challengeKey in currentMap)) return currentMap;
  const { [challengeKey]: _removed, ...rest } = currentMap;
  return rest;
}
