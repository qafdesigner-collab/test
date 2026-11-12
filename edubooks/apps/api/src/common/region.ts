/** Region settings from Company → Region (one publisher per install). Updated at start-up and whenever they are saved. */
const state = { phoneCode: '', timezone: '' };
export const setRegion = (r: { phoneCode?: string; timezone?: string }) => { state.phoneCode = r.phoneCode ?? state.phoneCode; state.timezone = r.timezone ?? state.timezone; };
/** Explicit DEFAULT_COUNTRY_CODE in .env wins; otherwise the company setting (default 971, UAE). */
export const countryCode = () => (process.env.DEFAULT_COUNTRY_CODE || '').trim() || state.phoneCode || '971';
export const timezone = () => state.timezone || process.env.TZ || 'Asia/Dubai';
