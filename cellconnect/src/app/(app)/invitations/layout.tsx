import type { Metadata } from "next";

export const metadata: Metadata = { title: "Invitations" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
