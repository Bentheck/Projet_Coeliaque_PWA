// PATH: src/App.tsx
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import "./styles/app-theme.css";
import "./styles/bubbles.css";

import Layout from "./components/Layout";
import DemoSeoLayout from "./components/DemoSeoLayout";
import LocalizedPublicRedirect from "./components/LocalizedPublicRedirect";
// OLD: import Home from "./pages/Home";
import RootHome from "./pages/RootHome";

import Factures from "./pages/Factures/Factures";
import FactureEdit from "./pages/Factures/FactureEdit";

import Comparatif from "./pages/Comparatif/Comparatif";
import ComparatifEdit from "./pages/Comparatif/ComparatifEdit";

import Rapports from "./pages/Comparatif/Rapports";
import RapportsDisplay from "./pages/Comparatif/RapportsDisplay";

import ListeEpicerieIndex from "./pages/ListeEpicerie/ListesEpicerieIndex";
import ListeEpicerieEdit from "./pages/ListeEpicerie/ListeEpicerieEdit";
import ListeEpicerieView from "./pages/ListeEpicerie/ListeEpicerieView";
import RecipesIndex from "./pages/Recipes/RecipesIndex";
import RecipeEditor from "./pages/Recipes/RecipeEditor";
import RecipeDetail from "./pages/Recipes/RecipeDetail";

// Forum
import ForumCategories from "./pages/Forum/ForumCategories";
import ForumThreads from "./pages/Forum/ForumThreads";
import ForumThreadView from "./pages/Forum/ForumThreadView";
import ForumNewThread from "./pages/Forum/ForumNewThread";
import ForumLanguageSelector from "./pages/Forum/ForumLanguageSelector";

// Admin (forum)
import ForumAdminPanel from "./pages/Forum/ForumAdminPanel";

// SuperAdmin
import SuperAdminPanel from "./pages/Super/SuperAdminPanel";

import NotFound from "./pages/NotFound";

import Login from "./pages/User/login";
import Register from "./pages/User/register";
import Logout from "./pages/User/logout";
import UserProfileView from "./pages/User/UserProfileView";
import UserProfileEdit from "./pages/User/UserProfileEdit";
import ForgotPassword from "./pages/User/ForgotPassword";
import ResetPassword from "./pages/User/ResetPassword";

import Subscribe from "./pages/Membership/Subscribe";
import SubscribeSuccess from "./pages/Membership/SubscribeSuccess";
import SubscribeCancel from "./pages/Membership/SubscribeCancel";
import Membership from "./pages/Membership/Membership";

import MembershipGuard from "./components/MembershipGuard";
import AuthGuard from "./components/AuthGuard";
import { AuthProvider } from "./components/AuthContext";
import RequireSuperAdmin from "./components/RequireSuperAdmin";
import RequireForumAdmin from "./components/RequireForumAdmin";
import GlobalOfflineGuard from "./components/GlobalOfflineGuard";

// FAQ - contact
import {
    FaqPage as FaqPublic,
    FaqAdmin as FaqAdminPage,
} from "./pages/FAQ/FaqModule";
import ContactPage from "./pages/FAQ/contact";

// DEMO (offline-only) pages
import DemoHome from "./demo/DemoHome";
import DemoComparatifEdit from "./demo/DemoComparatifEdit";
import DemoComparatifIndex from "./demo/DemoComparatifIndex";
import DemoRapports from "./demo/DemoRapports";
import DemoRapportsDisplay from "./demo/DemoRapportsDisplay";
import DemoListesEpicerieIndex from "./demo/DemoListeEpicerieIndex";
import DemoListeEpicerieEdit from "./demo/DemoListeEpicerieEdit";
import DemoListeEpicerieView from "./demo/DemoListeEpicerieView";
import DemoFactures from "./demo/DemoFactures";
import DemoFactureEdit from "./demo/DemoFactureEdit";

import DisclaimerPage from "./pages/Legal/Disclaimer";
import TermsOfServicePage from "./pages/Legal/TermsOfService";
import PrivacyPage from "./pages/Legal/Privacy";

// site-closed page
import SiteClosed from "./pages/SiteClosed";

