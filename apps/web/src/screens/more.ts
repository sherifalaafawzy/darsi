/**
 * The pages that are not the first screen, in one lazy chunk that App.tsx loads (precached, so they open offline as
 * before): the account screens (sign-in, sign-up, forgot, choose a password; they load the Firebase SDK anyway), Me,
 * Kit, My tracks and Labs. Out of the startup file, which every start downloads and parses.
 *
 * One chunk, not one per page: every lazy chunk that shares startup code gives the bundler more groups of shared modules
 * to place, and past a few it stops merging them into the startup file (one lazy chunk per page: 22 startup files instead
 * of 6, measured). Nothing here may make an import() of its own either (auth/sso.ts setSchoolChunks). Measure any change
 * (CLAUDE.md "Keep the startup bundle in one file"; node scripts/check-bundle.mjs on a scratch build).
 */
export { Forgot, NotConfigured, SetPassword, SignIn, SignUp } from "../auth/AuthScreens";
export { Me } from "./Me";
export { Kit } from "./Kit";
export { MyTracks } from "./MyTracks";
export { LabApp, Labs } from "./Labs";
