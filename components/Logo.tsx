import Image from "next/image";

type LogoProps = { className?: string; variant?: "adaptive" | "white" };

/** Product mark from the approved, outlined SVG assets. */
export function LogoHorizontal({ className = "", variant = "adaptive" }: LogoProps) {
  return (
    <span className={`ventex-logo align-middle ${className}`} role="img" aria-label="Ventex">
      {variant === "white" ? (
        <Image src="/brand/ventex-modular-blanco.svg" alt="" aria-hidden="true" width={299} height={74} unoptimized />
      ) : (
        <>
          <Image src="/brand/ventex-modular.svg" alt="" aria-hidden="true" width={299} height={74} unoptimized className="ventex-logo-light" />
          <Image src="/brand/ventex-modular-blanco.svg" alt="" aria-hidden="true" width={299} height={74} unoptimized className="ventex-logo-dark" />
        </>
      )}
    </span>
  );
}

/** Kept for existing callers; full-name uses the same approved proportions. */
export function LogoVertical({ className = "", variant = "adaptive" }: LogoProps) {
  return <LogoHorizontal className={className} variant={variant} />;
}

/** Independent mark for compact navigation and icon-sized placements. */
export function LogoSymbol({ className = "", variant = "adaptive" }: LogoProps) {
  return (
    <span className={`ventex-logo align-middle ${className}`} role="img" aria-label="Ventex">
      {variant === "white" ? (
        <Image src="/brand/ventex-modular-simbolo-blanco.svg" alt="" aria-hidden="true" width={84} height={74} unoptimized />
      ) : (
        <>
          <Image src="/brand/ventex-modular-simbolo.svg" alt="" aria-hidden="true" width={84} height={74} unoptimized className="ventex-logo-light" />
          <Image src="/brand/ventex-modular-simbolo-blanco.svg" alt="" aria-hidden="true" width={84} height={74} unoptimized className="ventex-logo-dark" />
        </>
      )}
    </span>
  );
}
