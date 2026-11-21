/**
 * Types for copy-shared.mjs, which is plain JavaScript (npm "prebuild" runs it with node, before any compiler), so the
 * tests that import it type-check (tsconfig.test.json). Keep it in step with the script's exports:
 * test/copy-shared-types.test.ts fails when one is missing here or left over.
 */

/** The files of apps/web/src/content that are copied into functions/src/shared/. */
export declare const FILES: string[];
/** The first line of every copy. */
export declare const HEADER: string;
/** A web file's text as its copy: the header, and ".js" on relative imports (NodeNext). */
export declare const transform: (src: string) => string;
/** The Labs apps' ids, from each folder's meta.ts (default: apps/web/src/labs/apps), sorted. */
export declare function labIds(dir?: string): string[];
/** The text of src/shared/labs.ts for those ids (default: labIds()). */
export declare const labsFile: (ids?: string[]) => string;
