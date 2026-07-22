import type { AppProps } from "next/app";
import dynamic from "next/dynamic";
import "@solana/wallet-adapter-react-ui/styles.css";
import "../styles/globals.css";

// Wallet providers touch the browser `window`, so load them client-side only.
const WalletContextProvider = dynamic(
  () => import("../components/WalletContextProvider"),
  { ssr: false }
);

export default function App({ Component, pageProps }: AppProps) {
  return (
    <WalletContextProvider>
      <Component {...pageProps} />
    </WalletContextProvider>
  );
}
