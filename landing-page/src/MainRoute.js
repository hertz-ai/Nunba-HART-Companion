import React, { Suspense, lazy } from "react";
import { Route, Routes } from "react-router-dom";
import { Helmet } from "react-helmet-async";

import PageSkeleton from "./components/shared/PageSkeleton";
import ErrorBoundary from "./components/shared/ErrorBoundary";

/**
 * Retry wrapper for React.lazy — retries chunk loading up to 3 times
 * before giving up. Handles transient ChunkLoadError failures.
 */
function lazyRetry(importFn) {
  return lazy(() =>
    importFn().catch((err) => {
      // Only retry ChunkLoadError (network failures loading JS chunks)
      if (err.name === 'ChunkLoadError' || err.message?.includes('Loading chunk')) {
        return new Promise((resolve) => setTimeout(resolve, 1000))
          .then(() => importFn().catch(() =>
            new Promise((resolve) => setTimeout(resolve, 2000))
              .then(() => importFn())
          ));
      }
      throw err;
    })
  );
}

const Home = lazy(() => import("./pages/Home"));

const AboutUs = lazy(() => import("./pages/aboutus"));
const Personalised_Learning = lazy(() => import("./pages/index-three"));
const Pricing = lazy(() => import("./pages/pricing"));
const SpeechTherapyPage = lazy(() => import("./pages/SpeechTherapyPage"));
const TrialPlanPricing = lazy(() => import("./pages/TrialPlanPricing"));
const PaymentFailure = lazy(() => import("../src/components/PaymentFailure"));
const PaymentSuccess = lazy(() => import("../src/components/PaymentSuccess"));
const PendingPaymentPage = lazy(() =>
  import("../src/components/PendingPaymentPage")
);
const Institution = lazy(() => import("./pages/institution"));
const SignupLite = lazy(() => import("./pages/signuplite"));
const Contact = lazy(() => import("./pages/contact"));
const NewSignup = lazy(() => import("./pages/NewSignup"));
// Agent is the landing page — eagerly loaded, no lazy/Suspense black screen
import Agent from "./components/Agent/Agent";
const Agents = lazy(() => import("./components/Agent/Agents"));
const SocialHome = lazyRetry(() => import('./components/Social/SocialHome'));
const SocialFeed = lazyRetry(() => import('./components/Social/Feed/FeedPage'));
const SocialProfile = lazyRetry(() => import('./components/Social/Profile/ProfilePage'));
const SocialResonance = lazyRetry(() => import('./components/Social/Gamification/ResonanceDashboard'));
const SocialAchievements = lazyRetry(() => import('./components/Social/Gamification/AchievementsPage'));
const ChallengesPage = lazyRetry(() => import('./components/Social/Gamification/ChallengesPage'));
const ChallengeDetailPage = lazyRetry(() => import('./components/Social/Gamification/ChallengeDetailPage'));
const SeasonPage = lazyRetry(() => import('./components/Social/Gamification/SeasonPage'));
const RegionsPage = lazyRetry(() => import('./components/Social/Regions/RegionsPage'));
const RegionDetailPage = lazyRetry(() => import('./components/Social/Regions/RegionDetailPage'));
const EncountersPage = lazyRetry(() => import('./components/Social/Encounters/EncountersPage'));
const EncounterDetailPage = lazyRetry(() => import('./components/Social/Encounters/EncounterDetailPage'));
const ActivityHub = lazyRetry(() => import('./components/Social/ActivityHub/ActivityHub'));
const ComputeDashboardPage = lazyRetry(() => import('./components/Social/Compute/ComputeDashboardPage'));
const ExperimentDiscoveryPage = lazyRetry(() => import('./components/Social/Experiments/ExperimentDiscoveryPage'));
const AgentEvolutionPage = lazyRetry(() => import('./components/Social/Evolution/AgentEvolutionPage'));
const CampaignsPage = lazyRetry(() => import('./components/Social/Campaigns/CampaignsPage'));
const CampaignStudio = lazyRetry(() => import('./components/Social/Campaigns/CampaignStudio'));
const CampaignDetailPage = lazyRetry(() => import('./components/Social/Campaigns/CampaignDetailPage'));
const PostDetailPage = lazyRetry(() => import('./components/Social/Post/PostDetailPage'));
const SearchPage = lazyRetry(() => import('./components/Social/Search/SearchPage'));
const NotificationsPage = lazyRetry(() => import('./components/Social/Notifications/NotificationsPage'));
const RecipeListPage = lazyRetry(() => import('./components/Social/Recipes/RecipeListPage'));
const CommunityListPage = lazyRetry(() => import('./components/Social/Communities/CommunityListPage'));
const CommunityDetailPage = lazyRetry(() => import('./components/Social/Communities/CommunityDetailPage'));

