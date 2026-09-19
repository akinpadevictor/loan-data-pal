import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Credit Lens" },
      {
        name: "description",
        content: "Sign in to upload the latest customer, loan, collection and transaction files.",
      },
      { property: "og:title", content: "Sign in — Credit Lens" },
      { property: "og:type", content: "website" },
      {
        property: "og:description",
        content: "Restricted access: only approved staff can refresh the Credit Lens data.",
      },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Account created. You can sign in now.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/upload" });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-md px-5 pb-20 pt-16">
      <p className="label-caps">Restricted area</p>
      <h1 className="mt-2 text-3xl font-extrabold">Sign in to update data</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Only approved accounts can upload new files. Everyone else can still look up customers.
      </p>

      <form onSubmit={submit} className="panel mt-8 space-y-4 p-6">
        <div>
          <label htmlFor="email" className="label-caps">
            Email
          </label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-2 h-11 bg-surface"
          />
        </div>
        <div>
          <label htmlFor="password" className="label-caps">
            Password
          </label>
          <Input
            id="password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 h-11 bg-surface"
          />
        </div>
        <Button type="submit" disabled={busy} className="h-11 w-full gap-2 font-semibold">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
          {mode === "signin" ? "Sign in" : "Create account"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="h-11 w-full"
          onClick={() =>
            lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin })
          }
        >
          Continue with Google
        </Button>
        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="w-full text-xs text-muted-foreground hover:text-foreground"
        >
          {mode === "signin" ? "Need an account? Create one" : "Already have an account? Sign in"}
        </button>
      </form>
    </main>
  );
}
