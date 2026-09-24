import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-[10px] text-[13px] font-semibold transition-[background-color,border-color,box-shadow,transform,color] duration-150 focus-visible:outline-none focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] select-none cursor-pointer",
  {
    variants: {
      variant: {
        primary: "bg-blue-600 text-white hover:bg-blue-700 border border-blue-700 shadow-[0_1px_2px_rgb(20_24_48/0.15),inset_0_1px_0_rgb(255_255_255/0.14)] hover:shadow-md",
        secondary: "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 shadow-xs hover:border-slate-300 hover:text-slate-900",
        outline: "border border-slate-200 bg-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-900",
        ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
        danger: "bg-rose-600 text-white hover:bg-rose-700 border border-rose-700 shadow-[0_1px_2px_rgb(20_24_48/0.15),inset_0_1px_0_rgb(255_255_255/0.14)]",
        success: "bg-emerald-600 text-white hover:bg-emerald-700 border border-emerald-700 shadow-[0_1px_2px_rgb(20_24_48/0.15),inset_0_1px_0_rgb(255_255_255/0.14)]",
        subtle: "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-100",
      },
      size: {
        sm: "h-8 px-3 text-xs gap-1.5",
        md: "h-10 px-4 gap-2",
        lg: "h-11 px-5 text-sm gap-2.5",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin -ml-1 mr-2 h-3.5 w-3.5 text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
