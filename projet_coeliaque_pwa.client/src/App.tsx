import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
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

// NEW forum pages (replace old ForumIndex/ForumCategory/ForumThreads)
import ForumCategories from "./pages/Forum/ForumCategories";
import ForumThreads from "./pages/Forum/ForumThreads";
import ForumThreadView from "./pages/Forum/ForumThreadView";
import ForumNewThread from "./pages/Forum/ForumNewThread";

// Admin (DB-backed forum admins)
import ForumAdminPanel from "./pages/Forum/ForumAdminPanel";

// SuperAdmin (Identity role)
import SuperAdminPanel from "./pages/Super/SuperAdminPanel";

import NotFound from "./pages/NotFound";

import Login from "./pages/User/login";
import Register from "./pages/User/register";
import Logout from "./pages/User/logout";

import Subscribe from "./pages/Membership/Subscribe";
import SubscribeSuccess from "./pages/Membership/SubscribeSuccess";
import SubscribeCancel from "./pages/Membership/SubscribeCancel";
import Membership from "./pages/Membership/Membership";

import MembershipGuard from "./components/MembershipGuard";
import AuthGuard from "./components/AuthGuard";
import { AuthProvider } from "./components/AuthContext";

export default function App() {
    const [user, setUser] = useState<any>(null);
    const [membershipStatus, setMembershipStatus] = useState<string | null>(null);

    const refreshStatus = useCallback(() => {
        fetch("/api/account/status", { credentials: "include" })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                setUser(data?.user ?? null);
                setMembershipStatus(data?.membershipStatus ?? null);
            })
            .catch(() => {
                setUser(null);
                setMembershipStatus(null);
            });
    }, []);

    useEffect(() => {
        refreshStatus();
    }, [refreshStatus]);

    return (
        <AuthProvider>
            <Router>
                <Layout user={user} membershipStatus={membershipStatus}>
                    <Routes>
                        <Route path="/" element={<Home />} />

                        {/* Factures / Comparatif / Rapports (unchanged) */}
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

                        {/* Grocery lists (unchanged) */}
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

                        {/* Forum: public + creation */}
                        <Route path="/forum" element={<ForumCategories />} />
                        <Route path="/forum/c/:categoryId" element={<ForumThreads />} />
                        {/* Use :id to match ForumThreadView’s useParams */}
                        <Route path="/forum/t/:id" element={<ForumThreadView />} />
                        {/* Creating a thread requires auth */}
                        <Route
                            path="/forum/new"
                            element={
                                <AuthGuard>
                                    <ForumNewThread />
                                </AuthGuard>
                            }
                        />

                        {/* Forum admin (DB-backed forum admins) */}
                        <Route
                            path="/admin/forum"
                            element={
                                <AuthGuard>
                                    <ForumAdminPanel />
                                </AuthGuard>
                            }
                        />

                        {/* SuperAdmin (Identity role) */}
                        <Route
                            path="/super/admins"
                            element={
                                <AuthGuard>
                                    <SuperAdminPanel />
                                </AuthGuard>
                            }
                        />

                        {/* Auth & membership */}
                        <Route path="/login" element={<Login />} />
                        <Route path="/register" element={<Register />} />
                        <Route path="/subscribe" element={<AuthGuard><Subscribe /></AuthGuard>} />
                        <Route path="/subscribe/success" element={<AuthGuard><SubscribeSuccess /></AuthGuard>} />
                        <Route path="/subscribe/cancel" element={<AuthGuard><SubscribeCancel /></AuthGuard>} />
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
                        <Route path="/logout" element={<Logout />} />

                        {/* 404 */}
                        <Route path="*" element={<NotFound />} />
                    </Routes>
                </Layout>
            </Router>
        </AuthProvider>
    );
}
