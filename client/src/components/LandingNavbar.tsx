import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AppLogo } from "@/components/AppLogo";

interface NavbarProps {
  isScrolled: boolean;
}

export const LandingNavbar = ({ isScrolled }: NavbarProps) => {
  const navigate = useNavigate();

  return (
    <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${isScrolled ? "bg-background/80 backdrop-blur-xl border-b border-border/40 shadow-lg" : "bg-transparent"}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
          <AppLogo className="h-8 w-8" />
          <span className="font-bold text-xl bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Mabini Classroom
          </span>
        </button>
        <div className="flex items-center gap-4">
          <Button variant="ghost" className="hidden sm:inline-flex">Features</Button>
          <Button variant="outline" onClick={() => navigate("/login")}>Sign In</Button>
        </div>
      </div>
    </nav>
  );
};
