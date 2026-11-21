/** The platform analytics and organization branding strings, registered when an admin chunk loads (not in the app's main dictionaries). */
import { addMessages } from "../i18n";
import { addStaffArea } from "../staff/i18n";
import en from "./strings/en.json";
import ar from "./strings/ar.json";

addMessages({ en, ar });
// Other languages (public/content/i18n-staff/<lang>/admin.json) load in the page language.
addStaffArea("admin");