// Games Hub (Adult)
const GameHub = lazyRetry(() => import('./components/Social/Games/GameHub'));
const UnifiedGameScreen = lazyRetry(() => import('./components/Social/Games/UnifiedGameScreen'));

// Kids Learning Zone
const KidsLearningHub = lazyRetry(() => import('./components/Social/KidsLearning/KidsLearningHub'));
const KidsGameScreen = lazyRetry(() => import('./components/Social/KidsLearning/KidsGameScreen'));
const KidsProgressScreen = lazyRetry(() => import('./components/Social/KidsLearning/KidsProgressScreen'));
const GameCreatorScreen = lazyRetry(() => import('./components/Social/KidsLearning/GameCreatorScreen'));
const CustomGamesScreen = lazyRetry(() => import('./components/Social/KidsLearning/CustomGamesScreen'));

// Agent Chat
const AgentChatPage = lazyRetry(() => import('./components/Social/Chat/AgentChatPage'));

// Thought Experiment Tracker
const ThoughtExperimentTracker = lazyRetry(() => import('./components/Social/Tracker/ThoughtExperimentTracker'));

// Agent Hive View
const AgentHiveView = lazyRetry(() => import('./components/Social/Tracker/AgentHiveView'));

// Channel pages (user-facing)
const ChannelBindingsPage = lazyRetry(() => import('./components/Channels/ChannelBindingsPage'));
const ConversationHistoryPanel = lazyRetry(() => import('./components/Channels/ConversationHistoryPanel'));

// Settings
const BackupSettingsPage = lazyRetry(() => import('./components/Social/Settings/BackupSettingsPage'));
const ThemeSettingsPage = lazyRetry(() => import('./components/Social/Settings/ThemeSettingsPage'));

// Agent Audit
const AgentAuditPage = lazyRetry(() => import('./components/Social/Agents/AgentAuditPage'));

// Agent Profile
const AgentProfilePage = lazyRetry(() => import('./components/Social/Agents/AgentProfilePage'));

// Autopilot
const AutopilotPage = lazyRetry(() => import('./components/Social/Autopilot/AutopilotPage'));

// MCP Tool Browser
const MCPToolBrowser = lazyRetry(() => import('./components/Social/Tools/MCPToolBrowser'));

// Marketplace
const MarketplacePage = lazyRetry(() => import('./components/Social/Marketplace/MarketplacePage'));

// Share Landing
const ShareLandingPage = lazy(() => import('./pages/ShareLandingPage'));
const PupitDocs = lazy(() => import('./components/pupitDocs'));
const PupitAi = lazy(() => import('./components/PupitAi'));

// Mindstory (social-integrated video generation)
const MindstoryPage = lazyRetry(() => import('./components/Social/Mindstory/MindstoryPage'));

// Auth guards
import RoleGuard from './components/RoleGuard';

import { Box, Typography, Button } from '@mui/material';
import { Link } from 'react-router-dom';

