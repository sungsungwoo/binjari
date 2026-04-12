import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { RequireAdmin } from './auth/RequireAdmin'
import { RequireAuth } from './auth/RequireAuth'
import { RequireHost } from './auth/RequireHost'
import { AppShell } from './layout/AppShell'
import { HostBookingDetailPage } from './pages/host/HostBookingDetailPage'
import { HostBookingsPage } from './pages/host/HostBookingsPage'
import { HostDashboardPage } from './pages/host/HostDashboardPage'
import { HostOverridesPage } from './pages/host/HostOverridesPage'
import { HostRulesPage } from './pages/host/HostRulesPage'
import { HostServiceBasicEditPage } from './pages/host/HostServiceBasicEditPage'
import { HostServiceDashboardPage } from './pages/host/HostServiceDashboardPage'
import { HostServiceEditLayout } from './pages/host/HostServiceEditLayout'
import { HostServiceNewPage } from './pages/host/HostServiceNewPage'
import { HostServiceSetupPage } from './pages/host/HostServiceSetupPage'
import { HostServicesPage } from './pages/host/HostServicesPage'
import { HostSlotsPage } from './pages/host/HostSlotsPage'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { MyBookingDetailPage } from './pages/me/MyBookingDetailPage'
import { MyBookingsPage } from './pages/me/MyBookingsPage'
import { PublicBookPage } from './pages/PublicBookPage'
import { SignupPage } from './pages/SignupPage'
import { AdminHomePage } from './pages/admin/AdminHomePage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<LandingPage />} />
            <Route path="auth/login" element={<LoginPage />} />
            <Route path="auth/signup" element={<SignupPage />} />
            <Route path="book/:slug" element={<PublicBookPage />} />

            <Route element={<RequireAuth />}>
              <Route path="me/bookings" element={<MyBookingsPage />} />
              <Route
                path="me/bookings/:bookingId"
                element={<MyBookingDetailPage />}
              />
              <Route element={<RequireAdmin />}>
                <Route path="admin" element={<AdminHomePage />} />
              </Route>
            </Route>

            <Route element={<RequireHost />}>
              <Route path="host/dashboard" element={<HostDashboardPage />} />
              <Route path="host/services" element={<HostServicesPage />} />
              <Route path="host/services/new" element={<HostServiceNewPage />} />
              <Route
                path="host/services/:bookingSlug/dashboard"
                element={<HostServiceDashboardPage />}
              />
              <Route
                path="host/services/:hostSettingId/edit"
                element={<HostServiceEditLayout />}
              >
                <Route index element={<Navigate to="basic" replace />} />
                <Route
                  path="basic"
                  element={<HostServiceBasicEditPage />}
                />
                <Route path="rules" element={<HostRulesPage />} />
                <Route path="slots" element={<HostSlotsPage />} />
                <Route path="overrides" element={<HostOverridesPage />} />
              </Route>
              <Route
                path="host/services/:hostSettingId/setup"
                element={<HostServiceSetupPage />}
              />
              <Route
                path="host/services/:hostSettingId/rules"
                element={<HostRulesPage />}
              />
              <Route
                path="host/services/:hostSettingId/overrides"
                element={<HostOverridesPage />}
              />
              <Route
                path="host/services/:hostSettingId/slots"
                element={<HostSlotsPage />}
              />
              <Route path="host/bookings" element={<HostBookingsPage />} />
              <Route
                path="host/bookings/:bookingId"
                element={<HostBookingDetailPage />}
              />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
