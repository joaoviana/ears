// An idea is stale only if a slot it touches has moved since the idea was formed. The session revision advances on
// every bar and every file-watcher tick, so judging by revision alone refused ideas with nothing changed.

/** The slots in `touched` whose code differs (ignoring surrounding whitespace) from what `saw` recorded. */
export const movedSlots = (touched: string[], saw: Record<string, string>, slots: Record<string, string>) =>
  touched.filter((k) => (slots[k] || "").trim() !== (saw[k] ?? "").trim());

/** What the agent and the performer are told when an idea is refused because `moved` changed underneath it. */
export const movedReason = (moved: string[]) => `${moved.join(" and ")} changed since this idea was formed; read_room and reconsider`;
