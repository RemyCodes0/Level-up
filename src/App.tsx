import './App.css'
import Landing from './landing/Landing'
import DashboardPage from './dashboard/Dashboard'
import { BrowserRouter } from "react-router-dom"
import {Routes, Route} from "react-router-dom"
import {AuthProvider} from "@/lib/auth-context"
import LoginPage from './login/Login'
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
import TutorProfilePage from './tutors/tutors-detail/tutors-detail'
import MessagesPage from './messages/Messages'
import BookSessionPage from './book/Book'
import ApplyTutorPage from './Tutor-Application/TutorApplication'

function App() {


  return (
    
    <BrowserRouter>
    <AuthProvider>
    <Routes>
      <Route path="/" element={<Landing/>}/>
      <Route path="/dashboard" element={<DashboardPage/>}/>
      <Route path="/login" element={<LoginPage/>}/>
      <Route path="/profile" element={<ProfilePage/>}/>
      <Route path="/signup" element={<SignupPage/>}/>
      <Route path="/tutors/:id" element={<TutorProfilePage/>}/>
      <Route path="/tutors" element={<TutorsPage/>}/>
      <Route path="/bookings" element={<BookingsPage/>}/>
      <Route path="/tutor/dashboard" element={<TutorDashboardPage/>}/>
      <Route path="/tutor/earnings" element={<TutorEarningsPage/>}/>
      <Route path="/tutor/availability" element={<TutorAvailabilityPage/>}/>
      <Route path="/tutor/profile" element={<TutorProfileEditPage/>}/>
      <Route path="/tutor/sessions" element={<TutorSessionsPage/>}/>
      <Route path="/admin/dashboard" element={<AdminDashboardPage/>}/>
      <Route path="/admin/users" element={<AdminUsersPage/>}/>
      <Route path="/admin/sessions" element={<AdminSessionsPage/>}/>
      <Route path="/admin/applications" element={<AdminApplicationsPage/>}/>
      <Route path="/admin/analytics" element={<AdminAnalyticsPage/>}/>
      <Route path="/messages" element={<MessagesPage/>}/>
      <Route path="/book/:id" element={<BookSessionPage/>}/>
      <Route path="/apply" element={<ApplyTutorPage/>}/>
      
    </Routes>
  </AuthProvider>
  </BrowserRouter>
    
  )
}

export default App
