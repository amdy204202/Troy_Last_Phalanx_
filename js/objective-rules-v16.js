export function createObjectiveForStage(stage, position = { x: 0, y: 0 }) {
  const maxProgress = stage.objectiveType === 'capture' ? stage.targets * stage.captureSeconds : stage.targets;
  return Object.freeze({ instanceId: stage.objectiveId, type: stage.objectiveType, position: Object.freeze({ ...position }), maxProgress, progress: 0, status: 'active', rewarded: false, reward: stage.reward });
}

export function applyObjectiveProgress(objective, amount) {
  if (objective.status !== 'active' || !(amount > 0)) return objective;
  const progress = Math.min(objective.maxProgress, objective.progress + amount);
  return Object.freeze({ ...objective, progress, status: progress >= objective.maxProgress ? 'complete' : 'active' });
}

export function expireObjective(objective) {
  return ['complete','rewarded'].includes(objective.status) ? objective : Object.freeze({ ...objective, status: 'expired' });
}

export function settleObjectiveReward(objective, wallet) {
  if (objective.status !== 'complete' || objective.rewarded) return { objective, wallet };
  return {
    objective: Object.freeze({ ...objective, status: 'rewarded', rewarded: true }),
    wallet: Object.freeze({ ...wallet, drachma: wallet.drachma + objective.reward, safeGateTokens: Object.freeze([...wallet.safeGateTokens, `objective:${objective.instanceId}`]) }),
  };
}
