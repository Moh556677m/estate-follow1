// Separate PocketBase client for the Editor Portal.
// Uses its own authStore so an editor session never overwrites a signed-in
// owner/broker/company session (and vice-versa). Editors authenticate against
// the `editors` auth collection, isolated from owner/broker/company data.
import Pocketbase from 'pocketbase';

const POCKETBASE_API_URL = '/hcgi/platform';

const editorClient = new Pocketbase(POCKETBASE_API_URL);

export default editorClient;
