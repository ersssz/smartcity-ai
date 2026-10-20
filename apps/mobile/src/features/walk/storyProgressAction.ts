export type StoryProgressInput = {
  storyOnly: boolean;
  phase: 'ready' | 'active' | 'paused' | 'completed';
  /** General progression permission; unlike a current-stop guard, it also applies at the end. */
  canProgress: boolean;
  currentStopIndex: number;
  stopIds: readonly string[];
  selectedStopIndex: number;
};
export type StoryProgressAction = { kind: 'none' } | { kind: 'read_story'; stopId: string } | { kind: 'confirm_end' };

/** Pure intent only. Root owns labels, explicit confirmation, commands and durable progress. */
export function storyProgressAction(input: StoryProgressInput): StoryProgressAction {
  if (input.storyOnly !== true || input.phase !== 'active' || input.canProgress !== true) return { kind: 'none' };
  const { currentStopIndex, selectedStopIndex, stopIds } = input;
  if (!stopIds.length || !Number.isInteger(currentStopIndex) || currentStopIndex < 0 || currentStopIndex > stopIds.length
    || !Number.isInteger(selectedStopIndex) || selectedStopIndex < 0 || selectedStopIndex > stopIds.length) return { kind: 'none' };
  if (currentStopIndex === stopIds.length) return { kind: 'confirm_end' };
  if (selectedStopIndex !== currentStopIndex) return { kind: 'none' };
  const stopId = stopIds[currentStopIndex];
  return typeof stopId === 'string' && stopId.length > 0 ? { kind: 'read_story', stopId } : { kind: 'none' };
}
