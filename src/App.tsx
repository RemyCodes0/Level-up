import './App.css'
import Landing from './landing/Landing'
import DashboardPage from './dashboard/Dashboard'
import { BrowserRouter } from "react-router-dom"
import {Routes, Route} from "react-router-dom"
import {AuthProvider} from "@/lib/auth-context"
import LoginPage from './login/Login'
import ForgotPasswordPage from './login/ForgotPassword'
import ResetPasswordPage from './login/ResetPassword'
import ProfilePage from './Profile/Profile'
import SignupPage from './signup/Signup'
import TutorsPage from './tutors/Tutors'
import BookingsPage from './bookings/Bookings'
import TutorDashboardPage from './tutors/Tutor-Dashboards'
import TutorEarningsPage from './tutors/earnings'
import TutorAvailabilityPage from './tutors/availability'
import TutorProfileEditPage from './tutors/Profile'
import TutorSessionsPage from './tutors/Session'
import AdminDashboardPage from './admin/Dashboard'
import AdminUsersPage from './admin/Users'
import AdminSessionsPage from './admin/Sessions'
import AdminApplicationsPage from './admin/Application'
import AdminAnalyticsPage from './admin/Analytics'
import AdminEmailPage from './admin/EmailComposer'
import AdStudio from './ads/AdStudio'
import TutorProfilePage from './tutors/tutors-detail/tutors-detail'
import MessagesPage from './messages/Messages'
import BookSessionPage from './book/Book'
import ApplyTutorPage from './Tutor-Application/TutorApplication'
import Analytics from "./Analytics";
import AILearningPage from './ai/AiTutor'
import ShowcasePage from './showcase/ShowCase'
import VerifyEmailPage from './signup/Verifyemailpage'
import AdminDashboard from './ai/AdminDashboard'
import AdminPricingConfigPage from './ai/AdminPricingConfig'
import PricingPage from './price/PricePage'
import CreditsDashboardPage from './dashboard/CreditsDashboard'
import SharedCoursePage from './share/SharePage'
import PublicGallery from './gallery/PublicGallery'
import CollabHome from './collab/CollabHome'
import CreateCollabRoom from './collab/CreateCollabRoom'
import CollabRoomPage from './collab/CollabRoomPage'
import JoinCollabRoom from './collab/JoinCollabRoom'
import { CookieConsent } from './lib/CookieConsent'
function App() {


  return (
    
    <BrowserRouter>
    <CookieConsent />
    <Analytics />
    <AuthProvider>
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
      <Route path="/tutors/:id" element={<TutorProfilePage/>}/>
      <Route path="/tutors" element={<TutorsPage/>}/>
      <Route path="/ai_tutor" element={<AILearningPage/>}/>
      <Route path="/ai_tutor/:courseId" element={<AILearningPage/>}/>
      <Route path="/ai_showcase" element={<ShowcasePage/>}/>
      <Route path="/ai_admin" element={<AdminDashboard/>}/>
      <Route path="/ai_admin/pricing" element={<AdminPricingConfigPage/>}/>
      <Route path="/bookings" element={<BookingsPage/>}/>
      <Route path="/tutor/dashboard" element={<TutorDashboardPage/>}/>
      <Route path="/tutor/earnings" element={<TutorEarningsPage/>}/>
      <Route path="/tutor/availability" element={<TutorAvailabilityPage/>}/>
      <Route path="/price" element={<PricingPage/>}/>
      <Route path="/credits" element={<CreditsDashboardPage/>}/>
      <Route path="/tutor/profile" element={<TutorProfileEditPage/>}/>
      <Route path="/tutor/sessions" element={<TutorSessionsPage/>}/>
      <Route path="/admin/dashboard" element={<AdminDashboardPage/>}/>
      <Route path="/admin/users" element={<AdminUsersPage/>}/>
      <Route path="/admin/sessions" element={<AdminSessionsPage/>}/>
      <Route path="/admin/applications" element={<AdminApplicationsPage/>}/>
      <Route path="/admin/analytics" element={<AdminAnalyticsPage/>}/>
      <Route path="/admin/email" element={<AdminEmailPage/>}/>
      <Route path="/ad-studio" element={<AdStudio/>}/>
      <Route path="/messages" element={<MessagesPage/>}/>
      <Route path="/book/:id" element={<BookSessionPage/>}/>
      <Route path="/apply" element={<ApplyTutorPage/>}/>
      
    </Routes>
  </AuthProvider>
  </BrowserRouter>
    
  )
}

export default App