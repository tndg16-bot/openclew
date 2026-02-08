class ErrorDeduplicator {
  static groupByRepository(parsedEmails) {
    const repoMap = new Map();
    for (const email of parsedEmails) {
      if (!email.errorInfo) continue;
      const repoKey = email.errorInfo.repo || email.errorInfo.project;
      if (!repoKey) continue;
      if (!repoMap.has(repoKey) ||
          new Date(email.errorInfo.timestamp) > new Date(repoMap.get(repoKey).errorInfo.timestamp)) {
        repoMap.set(repoKey, email);
      }
    }
    return Array.from(repoMap.values());
  }

  static isDuplicate(errorInfo, history, cooldownMs = 3600000) {
    const now = Date.now();
    return history.heals.some(heal => {
      const isSameRepo = heal.errorInfo?.repo === errorInfo.repo;
      const isSameBranch = heal.errorInfo?.branch === errorInfo.branch;
      const isRecent = (now - new Date(heal.timestamp).getTime()) < cooldownMs;
      return isSameRepo && isSameBranch && isRecent;
    });
  }
}
module.exports = ErrorDeduplicator;
