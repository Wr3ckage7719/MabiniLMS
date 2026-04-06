import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { BookOpen, ArrowRight } from "lucide-react";

interface NavbarProps {
  isScrolled: boolean;
}

export const LandingNavbar = ({ isScrolled }: NavbarProps) => {
  const navigate = useNavigate();

  return (
    <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${isScrolled ? "bg-background/80 backdrop-blur-xl border-b border-border/40 shadow-lg" : "bg-transparent"}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
          <div className="w-8 h-8 bg-gradient-to-br from-primary to-accent rounded-lg flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
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
