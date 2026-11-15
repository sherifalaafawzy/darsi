/** The course editor's strings, registered when its chunk loads (they are not in the app's main dictionaries). */
import { addMessages, addStaffArea } from "../i18n";
import en from "./strings/en.json";
import ar from "./strings/ar.json";

addMessages({ en, ar });
// Other languages (public/content/i18n-staff/<lang>/cms.json) load in the page language.
addStaffArea("cms");