function NotFoundPage() {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0F0E17', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', textAlign: 'center', px: 3 }}>
      <Helmet><title>404 — Page Not Found | Nunba</title><meta name="robots" content="noindex" /></Helmet>
      <Typography variant="h1" sx={{ fontSize: { xs: '4rem', sm: '6rem' }, fontWeight: 700, background: 'linear-gradient(135deg, #6C63FF, #FF6B6B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', mb: 2 }}>404</Typography>
      <Typography variant="h5" sx={{ mb: 1, opacity: 0.87 }}>Page not found</Typography>
      <Typography variant="body1" sx={{ mb: 4, opacity: 0.6, maxWidth: 400 }}>The page you're looking for doesn't exist or has been moved.</Typography>
      <Button component={Link} to="/social" variant="contained" sx={{ bgcolor: '#6C63FF', '&:hover': { bgcolor: '#5A52E0' }, borderRadius: 3, px: 4, py: 1.5, textTransform: 'none', fontWeight: 600 }}>Go Home</Button>
    </Box>
  );
}

// Admin pages
const AdminLayout = lazyRetry(() => import('./components/Admin/AdminLayout'));
const AdminDashboard = lazyRetry(() => import('./components/Admin/DashboardPage'));
const AdminUsers = lazyRetry(() => import('./components/Admin/UsersManagementPage'));
const AdminModeration = lazyRetry(() => import('./components/Admin/ModerationPage'));
const AdminAgentSync = lazyRetry(() => import('./components/Admin/AgentSyncPage'));
const AdminChannels = lazyRetry(() => import('./components/Admin/ChannelsPage'));
const AdminWorkflows = lazyRetry(() => import('./components/Admin/WorkflowsPage'));
const AdminSettings = lazyRetry(() => import('./components/Admin/SettingsPage'));
const AdminIdentity = lazyRetry(() => import('./components/Admin/IdentityPage'));
const AdminAgentDashboard = lazyRetry(() => import('./components/Admin/AgentDashboardPage'));
const AdminRevenue = lazyRetry(() => import('./components/Admin/RevenueAnalyticsPage'));
const AdminContentTasks = lazyRetry(() => import('./components/Admin/ContentTasksPage'));
const AdminNetworkNodes = lazyRetry(() => import('./pages/admin/NetworkNodesPage'));
const AdminModelManagement = lazyRetry(() => import('./pages/admin/ModelManagementPage'));
const AdminProviderManagement = lazyRetry(() => import('./pages/admin/ProviderManagementPage'));
const AdminTaskLedger = lazyRetry(() => import('./pages/admin/TaskLedgerPage'));
const AdminClaudeCodeIntegration = lazyRetry(() => import('./pages/admin/ClaudeCodeIntegrationPage'));

