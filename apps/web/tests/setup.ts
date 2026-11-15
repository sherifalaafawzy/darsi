// Runs before every test file (vitest.config.ts, test.setupFiles).
// findBy… and waitFor give up after 1 second by default. A screen that loads a lazy chunk and then reads its data takes
// longer than that on a loaded machine (the whole suite at once, a CI runner), and the test failed although the screen
// was right. Five seconds for all of them; a query that is going to pass still returns the moment it does.
import { configure } from "@testing-library/react";

configure({ asyncUtilTimeout: 5000 });
