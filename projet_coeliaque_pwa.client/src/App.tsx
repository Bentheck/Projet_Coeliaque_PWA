import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import "./app.css";

import Layout from "./components/Layout";
import Home from "./pages/Home";

import Factures from "./pages/Factures/Factures";
import FactureEdit from "./pages/Factures/FactureEdit";

import Comparatif from "./pages/Comparatif/Comparatif";
import ComparatifEdit from "./pages/Comparatif/ComparatifEdit";

import Rapports from "./pages/Comparatif/Rapports";
import RapportsDisplay from "./pages/Comparatif/RapportsDisplay";

import ListeEpicerieIndex from "./pages/ListeEpicerie/ListesEpicerieIndex";
import ListeEpicerieEdit from "./pages/ListeEpicerie/ListeEpicerieEdit";
import ListeEpicerieView from "./pages/ListeEpicerie/ListeEpicerieView";

// Forum
import ForumCategories from "./pages/Forum/ForumCategories";
import ForumThreads from "./pages/Forum/ForumThreads";
import ForumThreadView from "./pages/Forum/ForumThreadView";
import ForumNewThread from "./pages/Forum/ForumNewThread";

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

import Subscribe from "./pages/Membership/Subscribe";
import SubscribeSuccess from "./pages/Membership/SubscribeSuccess";
import SubscribeCancel from "./pages/Membership/SubscribeCancel";
import Membership from "./pages/Membership/Membership";

import MembershipGuard from "./components/MembershipGuard";
import AuthGuard from "./components/AuthGuard";
import { AuthProvider } from "./components/AuthContext";
import RequireSuperAdmin from "./components/RequireSuperAdmin";
import RequireForumAdmin from "./components/RequireForumAdmin";

// FAQ (DB-backed): named exports from your file at src/pages/FAQ/FaqModule.tsx
import { FaqPage as FaqPublic, FaqAdmin as FaqAdminPage } from "./pages/FAQ/FaqModule";

export default function App() {
    return (
        <AuthProvider>
            <Router>
                <Layout>
                    <Routes>
                        <Route path="/" element={<Home />} />

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

                        {/* Forum */}
                        <Route
                            path="/forum"
                            element={
                                <AuthGuard>
                                    <ForumCategories />
                                </AuthGuard>
                            }
                        />
                        <Route
                            path="/forum/c/:categoryId"
                            element={
                                <AuthGuard>
                                    <ForumThreads />
                                </AuthGuard>
                            }
                        />
                        <Route
                            path="/forum/t/:id"
                            element={
                                <AuthGuard>
                                    <ForumThreadView />
                                </AuthGuard>
                            }
                        />
                        <Route
                            path="/forum/new"
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

                        {/* FAQ */}
                        <Route path="/faq" element={<FaqPublic />} />
                        <Route path="/faq/calculateur" element={<FaqPublic />} />

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

                        {/* 404 */}
                        <Route path="*" element={<NotFound />} />
                    </Routes>
                </Layout>
            </Router>
        </AuthProvider>
    );
}