function MainRoutes() {
  return (
    <>
      {/* Global fallback SEO */}
      <Helmet>
        <title>Hevolve AI | Self-Evolving Multimodal AI Agents</title>
        <meta
          name="description"
          content="Create self-evolving multimodal AI agents through natural conversation and real-time learning."
        />
        <link rel="canonical" href="https://hevolve.ai/" />
      </Helmet>

      <Routes>
        <Route
          index
          path="/"
          element={
            <>
              <Helmet>
                <title>Hevolve AI | Self-Evolving Multimodal AI Agents</title>
                <meta
                  name="description"
                  content="Build self-evolving multimodal AI agents using natural conversation and no-code tools."
                />
                <link rel="canonical" href="https://hevolve.ai/" />
              </Helmet>
              <Agent key="root" />
            </>
          }
        />

        {/* Local route for Nunba offline mode - same as root */}
        <Route
          path="/local"
          element={
            <>
              <Helmet>
                <title>Hevolve AI | Local Mode</title>
                <meta
                  name="description"
                  content="Hevolve AI running in local/offline mode."
                />
              </Helmet>
              <Agent key="local" />
            </>
          }
        />

        <Route
          path="/AboutHevolve"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <>
                <Helmet>
                  <title>About Hevolve AI | Continual Learning Platform</title>
                  <meta
                    name="description"
                    content="Learn about Hevolve AI and how we enable self-evolving AI agents."
                  />
                  <link rel="canonical" href="https://hevolve.ai/AboutHevolve" />
                </Helmet>
                <Home />
              </>
            </Suspense>
          }
        />

        <Route
          path="/personalisedlearning"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <>
                <Helmet>
                  <title>Personalised Learning AI | Hevolve AI</title>
                  <meta
                    name="description"
                    content="Create personalised AI tutors that adapt and learn continuously."
                  />
                  <link
                    rel="canonical"
                    href="https://hevolve.ai/personalisedlearning"
                  />
                </Helmet>
                <Personalised_Learning />
              </>
            </Suspense>
          }
        />

        <Route
          path="/aboutus"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <>
                <Helmet>
                  <title>About Us | Hevolve AI</title>
                  <meta
                    name="description"
                    content="Meet the team behind Hevolve AI and our vision for self-evolving AI systems."
                  />
                  <link rel="canonical" href="https://hevolve.ai/aboutus" />
                </Helmet>
                <AboutUs />
              </>
            </Suspense>
          }
        />

        <Route
          path="/Plan"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <>
                <Helmet>
                  <title>Pricing | Hevolve AI</title>
                  <meta
                    name="description"
                    content="Explore Hevolve AI pricing plans for individuals and enterprises."
                  />
                  <link rel="canonical" href="https://hevolve.ai/Plan" />
                </Helmet>
                <Pricing />
              </>
            </Suspense>
          }
        />

        <Route
          path="/speechtherapy"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <>
                <Helmet>
                  <title>Speech Therapy AI | Hevolve AI</title>
                  <meta
                    name="description"
                    content="Practice speech therapy using AI-powered conversational agents."
                  />
                  <link
                    rel="canonical"
                    href="https://hevolve.ai/speechtherapy"
                  />
                </Helmet>
                <SpeechTherapyPage />
              </>
            </Suspense>
          }
        />

        <Route
          path="/trialplan"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <>
                <Helmet>
                  <title>Trial Plan | Hevolve AI</title>
                  <meta
                    name="description"
                    content="Start a trial of Hevolve AI and explore self-evolving AI agents."
                  />
                  <link rel="canonical" href="https://hevolve.ai/trialplan" />
                </Helmet>
                <TrialPlanPricing />
              </>
            </Suspense>
          }
        />

        {/* Payment routes — UNCHANGED */}
        <Route
          index
          path="/PaymentFailure"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <>
                <Helmet>
                  <meta name="robots" content="noindex, nofollow" />
                </Helmet>
                <PaymentFailure />
              </>
            </Suspense>
          }
        />

        <Route
          index
          path="/PaymentSuccess"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <>
                <Helmet>
                  <meta name="robots" content="noindex, nofollow" />
                </Helmet>
                <PaymentSuccess />
              </>
            </Suspense>
          }
        />

        <Route
          index
          path="/PendingPaymentPage"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <>
                <Helmet>
                  <meta name="robots" content="noindex, nofollow" />
                </Helmet>
                <PendingPaymentPage />
              </>
            </Suspense>
          }
        />

        <Route
          path="/contact"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <>
                <Helmet>
                  <title>Contact Hevolve AI</title>
                  <meta
                    name="description"
                    content="Contact Hevolve AI for support, partnerships, or enterprise solutions."
                  />
                  <link rel="canonical" href="https://hevolve.ai/contact" />
                </Helmet>
                <Contact />
              </>
            </Suspense>
          }
        />

        <Route
          path="/institution"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <>
                <Helmet>
                  <title>Institutional AI Solutions | Hevolve AI</title>
                  <meta
                    name="description"
                    content="AI solutions for institutions and organizations."
                  />
                  <link rel="canonical" href="https://hevolve.ai/institution" />
                </Helmet>
                <Institution />
              </>
            </Suspense>
          }
        />

        <Route
          path="/institution/signup"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <>
                <Helmet>
                  <title>Institution Signup | Hevolve AI</title>
                  <meta
                    name="description"
                    content="Sign up your institution to deploy Hevolve AI agents."
                  />
                  <link
                    rel="canonical"
                    href="https://hevolve.ai/institution/signup"
                  />
                </Helmet>
                <SignupLite />
              </>
            </Suspense>
          }
        />

        <Route
          path="/agents"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <>
                <Helmet>
                  <title>AI Agents | Hevolve AI</title>
                  <meta
                    name="description"
                    content="Browse AI agents available on Hevolve AI."
                  />
                  <link rel="canonical" href="https://hevolve.ai/agents" />
                </Helmet>
                <Agents />
              </>
            </Suspense>
          }
        />

        <Route
          path="/agents/:agentName"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <Agent />
            </Suspense>
          }
        />

        <Route
          path="/signup"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <>
                <Helmet>
                  <title>Signup | Hevolve AI</title>
                  <meta
                    name="description"
                    content="Create your Hevolve AI account and start building AI agents."
                  />
                  <link rel="canonical" href="https://hevolve.ai/signup" />
                </Helmet>
                <NewSignup />
              </>
            </Suspense>
          }
        />
        {/* Share link resolver — resolves /s/:token and redirects to actual resource */}
        <Route path="/s/:token" element={<Suspense fallback={<PageSkeleton dark />}><ShareLandingPage /></Suspense>} />
        {/* Mindstory SDK + Pupit documentation */}
        <Route path="/docs" element={<Suspense fallback={<PageSkeleton />}><><Helmet><title>Mindstory SDK Documentation | Hevolve AI</title><meta name="description" content="Mindstory multimodal SDK — completions API, Pupit video player, website plugin documentation." /></Helmet><PupitDocs /></></Suspense>} />
        <Route path="/pupit" element={<Suspense fallback={<PageSkeleton dark />}><><Helmet><title>Pupit AI — Video Generation | Hevolve AI</title><meta name="description" content="Generate AI-powered talking head videos with Pupit." /></Helmet><PupitAi /></></Suspense>} />

        <Route path="/social" element={<Suspense fallback={<PageSkeleton dark variant="feed" />}><SocialHome /></Suspense>}>
          {/* Open routes — guests and anonymous can read */}
          <Route index element={<><Helmet><title>Nunba — Thought Experiments</title><meta name="description" content="Explore thought experiments and ideas with your community." /></Helmet><SocialFeed /></>} />
          <Route path="profile/:userId" element={<><Helmet><title>Nunba — Profile</title></Helmet><SocialProfile /></>} />
          <Route path="post/:postId" element={<><Helmet><title>Nunba — Post</title></Helmet><PostDetailPage /></>} />
          <Route path="search" element={<><Helmet><title>Nunba — Search</title><meta name="description" content="Search thought experiments, users, and agents on Nunba." /></Helmet><SearchPage /></>} />
          <Route path="achievements" element={<><Helmet><title>Nunba — Achievements</title></Helmet><SocialAchievements /></>} />
          <Route path="challenges" element={<><Helmet><title>Nunba — Challenges</title></Helmet><ChallengesPage /></>} />
          <Route path="challenges/:challengeId" element={<ChallengeDetailPage />} />
          <Route path="seasons" element={<><Helmet><title>Nunba — Seasons</title></Helmet><SeasonPage /></>} />
          <Route path="recipes" element={<><Helmet><title>Nunba — Recipes</title></Helmet><RecipeListPage /></>} />
          <Route path="communities" element={<><Helmet><title>Nunba — Communities</title></Helmet><CommunityListPage /></>} />
          <Route path="h/:communityId" element={<CommunityDetailPage />} />
          <Route path="agents/:agentId/evolution" element={<AgentEvolutionPage />} />
          <Route path="agent/:agentId" element={<Suspense fallback={<PageSkeleton dark />}><Helmet><title>Nunba — Agent Profile</title></Helmet><AgentProfilePage /></Suspense>} />
          <Route path="agent/:agentId/chat" element={<><Helmet><title>Nunba — Agent Chat</title></Helmet><AgentChatPage /></>} />
          <Route path="coding" element={<><Helmet><title>Nunba — Coding Agent</title></Helmet><AgentChatPage /></>} />
          <Route path="tracker" element={<RoleGuard minRole="flat"><Helmet><title>Nunba — Experiment Tracker</title></Helmet><ThoughtExperimentTracker /></RoleGuard>} />
          <Route path="hive" element={<RoleGuard minRole="flat"><Helmet><title>Nunba — Agent Hive</title></Helmet><AgentHiveView /></RoleGuard>} />
          <Route path="channels" element={<RoleGuard minRole="flat"><Helmet><title>Nunba — My Channels</title></Helmet><ChannelBindingsPage /></RoleGuard>} />
          <Route path="channels/history" element={<RoleGuard minRole="flat"><Helmet><title>Nunba — Channel History</title></Helmet><ConversationHistoryPanel /></RoleGuard>} />
          <Route path="settings/backup" element={<RoleGuard minRole="guest"><Helmet><title>Nunba — Backup &amp; Sync</title></Helmet><BackupSettingsPage /></RoleGuard>} />
          <Route path="settings/appearance" element={<RoleGuard minRole="guest"><Helmet><title>Nunba — Appearance</title></Helmet><ThemeSettingsPage /></RoleGuard>} />
          <Route path="agents" element={<RoleGuard minRole="flat"><Helmet><title>Nunba — Agent Audit</title></Helmet><AgentAuditPage /></RoleGuard>} />
          <Route path="autopilot" element={<Suspense fallback={<PageSkeleton dark />}><Helmet><title>Nunba — Autopilot</title></Helmet><AutopilotPage /></Suspense>} />
          <Route path="tools" element={<><Helmet><title>Nunba — MCP Tools</title></Helmet><MCPToolBrowser /></>} />
          <Route path="marketplace" element={<><Helmet><title>Nunba — Marketplace</title></Helmet><MarketplacePage /></>} />

          {/* Kids Learning Zone — open access (educational content, no auth wall) */}
          <Route path="kids" element={<KidsLearningHub />} />
          <Route path="kids/game/:gameId" element={<KidsGameScreen />} />
          <Route path="kids/progress" element={<RoleGuard minRole="guest"><KidsProgressScreen /></RoleGuard>} />
          <Route path="kids/create" element={<RoleGuard minRole="guest"><GameCreatorScreen /></RoleGuard>} />
          <Route path="kids/custom" element={<RoleGuard minRole="flat"><CustomGamesScreen /></RoleGuard>} />

          {/* Games Hub — open for browsing, flat+ for multiplayer */}
          <Route path="games" element={<GameHub />} />
          <Route path="games/:gameId" element={<UnifiedGameScreen />} />

          {/* Mindstory — AI video generation (reuses existing PupitCard + VIDEO_GEN_URL) */}
          <Route path="mindstory" element={<><Helmet><title>Nunba — Mindstory</title></Helmet><MindstoryPage /></>} />

          {/* Auth required — guests allowed for read-only */}
          <Route path="resonance" element={<RoleGuard minRole="flat" allowGuest><SocialResonance /></RoleGuard>} />

          {/* Auth required — flat+ only */}
          <Route path="notifications" element={<RoleGuard minRole="flat"><NotificationsPage /></RoleGuard>} />
          <Route path="regions" element={<RoleGuard minRole="flat"><RegionsPage /></RoleGuard>} />
          <Route path="regions/:regionId" element={<RoleGuard minRole="flat"><RegionDetailPage /></RoleGuard>} />
          <Route path="hub" element={<ActivityHub />} />
          <Route path="experiments" element={<ExperimentDiscoveryPage />} />
          <Route path="compute" element={<RoleGuard minRole="flat"><ComputeDashboardPage /></RoleGuard>} />
          <Route path="encounters" element={<RoleGuard minRole="flat"><EncountersPage /></RoleGuard>} />
          <Route path="encounters/:encounterId" element={<RoleGuard minRole="flat"><EncounterDetailPage /></RoleGuard>} />
          <Route path="campaigns" element={<RoleGuard minRole="flat"><CampaignsPage /></RoleGuard>} />
          <Route path="campaigns/:campaignId" element={<RoleGuard minRole="flat"><CampaignDetailPage /></RoleGuard>} />

          {/* Regional+ only — campaign creation */}
          <Route path="campaigns/create" element={<RoleGuard minRole="regional"><CampaignStudio /></RoleGuard>} />
        </Route>

        {/* Admin Routes — ErrorBoundary lives inside AdminLayout (AOP pattern),
             so content crashes don't kill the sidebar/nav shell. */}
        <Route path="/admin" element={<Suspense fallback={<PageSkeleton dark />}><AdminLayout><RoleGuard minRole="guest" fallback="/social"><AdminDashboard /></RoleGuard></AdminLayout></Suspense>} />
        <Route path="/admin/users" element={<Suspense fallback={<PageSkeleton dark />}><AdminLayout><RoleGuard minRole="central" fallback="/admin"><AdminUsers /></RoleGuard></AdminLayout></Suspense>} />
        <Route path="/admin/moderation" element={<Suspense fallback={<PageSkeleton dark />}><AdminLayout><RoleGuard minRole="central" fallback="/admin"><AdminModeration /></RoleGuard></AdminLayout></Suspense>} />
        <Route path="/admin/agents" element={<Suspense fallback={<PageSkeleton dark />}><AdminLayout><RoleGuard minRole="guest" fallback="/social"><AdminAgentSync /></RoleGuard></AdminLayout></Suspense>} />
        <Route path="/admin/channels" element={<Suspense fallback={<PageSkeleton dark />}><AdminLayout><RoleGuard minRole="guest" fallback="/social"><AdminChannels /></RoleGuard></AdminLayout></Suspense>} />
        <Route path="/admin/workflows" element={<Suspense fallback={<PageSkeleton dark />}><AdminLayout><RoleGuard minRole="guest" fallback="/social"><AdminWorkflows /></RoleGuard></AdminLayout></Suspense>} />
        <Route path="/admin/settings" element={<Suspense fallback={<PageSkeleton dark />}><AdminLayout><RoleGuard minRole="guest" fallback="/social"><AdminSettings /></RoleGuard></AdminLayout></Suspense>} />
        <Route path="/admin/identity" element={<Suspense fallback={<PageSkeleton dark />}><AdminLayout><RoleGuard minRole="guest" fallback="/social"><AdminIdentity /></RoleGuard></AdminLayout></Suspense>} />
        <Route path="/admin/agent-dashboard" element={<Suspense fallback={<PageSkeleton dark />}><AdminLayout><RoleGuard minRole="guest" fallback="/social"><AdminAgentDashboard /></RoleGuard></AdminLayout></Suspense>} />
        <Route path="/admin/revenue" element={<Suspense fallback={<PageSkeleton dark />}><AdminLayout><RoleGuard minRole="central" fallback="/admin"><AdminRevenue /></RoleGuard></AdminLayout></Suspense>} />
        <Route path="/admin/content-tasks" element={<Suspense fallback={<PageSkeleton dark />}><AdminLayout><RoleGuard minRole="guest" fallback="/social"><AdminContentTasks /></RoleGuard></AdminLayout></Suspense>} />
        <Route path="/admin/network-nodes" element={<Suspense fallback={<PageSkeleton dark />}><AdminLayout><RoleGuard minRole="central" fallback="/admin"><AdminNetworkNodes /></RoleGuard></AdminLayout></Suspense>} />
        <Route path="/admin/models" element={<Suspense fallback={<PageSkeleton dark />}><AdminLayout><RoleGuard minRole="guest" fallback="/social"><AdminModelManagement /></RoleGuard></AdminLayout></Suspense>} />
        <Route path="/admin/providers" element={<Suspense fallback={<PageSkeleton dark />}><AdminLayout><RoleGuard minRole="guest" fallback="/social"><AdminProviderManagement /></RoleGuard></AdminLayout></Suspense>} />
        <Route path="/admin/task-ledger" element={<Suspense fallback={<PageSkeleton dark />}><AdminLayout><RoleGuard minRole="guest" fallback="/social"><AdminTaskLedger /></RoleGuard></AdminLayout></Suspense>} />
        <Route path="/admin/integrations/claude-code" element={<Suspense fallback={<PageSkeleton dark />}><AdminLayout><RoleGuard minRole="guest" fallback="/social"><AdminClaudeCodeIntegration /></RoleGuard></AdminLayout></Suspense>} />

        {/* 404 catch-all */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}

export default MainRoutes;