export default function App() {
    return (
        <AuthProvider>
            <Router>
                <GlobalOfflineGuard />
                <Layout>
                    <Routes>
                        {/* Public entry points */}
                        <Route
                            path="/"
                            element={<LocalizedPublicRedirect path="/" />}
                        />
                        <Route
                            path="/fr"
                            element={<RootHome publicLocale="fr" />}
                        />
                        <Route
                            path="/en"
                            element={<RootHome publicLocale="en" />}
                        />

                        {/* Site closed (global gate / 403 handler redirect) */}
                        <Route path="/site-closed" element={<SiteClosed />} />

                        {/* ================= DEMO (offline Dexie-only) ================= */}
                        <Route path="/demo" element={<DemoSeoLayout />}>
                            <Route index element={<DemoHome />} />

                            {/* Demo Factures */}
                            <Route path="factures" element={<DemoFactures />} />
                            <Route
                                path="factures/:id"
                                element={<DemoFactureEdit />}
                            />

                            {/* Demo Comparatif (index + edit) */}
                            <Route
                                path="comparatif"
                                element={<DemoComparatifIndex />}
                            />
                            <Route
                                path="comparatif/:id"
                                element={<DemoComparatifEdit />}
                            />

                            {/* Demo Rapports */}
                            <Route path="rapports" element={<DemoRapports />} />
                            <Route
                                path="rapports/:annee"
                                element={<DemoRapportsDisplay />}
                            />

                            {/* Demo Liste d’épicerie */}
                            <Route
                                path="liste-epicerie"
                                element={<DemoListesEpicerieIndex />}
                            />
                            <Route
                                path="liste-epicerie/edit/:id?"
                                element={<DemoListeEpicerieEdit />}
                            />
                            <Route
                                path="liste-epicerie/view/:id"
                                element={<DemoListeEpicerieView />}
                            />
                        </Route>

                        {/* ================= REAL APP (API + membership) ================ */}
                        <Route
                            path="/factures"
                            element={
                                <AuthGuard>
                                    <MembershipGuard>
                                        <Factures />
                                    </MembershipGuard>
                                </AuthGuard>
                            }
                        />
                        <Route
                            path="/factures/:id"
                            element={
                                <AuthGuard>
                                    <MembershipGuard>
                                        <FactureEdit />
                                    </MembershipGuard>
                                </AuthGuard>
                            }
                        />

                        <Route
                            path="/comparatif"
                            element={
                                <AuthGuard>
                                    <MembershipGuard>
                                        <Comparatif />
                                    </MembershipGuard>
                                </AuthGuard>
                            }
                        />
                        <Route
                            path="/comparatif/:id"
                            element={
                                <AuthGuard>
                                    <MembershipGuard>
                                        <ComparatifEdit />
                                    </MembershipGuard>
                                </AuthGuard>
                            }
                        />

                        <Route
                            path="/rapports"
                            element={
                                <AuthGuard>
                                    <MembershipGuard>
                                        <Rapports />
                                    </MembershipGuard>
                                </AuthGuard>
                            }
                        />
                        <Route
                            path="/rapports/:annee"
                            element={
                                <AuthGuard>
                                    <MembershipGuard>
                                        <RapportsDisplay />
                                    </MembershipGuard>
                                </AuthGuard>
                            }
                        />

                        <Route
                            path="/liste-epicerie"
                            element={
                                <AuthGuard>
                                    <MembershipGuard>
                                        <ListeEpicerieIndex />
                                    </MembershipGuard>
                                </AuthGuard>
                            }
                        />
                        <Route
                            path="/liste-epicerie/edit/:id?"
                            element={
                                <AuthGuard>
                                    <MembershipGuard>
                                        <ListeEpicerieEdit />
                                    </MembershipGuard>
                                </AuthGuard>
                            }
                        />
                        <Route
                            path="/liste-epicerie/view/:id"
                            element={
                                <AuthGuard>
                                    <MembershipGuard>
                                        <ListeEpicerieView />
                                    </MembershipGuard>
                                </AuthGuard>
                            }
                        />

                        <Route
                            path="/recipes"
                            element={
                                <AuthGuard>
                                    <MembershipGuard>
                                        <RecipesIndex />
                                    </MembershipGuard>
                                </AuthGuard>
                            }
                        />
                        <Route
                            path="/recipes/new"
                            element={
                                <AuthGuard>
                                    <MembershipGuard>
                                        <RecipeEditor />
                                    </MembershipGuard>
                                </AuthGuard>
                            }
                        />
                        <Route
                            path="/recipes/:id/edit"
                            element={
                                <AuthGuard>
                                    <MembershipGuard>
                                        <RecipeEditor />
                                    </MembershipGuard>
                                </AuthGuard>
                            }
                        />
                        <Route
                            path="/recipes/:id"
                            element={
                                <AuthGuard>
                                    <MembershipGuard>
                                        <RecipeDetail />
                                    </MembershipGuard>
                                </AuthGuard>
                            }
                        />

                        {/* ========= Forum with language selector ========= */}

                        {/* 1) Language selector at /forum */}
                        <Route
                            path="/forum"
                            element={
                                <AuthGuard>
                                    <ForumLanguageSelector />
                                </AuthGuard>
                            }
                        />

                        {/* 2) Categories per language */}
                        <Route
                            path="/forum/:lang"
                            element={
                                <AuthGuard>
                                    <ForumCategories />
                                </AuthGuard>
                            }
                        />

                        {/* 3) Threads list per language + category */}
                        <Route
                            path="/forum/:lang/c/:categoryId"
                            element={
                                <AuthGuard>
                                    <ForumThreads />
                                </AuthGuard>
                            }
                        />

                        {/* 4) Thread view per language */}
                        <Route
                            path="/forum/:lang/t/:id"
                            element={
                                <AuthGuard>
                                    <ForumThreadView />
                                </AuthGuard>
                            }
                        />

                        {/* 5) New thread per language */}
                        <Route
                            path="/forum/:lang/new"
                            element={
                                <AuthGuard>
                                    <ForumNewThread />
                                </AuthGuard>
                            }
                        />

                        {/* Admin */}
                        <Route
                            path="/admin/forum"
                            element={
                                <AuthGuard>
                                    <RequireForumAdmin>
                                        <ForumAdminPanel />
                                    </RequireForumAdmin>
                                </AuthGuard>
                            }
                        />
                        <Route
                            path="/super/admins"
                            element={
                                <AuthGuard>
                                    <RequireSuperAdmin>
                                        <SuperAdminPanel />
                                    </RequireSuperAdmin>
                                </AuthGuard>
                            }
                        />
                        <Route
                            path="/super/faq"
                            element={
                                <AuthGuard>
                                    <RequireSuperAdmin>
                                        <FaqAdminPage />
                                    </RequireSuperAdmin>
                                </AuthGuard>
                            }
                        />

                        {/* Public content */}
                        <Route
                            path="/faq"
                            element={<LocalizedPublicRedirect path="/faq" />}
                        />
                        <Route
                            path="/faq/calculateur"
                            element={<LocalizedPublicRedirect path="/faq" />}
                        />
                        <Route
                            path="/contact"
                            element={<LocalizedPublicRedirect path="/contact" />}
                        />
                        <Route
                            path="/fr/faq"
                            element={<FaqPublic publicLocale="fr" />}
                        />
                        <Route
                            path="/en/faq"
                            element={<FaqPublic publicLocale="en" />}
                        />
                        <Route
                            path="/fr/contact"
                            element={<ContactPage publicLocale="fr" />}
                        />
                        <Route
                            path="/en/contact"
                            element={<ContactPage publicLocale="en" />}
                        />

                        {/* User */}
                        <Route path="/u/:userId" element={<UserProfileView />} />
                        <Route
                            path="/u/me/edit"
                            element={
                                <AuthGuard>
                                    <UserProfileEdit />
                                </AuthGuard>
                            }
                        />

                        {/* Auth */}
                        <Route path="/login" element={<Login />} />
                        <Route path="/register" element={<Register />} />
                        <Route
                            path="/forgot-password"
                            element={<ForgotPassword />}
                        />
                        <Route
                            path="/reset-password"
                            element={<ResetPassword />}
                        />
                        <Route path="/logout" element={<Logout />} />

                        {/* Membership */}
                        <Route
                            path="/subscribe"
                            element={
                                <AuthGuard>
                                    <Subscribe />
                                </AuthGuard>
                            }
                        />
                        <Route
                            path="/subscribe/success"
                            element={
                                <AuthGuard>
                                    <SubscribeSuccess />
                                </AuthGuard>
                            }
                        />
                        <Route
                            path="/subscribe/cancel"
                            element={
                                <AuthGuard>
                                    <SubscribeCancel />
                                </AuthGuard>
                            }
                        />
                        <Route
                            path="/membership"
                            element={
                                <AuthGuard>
                                    <MembershipGuard>
                                        <Membership />
                                    </MembershipGuard>
                                </AuthGuard>
                            }
                        />

                        {/* Legal */}
                        <Route
                            path="/legal/disclaimer"
                            element={
                                <LocalizedPublicRedirect path="/disclaimer" />
                            }
                        />
                        <Route
                            path="/legal/tos"
                            element={<LocalizedPublicRedirect path="/terms" />}
                        />
                        <Route
                            path="/legal/privacy"
                            element={<LocalizedPublicRedirect path="/privacy" />}
                        />
                        <Route
                            path="/disclaimer"
                            element={
                                <LocalizedPublicRedirect path="/disclaimer" />
                            }
                        />
                        <Route
                            path="/terms"
                            element={<LocalizedPublicRedirect path="/terms" />}
                        />
                        <Route
                            path="/privacy"
                            element={<LocalizedPublicRedirect path="/privacy" />}
                        />
                        <Route
                            path="/fr/disclaimer"
                            element={<DisclaimerPage publicLocale="fr" />}
                        />
                        <Route
                            path="/en/disclaimer"
                            element={<DisclaimerPage publicLocale="en" />}
                        />
                        <Route
                            path="/fr/terms"
                            element={<TermsOfServicePage publicLocale="fr" />}
                        />
                        <Route
                            path="/en/terms"
                            element={<TermsOfServicePage publicLocale="en" />}
                        />
                        <Route
                            path="/fr/privacy"
                            element={<PrivacyPage publicLocale="fr" />}
                        />
                        <Route
                            path="/en/privacy"
                            element={<PrivacyPage publicLocale="en" />}
                        />

                        {/* 404 */}
                        <Route path="*" element={<NotFound />} />
                    </Routes>
                </Layout>
            </Router>
        </AuthProvider>
    );
}
