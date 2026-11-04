/**
 * A certificate's code: the course, then a short mark from the learner's name and when they finished it. Me shows it on
 * the learner's own certificates, and platform admins see the same code on /super/certificates.
 */
export const certCode = (unitId: string, name: string, finished: string) =>
  `DRS-${unitId.toUpperCase()}-${(name || "T").length.toString(36).toUpperCase()}${new Date(finished).getTime().toString(36).slice(-4).toUpperCase()}`;
