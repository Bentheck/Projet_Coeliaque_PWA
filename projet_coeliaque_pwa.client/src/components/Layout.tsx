import Navbar from './Navbar';

export default function Layout({ children, user, membershipStatus }: { children: React.ReactNode, user: any, membershipStatus: string | null }) {
    return (
        <>
            <Navbar user={user} membershipStatus={membershipStatus} />
            <main className="container">
                {children}
            </main>
            <footer className="bg-light py-3 mt-4">
                <div className="container text-center">&copy; 2025 Site Coeliaque</div>
            </footer>
        </>
    );
}