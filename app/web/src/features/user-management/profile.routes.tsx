import { Route } from 'react-router-dom';
import { ProfilePage } from './ProfilePage';
export const PROFILE_ROUTES = { me: '/profile' } as const;
export const profileRoutes = <Route path={PROFILE_ROUTES.me} element={<ProfilePage />} />;
