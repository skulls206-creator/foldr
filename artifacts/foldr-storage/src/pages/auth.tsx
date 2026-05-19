import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, ArrowRight, Shield, Lock, AlertTriangle, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useLogin, useRegister, useGetMe, useTotpChallenge } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const authSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type AuthFormValues = z.infer<typeof authSchema>;

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // TOTP challenge state
  const [totpState, setTotpState] = useState<{ required: false } | { required: true; pendingToken: string }>({ required: false });
  const [totpCode, setTotpCode] = useState("");
  
  const { data: user, isLoading: checkingAuth } = useGetMe({ query: { queryKey: ["getMe"], retry: false } });
  const loginMutation = useLogin();
  const registerMutation = useRegister();
  const totpChallengeMutation = useTotpChallenge();

  useEffect(() => {
    if (user && !checkingAuth) {
      setLocation("/");
    }
  }, [user, checkingAuth, setLocation]);

  const form = useForm<AuthFormValues>({
    resolver: zodResolver(authSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = (data: AuthFormValues) => {
    if (isLogin) {
      loginMutation.mutate({ data }, {
        onSuccess: (response: any) => {
          if (response?.token) {
            localStorage.setItem("foldr-auth-token", response.token);
          }
          if (response?.requiresTOTP && response?.pendingToken) {
            setTotpState({ required: true, pendingToken: response.pendingToken });
          } else {
            queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
            setLocation("/");
          }
        },
        onError: (error: any) => {
          toast({ variant: "destructive", title: "Login Failed", description: error?.message || "Invalid credentials." });
        }
      });
    } else {
      registerMutation.mutate({ data }, {
        onSuccess: (response: any) => {
          if (response?.token) {
            localStorage.setItem("foldr-auth-token", response.token);
          }
          queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
          setLocation("/");
        },
        onError: (error: any) => {
          toast({ variant: "destructive", title: "Registration Failed", description: error?.message || "Could not create account." });
        }
      });
    }
  };

  const handleTotpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpState.required) return;
    totpChallengeMutation.mutate({ pendingToken: totpState.pendingToken, code: totpCode }, {
      onSuccess: (response: any) => {
        if (response?.token) {
          localStorage.setItem("foldr-auth-token", response.token);
        }
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        setLocation("/");
      },
      onError: (error: any) => {
        setTotpCode("");
        toast({ variant: "destructive", title: "Invalid Code", description: error?.message || "The code was incorrect. Please try again." });
      },
    });
  };

  if (checkingAuth) {
    return <div className="min-h-screen bg-background flex justify-center items-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const isPending = loginMutation.isPending || registerMutation.isPending;

  // ── TOTP challenge screen ─────────────────────────────────────────────────

  if (totpState.required) {
    return (
      <div className="min-h-screen w-full flex bg-background relative overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img src={`${import.meta.env.BASE_URL}images/auth-bg.png`} alt="Abstract Background" className="w-full h-full object-cover opacity-40 mix-blend-screen" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
        </div>
        <div className="flex-1 flex flex-col justify-center items-center z-10 px-4">
          <div className="w-full max-w-md">
            <div className="glass-panel p-8 rounded-3xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
              <div className="flex items-center gap-2 mb-6">
                <HardDrive className="w-5 h-5 text-primary flex-shrink-0" />
                <span className="font-display font-bold text-base tracking-tight text-primary">FOLDR</span>
              </div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Lock className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Two-Factor Authentication</h2>
                  <p className="text-sm text-muted-foreground">Enter the 6-digit code from your authenticator app</p>
                </div>
              </div>
              <form onSubmit={handleTotpSubmit} className="space-y-5">
                <Input
                  value={totpCode}
                  onChange={e => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="font-mono text-2xl tracking-widest text-center bg-black/30 border-white/10 h-16 rounded-xl focus-visible:ring-primary/30"
                  maxLength={6}
                  autoFocus
                />
                <Button
                  type="submit"
                  disabled={totpChallengeMutation.isPending || totpCode.length !== 6}
                  className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-lg shadow-[0_0_20px_rgba(0,255,255,0.2)] hover:shadow-[0_0_30px_rgba(0,255,255,0.4)] transition-all duration-300"
                >
                  {totpChallengeMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                    <span className="flex items-center gap-2">
                      Verify <Shield className="w-4 h-4" />
                    </span>
                  )}
                </Button>
              </form>
              <div className="mt-6 text-center">
                <button
                  onClick={() => { setTotpState({ required: false }); setTotpCode(""); }}
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  ← Back to login
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Main login/register screen ─────────────────────────────────────────────

  return (
    <div className="min-h-screen w-full flex bg-background relative overflow-hidden">
      {/* Background Graphic */}
      <div className="absolute inset-0 z-0">
        <img src={`${import.meta.env.BASE_URL}images/auth-bg.png`} alt="Abstract Background" className="w-full h-full object-cover opacity-40 mix-blend-screen" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
      </div>

      <div className="flex-1 flex flex-col justify-center items-center z-10 px-4">
        <div className="w-full max-w-md">
          <div className="glass-panel p-8 rounded-3xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
            
            <div className="flex items-center gap-2 mb-8">
              <HardDrive className="w-5 h-5 text-primary flex-shrink-0" />
              <span className="font-display font-bold text-base tracking-tight text-primary">FOLDR</span>
            </div>

            <div className="mb-8">
              <h2 className="text-2xl font-bold">{isLogin ? "Welcome back" : "Create your account"}</h2>
              <p className="text-muted-foreground mt-2">
                {isLogin ? "Enter your credentials to access your decentralized drive." : "Join the secure, IPFS-backed storage revolution."}
              </p>
            </div>

            {!isLogin && (
              <div className="mb-6 rounded-xl p-3 bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">No password recovery.</span>
                  {" "}There is no email-based recovery. If you lose your password, your account cannot be recovered. Store your credentials safely.
                </div>
              </div>
            )}

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-white/80">Email</FormLabel>
                      <FormControl>
                        <Input placeholder="you@example.com" autoComplete="email" type="email" {...field} className="bg-black/30 border-white/10 h-12 rounded-xl focus-visible:ring-primary/30" />
                      </FormControl>
                      <FormMessage className="text-destructive/80" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-white/80">Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" autoComplete={isLogin ? "current-password" : "new-password"} {...field} className="bg-black/30 border-white/10 h-12 rounded-xl focus-visible:ring-primary/30" />
                      </FormControl>
                      <FormMessage className="text-destructive/80" />
                    </FormItem>
                  )}
                />
                
                <Button 
                  type="submit" 
                  disabled={isPending}
                  className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-lg mt-4 shadow-[0_0_20px_rgba(0,255,255,0.2)] hover:shadow-[0_0_30px_rgba(0,255,255,0.4)] transition-all duration-300"
                >
                  {isPending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <span className="flex items-center gap-2">
                      {isLogin ? "Sign In" : "Sign Up"} <ArrowRight className="w-4 h-4" />
                    </span>
                  )}
                </Button>
              </form>
            </Form>

            <div className="mt-8 text-center">
              <button 
                onClick={() => setIsLogin(!isLogin)} 
                className="text-sm text-muted-foreground hover:text-primary transition-colors focus:outline-none focus:underline"
              >
                {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
