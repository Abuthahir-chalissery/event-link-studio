import { Link, useNavigate } from "react-router-dom";
import { Camera, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export function AppHeader() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 glass border-b border-border">
      <div className="container flex h-16 items-center justify-between">
        <Link to={user ? "/dashboard" : "/"} className="flex items-center gap-2 group">
          <div className="relative">
            <Camera className="h-5 w-5 text-primary transition-transform group-hover:rotate-6" />
          </div>
          <span className="font-display text-2xl tracking-tight">
            Lu<span className="text-primary">men</span>
          </span>
        </Link>

        <nav className="flex items-center gap-2">
          {user ? (
            <>
              <Link to="/dashboard">
                <Button variant="ghost" size="sm">Events</Button>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await signOut();
                  navigate("/");
                }}
              >
                <LogOut className="h-4 w-4 mr-1" /> Sign out
              </Button>
            </>
          ) : (
            <>
              <Link to="/auth"><Button variant="ghost" size="sm">Sign in</Button></Link>
              <Link to="/auth?mode=signup"><Button variant="default" size="sm">Get started</Button></Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
