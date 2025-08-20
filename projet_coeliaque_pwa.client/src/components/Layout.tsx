import Navbar from './Navbar';

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <Navbar />
            <main className="container">
                {children}
            </main>
            <footer className="bg-light py-3 mt-4">
                <div className="container text-center">&copy; 2025 Service Coeliaque</div>
            </footer>
        </>
    );
}
