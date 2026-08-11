import type { AppProps } from "next/app";
import { NhostProvider } from "@nhost/react";
import { NhostApolloProvider } from "@nhost/react-apollo";
import { nhost } from "@/lib/nhost";
import { ThemeProvider } from "@/lib/theme";
import "@/styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <NhostProvider nhost={nhost}>
      <NhostApolloProvider nhost={nhost}>
        <ThemeProvider>
          <Component {...pageProps} />
        </ThemeProvider>
      </NhostApolloProvider>
    </NhostProvider>
  );
}
