import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/layout';
import { RequireAdmin, RequireAuth, RequirePublisher } from './lib/auth';

const Home = lazy(() => import('./pages/Home'));
const ToolsIndex = lazy(() => import('./pages/ToolsIndex'));
const ToolPage = lazy(() => import('./pages/ToolPage'));
const BlogList = lazy(() => import('./pages/BlogList'));
const BlogDetail = lazy(() => import('./pages/BlogDetail'));
const BlogEditor = lazy(() => import('./pages/BlogEditor'));
const SubmitBlog = lazy(() => import('./pages/SubmitBlog'));
const ForumList = lazy(() => import('./pages/ForumList'));
const ForumView = lazy(() => import('./pages/ForumView'));
const ThreadView = lazy(() => import('./pages/ThreadView'));
const Login = lazy(() => import('./pages/auth/Login'));
const Register = lazy(() => import('./pages/auth/Register'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Feedback = lazy(() => import('./pages/Feedback'));
const SubmitTool = lazy(() => import('./pages/SubmitTool'));
const Assistant = lazy(() => import('./pages/Assistant'));
const About = lazy(() => import('./pages/About'));
const NotFound = lazy(() => import('./pages/NotFound'));
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const AdminOverview = lazy(() => import('./pages/admin/Overview'));
const AdminUsers = lazy(() => import('./pages/admin/Users'));
const AdminTools = lazy(() => import('./pages/admin/Tools'));
const AdminBlogs = lazy(() => import('./pages/admin/Blogs'));
const AdminCategories = lazy(() => import('./pages/admin/Categories'));
const AdminFeedback = lazy(() => import('./pages/admin/Feedback'));
const AdminSubmissions = lazy(() => import('./pages/admin/Submissions'));
const AdminBans = lazy(() => import('./pages/admin/Bans'));
const AdminAccessLogs = lazy(() => import('./pages/admin/AccessLogs'));
const AdminSettings = lazy(() => import('./pages/admin/Settings'));

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="tools" element={<ToolsIndex />} />
        <Route path="tools/:slug" element={<ToolPage />} />

        <Route path="blog" element={<BlogList />} />
        <Route path="blog/new" element={<RequirePublisher><BlogEditor /></RequirePublisher>} />
        <Route path="blog/:id" element={<BlogDetail />} />
        <Route path="blog/:id/edit" element={<RequirePublisher><BlogEditor /></RequirePublisher>} />
        <Route path="submit/blog" element={<RequireAuth><SubmitBlog /></RequireAuth>} />

        <Route path="forum" element={<ForumList />} />
        <Route path="forum/:id" element={<ForumView />} />
        <Route path="forum/thread/:id" element={<ThreadView />} />

        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="reset-password" element={<ResetPassword />} />

        <Route path="dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="feedback" element={<RequireAuth><Feedback /></RequireAuth>} />
        <Route path="submit/tool" element={<RequireAuth><SubmitTool /></RequireAuth>} />
        <Route path="assistant" element={<Assistant />} />
        <Route path="about" element={<About />} />

        <Route
          path="admin"
          element={
            <RequireAdmin>
              <AdminLayout />
            </RequireAdmin>
          }
        >
          <Route index element={<AdminOverview />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="tools" element={<AdminTools />} />
          <Route path="blogs" element={<AdminBlogs />} />
          <Route path="categories" element={<AdminCategories />} />
          <Route path="feedback" element={<AdminFeedback />} />
          <Route path="submissions" element={<AdminSubmissions />} />
          <Route path="bans" element={<AdminBans />} />
          <Route path="access-logs" element={<AdminAccessLogs />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
