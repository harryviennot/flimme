import NotFoundScreen from '../+not-found';

// The phone's side of `[page].web.tsx` (the legal pages of flimme.com, roadmap M8.3). Expo Router
// wants every web route to have a sibling without a platform extension. The phone has no such
// screen (Settings opens those addresses in the browser), so a link that lands here shows the
// same "not found" screen as any other unknown path.
export default NotFoundScreen;
