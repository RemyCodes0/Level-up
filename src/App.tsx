import './App.css'
import { useEffect, useState } from 'react'
import Landing from './landing/Landing'
import DashboardPage from './dashboard/Dashboard'
import { BrowserRouter } from "react-router-dom"
import {Routes, Route, useLocation} from "react-router-dom"
import {AuthProvider} from "@/lib/auth-context"
import MaintenancePage from './maintenance/MaintenancePage'
import LoginPage from './login/Login'
import ForgotPasswordPage from './login/ForgotPassword'
import ResetPasswordPage from './login/ResetPassword'
import ProfilePage from './Profile/Profile'
import SignupPage from './signup/Signup'
import AdminLayout from './admin/AdminLayout'
import AdminOverviewPage from './admin/pages/Overview'
import AdminAiSpendPage from './admin/pages/AiSpend'
import AdminRevenuePage from './admin/pages/Revenue'
import AdminReferralsPage from './admin/pages/Referrals'
import AdminCoursesPage from './admin/pages/Courses'
import AdminComponentLibraryPage from './admin/pages/ComponentLibrary'
import AdminUsersPage from './admin/pages/Users'
import AdminFeedbackAndReviewsPage from './admin/pages/FeedbackAndReviews'
import AdminTrafficPage from './admin/pages/Traffic'
import AdminPricingConfigPage from './admin/pages/PricingConfigPage'
import AdminEmailPage from './admin/pages/EmailComposerPage'
import Analytics from "./Analytics";
import AILearningPage from './ai/AiTutor'
import ShowcasePage from './showcase/ShowCase'
import VerifyEmailPage from './signup/Verifyemailpage'
import PricingPage from './price/PricePage'
import CreditsDashboardPage from './dashboard/CreditsDashboard'
import SharedCoursePage from './share/SharePage'
import PublicGallery from './gallery/PublicGallery'
import CollabHome from './collab/CollabHome'
import CreateCollabRoom from './collab/CreateCollabRoom'
import CollabRoomPage from './collab/CollabRoomPage'
import JoinCollabRoom from './collab/JoinCollabRoom'
import { CookieConsent } from './lib/CookieConsent'

const API = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

// Paths that must keep working even while maintenance mode is active — the
// whole admin dashboard (so an admin can turn it back off) and every auth
// page (so an admin who isn't currently logged in can still log in, or
// someone mid-signup/reset isn't stranded). RequireAdmin (inside AdminLayout)
// still separately gates WHO can actually see /admin content — this list
// only decides which paths bypass the maintenance blackout entirely.
const MAINTENANCE_EXEMPT_PATHS = ["/admin", "/login", "/signup", "/forgot-password", "/reset-password", "/verify-email"];

// Checked once per navigation (not polled continuously) — same cadence as a
// typical maintenance-mode implementation; an admin toggling it mid-session
// takes effect on that user's next page load/route change, not instantly.
function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [status, setStatus] = useState<{ active: boolean; message: string } | null>(null);

  useEffect(() => {
    fetch(`${API}/api/maintenance`)
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ active: false, message: "" }));
  }, []);

  const exempt = MAINTENANCE_EXEMPT_PATHS.some((p) => location.pathname.startsWith(p));
  if (status?.active && !exempt) {
    return <MaintenancePage message={status.message} />;
  }
  return <>{children}</>;
}

function App() {


  return (
    
    <BrowserRouter>
    <CookieConsent />
    <Analytics />
    <AuthProvider>
    <MaintenanceGate>
    <Routes>
      <Route path="/" element={<Landing/>}/>
      <Route path="/dashboard" element={<DashboardPage/>}/>
      <Route path="/login" element={<LoginPage/>}/>
      <Route path="/forgot-password" element={<ForgotPasswordPage/>}/>
      <Route path="/reset-password" element={<ResetPasswordPage/>}/>
      <Route path="/profile" element={<ProfilePage/>}/>
      <Route path="/signup" element={<SignupPage/>}/>
      <Route path="/verify-email" element={<VerifyEmailPage/>}/>
      <Route path="/shared/:shareToken" element={<SharedCoursePage />} />
      <Route path="/gallery" element={<PublicGallery/>}/>
      <Route path="/collab" element={<CollabHome/>}/>
      <Route path="/collab/new" element={<CreateCollabRoom/>}/>
      <Route path="/collab/invite/:shareToken" element={<JoinCollabRoom/>}/>
      <Route path="/collab/:roomId" element={<CollabRoomPage/>}/>
      <Route path="/ai_tutor" element={<AILearningPage/>}/>
      <Route path="/ai_tutor/:courseId" element={<AILearningPage/>}/>
      <Route path="/ai_showcase" element={<ShowcasePage/>}/>
      <Route path="/price" element={<PricingPage/>}/>
      <Route path="/credits" element={<CreditsDashboardPage/>}/>
      <Route path="/admin" element={<AdminLayout/>}>
        <Route index element={<AdminOverviewPage/>}/>
        <Route path="ai-spend" element={<AdminAiSpendPage/>}/>
        <Route path="revenue" element={<AdminRevenuePage/>}/>
        <Route path="referrals" element={<AdminReferralsPage/>}/>
        <Route path="courses" element={<AdminCoursesPage/>}/>
        <Route path="courses/:courseId" element={<AdminCoursesPage/>}/>
        <Route path="component-library" element={<AdminComponentLibraryPage/>}/>
        <Route path="users" element={<AdminUsersPage/>}/>
        <Route path="feedback-reviews" element={<AdminFeedbackAndReviewsPage/>}/>
        <Route path="traffic" element={<AdminTrafficPage/>}/>
        <Route path="pricing" element={<AdminPricingConfigPage/>}/>
        <Route path="emails" element={<AdminEmailPage/>}/>
      </Route>
    </Routes>
    </MaintenanceGate>
  </AuthProvider>
  </BrowserRouter>
    
  )
}

export default App