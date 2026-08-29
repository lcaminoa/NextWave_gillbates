import Image from "next/image";
import Link from "next/link";

type PharosBrandProps = {
  href: string;
  className: string;
  label: string;
  priority?: boolean;
};

/**
 * Keeps the approved PHAROS lighthouse mark consistent across the public and
 * product navigations. The simplified mark replaces the full lighthouse only
 * at compact widths.
 */
export function PharosBrand({ href, className, label, priority = false }: PharosBrandProps) {
  return (
    <Link href={href} className={className} aria-label={label}>
      <Image
        className="pharos-brand-tower"
        src="/assets/pharos-hero-lit-static-bone.svg"
        alt=""
        width={58}
        height={56}
        priority={priority}
      />
      <span className="pharos-brand-copy" aria-hidden="true">
        <strong>PHAROS</strong>
        <span>PAYMENT INCIDENT INTELLIGENCE</span>
      </span>
      <Image
        className="pharos-brand-mark"
        src="/assets/pharos-icon-simplified-bone.svg"
        alt=""
        width={28}
        height={28}
      />
    </Link>
  );
}
