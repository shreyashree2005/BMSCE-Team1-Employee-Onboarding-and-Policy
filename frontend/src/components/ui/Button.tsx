import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";

type ButtonVariant = "primary" | "secondary" | "ghost" | "onDark" | "inverse";
type ButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-primary-600 text-white shadow-[0_1px_2px_rgb(27_63_140/0.2),0_6px_14px_-8px_rgb(47_111_237/0.7)] hover:bg-primary-700 hover:shadow-[0_1px_2px_rgb(27_63_140/0.25),0_8px_18px_-8px_rgb(47_111_237/0.75)]",
  secondary: "border border-primary-200 bg-white text-primary-700 hover:border-primary-300 hover:bg-primary-50",
  ghost: "text-primary-600 hover:bg-primary-50",
  onDark: "border border-white/20 bg-white/[0.06] text-white hover:bg-white/[0.12]",
  inverse: "bg-white text-primary-700 shadow-[0_8px_20px_-8px_rgb(13_31_56/0.45)] hover:bg-primary-50",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-3 text-xs",
  md: "h-10 gap-2 px-4 text-sm",
  lg: "h-11 gap-2 px-5 text-sm",
};

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra = ""): string {
  return `focus-ring inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg font-semibold transition-[background-color,border-color,color,transform,box-shadow] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ${variantClasses[variant]} ${sizeClasses[size]} ${extra}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

export function Button({ variant, size, className = "", type = "button", children, ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClasses(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}

interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function ButtonLink({ variant, size, className = "", children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClasses(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}
