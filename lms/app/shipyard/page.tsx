import { Studio } from "@/components/shipyard/studio/studio";
import { hasClerkKeys } from "@/lib/auth/clerk";
export const dynamic = "force-dynamic";
export default function ShipyardPage() {
  return <Studio clerkAvailable={hasClerkKeys()} />;
}
