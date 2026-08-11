import { useEffect } from "react";
import { useRouter } from "next/router";
import { useAuthenticationStatus } from "@nhost/react";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthenticationStatus();

  useEffect(() => {
    if (isLoading) return;
    router.replace(isAuthenticated ? "/dashboard" : "/login");
  }, [isLoading, isAuthenticated, router]);

  return null;
}
