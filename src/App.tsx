import AppShell from './components/layout/app-shell/AppShell';

/**
 * Root component. Rendering + session routing live in AppShell; settings are
 * auto-loaded there too — only AFTER the stored session has been validated so
 * that self-serve onboarding applicants (restaurant not ACTIVE yet) never hit
 * POS-protected endpoints.
 */
export default function App() {
  return <AppShell />;
}
