import Link from "next/link";

export function Brand(): React.ReactNode {
  return <Link className="brand" href="/" aria-label="VibesClone home"><i aria-hidden="true">$_</i><b>vibes<span>clone</span></b></Link>;
}
