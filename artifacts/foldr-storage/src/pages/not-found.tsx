import { Link } from "wouter";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center text-center px-4">
      <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center border border-white/10 mb-8">
        <FileQuestion className="w-12 h-12 text-muted-foreground" />
      </div>
      <h1 className="text-4xl font-display font-bold mb-4 tracking-tight">404 - Page Not Found</h1>
      <p className="text-lg text-muted-foreground mb-8 max-w-md">
        The folder or file you are looking for doesn't exist or has been moved.
      </p>
      <Link href="/">
        <Button className="h-12 px-8 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold">
          Return to Drive
        </Button>
      </Link>
    </div>
  );
}
